// Basic on-device engine: PaddleOCR (PP-OCRv5 mobile) in the browser, then the rule-based parser.
import { OCR_MODELS, ORT_WASM_BASE, cachedUrl } from "./models.js";
import { parseReceipt } from "./parseReceipt.js";

let ocrPromise = null;

// One OCR instance per session; models come from the on-device cache
export function getOcr() {
  ocrPromise ??= (async () => {
    const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
    const [detUrl, recUrl] = await Promise.all([cachedUrl(OCR_MODELS.det.url), cachedUrl(OCR_MODELS.rec.url)]);
    return PaddleOCR.create({
      textDetectionModelName: OCR_MODELS.det.name,
      textDetectionModelAsset: { url: detUrl },
      textRecognitionModelName: OCR_MODELS.rec.name,
      textRecognitionModelAsset: { url: recUrl },
      ortOptions: { backend: "wasm", wasmPaths: ORT_WASM_BASE, numThreads: 1 }
    });
  })().catch(e => { ocrPromise = null; throw e; });
  return ocrPromise;
}

export async function readText(file) {
  const ocr = await getOcr();
  const [result] = await ocr.predict(file);
  return result?.items || [];
}

export async function scanBasic(file) {
  return parseReceipt(await readText(file));
}
