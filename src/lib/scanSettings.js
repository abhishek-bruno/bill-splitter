import { loadSecret, saveSecret } from "./secureStore.js";
import { ENGINES } from "../scan/models.js";
import { PROVIDERS, cleanApiKey, isLocalProvider, upgradeModel } from "../scan/vision.js";

// Loads the saved vision config, replacing a retired model with its successor and saving that back
// Saved cloud keys, one per provider ({ google: { apiKey, model }, ... }), kept apart from the active choice
// so switching readers (or providers) never loses a key. Includes the active cloud key from older saves.
export async function loadVisionKeys(active) {
  const keys = (await loadSecret("visionKeys").catch(() => null)) || {};
  if (active?.apiKey && PROVIDERS[active.provider] && !keys[active.provider]) keys[active.provider] = { apiKey: active.apiKey, model: active.model };
  return keys;
}

export async function rememberCloudKey(cfg) {
  if (!PROVIDERS[cfg?.provider] || !cfg.apiKey) return;
  const keys = await loadVisionKeys(null);
  keys[cfg.provider] = { apiKey: cfg.apiKey, model: cfg.model };
  await saveSecret("visionKeys", keys);
}

export async function forgetCloudKey(provider) {
  const keys = await loadVisionKeys(null);
  delete keys[provider];
  await saveSecret("visionKeys", keys);
}

export async function loadVisionConfig() {
  const saved = await loadSecret("vision");
  if (!saved) return saved;
  const upgraded = { ...upgradeModel(saved), apiKey: cleanApiKey(saved.apiKey) };
  if (upgraded.model !== saved.model || upgraded.apiKey !== saved.apiKey) await saveSecret("vision", upgraded);
  return upgraded;
}

// "Google Gemini" or "On Device AI (Basic)" for a saved config
export const readerLabel = (cfg) => isLocalProvider(cfg?.provider)
  ? `On Device AI (${ENGINES[cfg.provider.slice(6)]?.label || "Basic"})`
  : PROVIDERS[cfg?.provider]?.label || "";

// The scanned bill photo survives a refresh: a reduced JPEG kept in Cache Storage until the split is reset
export const PHOTO_CACHE = "spliteasy-scan-photo", PHOTO_KEY = "/scan-photo";

export async function storeScanPhoto(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
    canvas.width = canvas.height = 0;
    await (await caches.open(PHOTO_CACHE)).put(PHOTO_KEY, new Response(blob, { headers: { "Content-Type": "image/jpeg" } }));
  } catch { /* storage unavailable: the photo just won't survive a refresh */ }
}

export async function loadScanPhoto() {
  try {
    const res = await (await caches.open(PHOTO_CACHE)).match(PHOTO_KEY);
    return res ? new File([await res.blob()], "bill.jpg", { type: "image/jpeg" }) : null;
  } catch { return null; }
}

export const clearScanPhoto = () => { try { caches.delete(PHOTO_CACHE); } catch { /* unavailable */ } };
