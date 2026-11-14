// On-device bill reading engines. Nothing is downloaded until the user agrees; files then live in a
// dedicated Cache Storage bucket so scanning works offline, and the service worker serves them from
// there (see runtimeCaching in vite.config.js).

export const MODEL_CACHE = "spliteasy-models-v1";

const ORT_VERSION = "1.31.1"; // must match the onnxruntime-web the OCR SDK was built with
export const ORT_WASM_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const PADDLE_BASE = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/";

export const OCR_MODELS = {
  det: { name: "PP-OCRv5_mobile_det", url: `${PADDLE_BASE}PP-OCRv5_mobile_det_onnx_infer.tar` },
  rec: { name: "PP-OCRv5_mobile_rec", url: `${PADDLE_BASE}PP-OCRv5_mobile_rec_onnx_infer.tar` }
};
// ONNX Runtime's WebAssembly build (single-threaded works without special server headers)
// (the SDK's build of the runtime loads the jsep variant, which covers both WebAssembly and WebGPU)
const ORT_FILES = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"].map(f => ORT_WASM_BASE + f);

export const ENGINES = {
  basic: {
    label: "Basic",
    sizeMB: 50,
    blurb: "Reads the text and picks out items with simple rules. Best on clear, printed bills.",
    source: "PaddlePaddle's model server and the jsDelivr CDN",
    files: [OCR_MODELS.det.url, OCR_MODELS.rec.url, ...ORT_FILES]
  }
};

const markKey = (id) => `spliteasy:engine:${id}`;

// Ready = the user finished a download and every file is still cached (browsers can evict storage)
export async function isEngineReady(id) {
  const engine = ENGINES[id];
  if (!engine || typeof caches === "undefined") return false;
  try {
    if (localStorage.getItem(markKey(id)) !== "1") return false;
    const cache = await caches.open(MODEL_CACHE);
    for (const url of engine.files) if (!(await cache.match(url))) return false;
    return true;
  } catch { return false; }
}

// Downloads every file of an engine into the model cache, reporting progress as 0..1.
// Already-cached files are skipped, so an interrupted download resumes where it left off.
export async function downloadEngine(id, { onProgress, signal } = {}) {
  const engine = ENGINES[id];
  const cache = await caches.open(MODEL_CACHE);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  const todo = [];
  for (const url of engine.files) if (!(await cache.match(url))) todo.push(url);
  const expected = engine.sizeMB * 1024 * 1024;
  let done = expected * (1 - todo.length / engine.files.length) * 0.5; // rough credit for files already here
  onProgress?.(Math.min(done / expected, 0.99));
  for (const url of todo) {
    // no-store: some model servers echo the Origin without "Vary: Origin", so a browser-cached copy can
    // fail CORS later; the file goes into our own cache anyway
    const res = await fetch(url, { signal, mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error(`Download failed (${res.status}). Check your connection and try again.`);
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      done += value.length;
      onProgress?.(Math.min(done / expected, 0.99));
    }
    await cache.put(url, new Response(new Blob(chunks), { headers: { "Content-Type": res.headers.get("Content-Type") || "application/octet-stream" } }));
  }
  try { localStorage.setItem(markKey(id), "1"); } catch { /* storage unavailable */ }
  onProgress?.(1);
}

// Frees an engine's files, keeping any that another downloaded engine still needs
export async function removeEngine(id) {
  try { localStorage.removeItem(markKey(id)); } catch { /* storage unavailable */ }
  const keep = new Set();
  for (const [other, engine] of Object.entries(ENGINES)) {
    if (other !== id && (await isEngineReady(other))) engine.files.forEach(f => keep.add(f));
  }
  const cache = await caches.open(MODEL_CACHE);
  await Promise.all(ENGINES[id].files.filter(f => !keep.has(f)).map(f => cache.delete(f)));
}

// A cached file as a blob: URL, so libraries that fetch by URL read from the cache, not the network
export async function cachedUrl(url) {
  const cache = await caches.open(MODEL_CACHE);
  const res = await cache.match(url);
  if (!res) throw new Error("On Device AI isn't fully downloaded. Download it again in Settings.");
  return URL.createObjectURL(await res.blob());
}
