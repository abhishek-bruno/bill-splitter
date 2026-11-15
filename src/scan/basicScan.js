// On-device engines: PaddleOCR in the browser (the level picks the text models), then the rule-based parser.
import { ENGINES, ORT_WASM_BASE, cachedUrl } from "./models.js";
import { parseReceipt } from "./parseReceipt.js";

// Each scan gets its own OCR worker, which is shut down afterwards. WebAssembly memory (ONNX Runtime,
// OpenCV) only ever grows inside a page, so reusing one instance can run a phone out of memory by the
// second or third photo; ending the worker hands all of it back to the browser.
async function createOcr(engine = "basic") {
  const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
  const models = ENGINES[engine].ocr;
  const urls = await Promise.all([cachedUrl(models.det.url), cachedUrl(models.rec.url)]);
  try {
    return await PaddleOCR.create({
      worker: true,
      textDetectionModelName: models.det.name,
      textDetectionModelAsset: { url: urls[0] },
      textRecognitionModelName: models.rec.name,
      textRecognitionModelAsset: { url: urls[1] },
      ortOptions: { backend: "wasm", wasmPaths: ORT_WASM_BASE, numThreads: 1 }
    });
  } finally {
    urls.forEach(u => URL.revokeObjectURL(u)); // models are loaded by now; drop the blob copies
  }
}

// Phone photos are often 12+ megapixels; the OCR crops each line from the full image. Scale down first
// (long side 1800px keeps receipt text readable), honouring the photo's rotation.
async function shrink(file, maxSide = 1800) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

export async function readText(file, engine = "basic") {
  const canvas = await shrink(file);
  let ocr = null;
  try {
    ocr = await createOcr(engine);
    const [result] = await ocr.predict(canvas);
    return result?.items || [];
  } finally {
    canvas.width = canvas.height = 0; // release the pixels right away
    await ocr?.dispose().catch(() => {});
  }
}

// Start and stop the OCR worker once right after the download, so the worker's own code and runtime are
// fetched (and cached by the service worker) while online; the first real scan can then happen offline
export async function warmUp(engine = "basic") {
  const ocr = await createOcr(engine);
  await ocr.dispose().catch(() => {});
}

export async function scanBasic(file, engine = "basic") {
  return parseReceipt(await readText(file, engine));
}
