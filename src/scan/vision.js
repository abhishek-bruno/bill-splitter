// Bill photo parsing via the user's own vision API key (bring your own key).
// Requests go straight from the device to the chosen provider.

export const PROVIDERS = {
  google: {
    label: "Google Gemini",
    // Alias that tracks Google's current Flash model, so retirements don't break scanning
    defaultModel: "gemini-flash-latest",
    // Aliases that follow Google's newest model in each tier
    models: [
      { id: "gemini-flash-latest", label: "Gemini Flash (latest, free tier)" },
      { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (latest, free tier)" },
      { id: "gemini-pro-latest", label: "Gemini Pro (latest, most capable)" }
    ],
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…"
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-opus-5-5",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 (most capable)" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest)" },
      { id: "claude-opus-5", label: "Claude Opus 5 (previous)" }
    ],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…"
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    models: [
      { id: "gpt-5-mini", label: "GPT-5 mini" },
      { id: "gpt-5", label: "GPT-5 (most capable)" },
      { id: "gpt-5-nano", label: "GPT-5 nano (cheapest)" }
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…"
  }
};

// Pasted keys often carry invisible characters (zero-width or non-breaking spaces, BOMs) that
// browsers refuse to put in a request header. Strip them; anything left must be printable ASCII.
export const cleanApiKey = (key) => (key || "").replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF]/g, "");
export const isValidApiKey = (key) => /^[\x21-\x7E]+$/.test(key);

// Models the providers have retired, mapped to their replacement. Saved configs are upgraded on load.
export const RETIRED_MODELS = {
  "gemini-2.5-flash": "gemini-flash-latest"
};

export const upgradeModel = (config) =>
  config && RETIRED_MODELS[config.model] ? { ...config, model: RETIRED_MODELS[config.model] } : config;

const PROMPT = `Read this restaurant bill or receipt and extract it as JSON.
- restaurant: the venue name, or "" if not visible.
- currency: the currency symbol used (e.g. ₹, $, €, £). Use a symbol, not a code.
- items: each food/product line. Use the line total (quantity × unit price), not the unit price.
- taxes: shared charges applied to the whole bill (GST, VAT, CGST, SGST, service charge, delivery, tip, rounding). Omit discounts and subtotals.
All amounts are plain numbers without currency symbols.`;

const SCHEMA = {
  type: "object",
  properties: {
    restaurant: { type: "string" },
    currency: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, amount: { type: "number" } },
        required: ["name", "amount"],
        additionalProperties: false
      }
    },
    taxes: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, amount: { type: "number" } },
        required: ["name", "amount"],
        additionalProperties: false
      }
    }
  },
  required: ["restaurant", "currency", "items", "taxes"],
  additionalProperties: false
};

// Downscale phone photos (often 4000px+, several MB) so uploads are fast and under provider limits.
export async function prepareImage(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mediaType: "image/jpeg", base64: dataUrl.split(",")[1] };
}

async function httpError(res, provider) {
  let msg = "", reason = "";
  try {
    const body = await res.json();
    const err = (Array.isArray(body) ? body[0] : body)?.error; // Google sometimes wraps errors in an array
    msg = err?.message || "";
    reason = err?.details?.find(d => d.reason)?.reason || "";
  } catch { /* non-JSON body */ }
  if (res.status === 401 || res.status === 403 || reason === "API_KEY_INVALID") return new Error(`${PROVIDERS[provider].label} rejected the API key. Check the key, or change the model.`);
  if (res.status === 429) return new Error(`${PROVIDERS[provider].label} rate limit or quota reached. Try again later.`);
  const error = new Error(msg || `${PROVIDERS[provider].label} request failed (${res.status}).`);
  error.overloaded = isOverloaded(res);
  return error;
}

// 500/502/503/504: provider is temporarily overloaded ("experiencing high demand"); worth retrying.
const isOverloaded = (res) => [500, 502, 503, 504].includes(res.status);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const REQUEST_TIMEOUT_MS = 30000;

// One attempt, capped at REQUEST_TIMEOUT_MS. A timeout is treated like an overload (try the next model).
async function fetchWithTimeout(url, options) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (e) {
    if (e.name !== "TimeoutError") throw e;
    const error = new Error("The request timed out.");
    error.overloaded = true;
    throw error;
  }
}

// Retry overloaded responses once after ~1s. Kept short so a busy provider fails fast.
async function fetchWithRetry(url, options, tries = 2) {
  for (let i = 0; ; i++) {
    const res = await fetchWithTimeout(url, options);
    if (!isOverloaded(res) || i === tries - 1) return res;
    await sleep(1000 + Math.random() * 500);
  }
}

// Tried in order when the chosen Gemini model is overloaded or too slow.
const GOOGLE_FALLBACK_MODELS = ["gemini-flash-lite-latest"];

// Gemini's schema support is a subset of JSON Schema; drop the fields it may reject
const geminiSchema = (schema) => JSON.parse(JSON.stringify(schema, (k, v) => k === "additionalProperties" ? undefined : v));

async function callGoogle(config, img) {
  const models = [config.model, ...GOOGLE_FALLBACK_MODELS.filter(m => m !== config.model)];
  for (let i = 0; ; i++) {
    try {
      return await callGoogleModel({ ...config, model: models[i] }, img);
    } catch (e) {
      if (!e.overloaded) throw e;
      if (i === models.length - 1) throw new Error("Google Gemini is overloaded right now. Try again in a minute, or switch provider in settings.");
    }
  }
}

// generateContent: https://ai.google.dev/api/generate-content
async function callGoogleModel({ apiKey, model }, img) {
  const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: img.mediaType, data: img.base64 } }, { text: PROMPT }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema(SCHEMA) }
    })
  });
  if (!res.ok) throw await httpError(res, "google");
  const data = await res.json();
  // Skip thought-summary parts; only the answer parts hold the JSON
  return data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
}

async function callOpenAI({ apiKey, model }, img) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
          { type: "text", text: PROMPT }
        ]
      }],
      response_format: { type: "json_schema", json_schema: { name: "bill", strict: true, schema: SCHEMA } }
    })
  });
  if (!res.ok) throw await httpError(res, "openai");
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic({ apiKey, model }, img) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  // Server-side refusal fallback is offered on these models (not Haiku).
  const fallback = /^claude-(opus-5|opus-5-5|sonnet-5-5|fable-5-1|fable-5-2)$/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
    : null;
  const params = {
    model,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
        { type: "text", text: PROMPT }
      ]
    }]
  };
  let response;
  try {
    response = fallback
      ? await client.beta.messages.create({ ...params, ...fallback })
      : await client.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new Error("Anthropic rejected the API key. Check the key, or change the model.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Anthropic rate limit reached. Try again later.");
    if (e instanceof Anthropic.APIError) throw new Error(e.error?.error?.message || e.message);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new Error("The model declined to read this image.");
  return response.content.filter(b => b.type === "text").map(b => b.text).join("");
}

const CALLERS = { google: callGoogle, openai: callOpenAI, anthropic: callAnthropic };

const CODE_TO_SYMBOL = { INR: "₹", RS: "₹", "RS.": "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", PHP: "₱", THB: "฿" };

function normalize(raw) {
  const num = (v) => Math.round(parseFloat(String(v).replace(/[^0-9.-]/g, "")) * 100) / 100;
  const rows = (list, prefix) => (Array.isArray(list) ? list : [])
    .map((x, i) => ({ id: `${prefix}${Date.now()}-${i}`, name: String(x?.name || "").trim(), amount: num(x?.amount) }))
    .filter(x => x.name && (prefix === "t" ? x.amount !== 0 && !Number.isNaN(x.amount) : x.amount > 0)); // charges can be negative (discounts)
  const cur = String(raw?.currency || "").trim();
  return {
    restaurant: String(raw?.restaurant || "").trim(),
    currency: CODE_TO_SYMBOL[cur.toUpperCase()] || cur || "₹",
    items: rows(raw?.items, "i"),
    taxes: rows(raw?.taxes, "t")
  };
}

// On-device engines are "local-<engine id>" providers (see src/local/models.js); they need no key or network
export const isLocalProvider = (provider) => typeof provider === "string" && provider.startsWith("local-");

async function scanOnDevice(file, provider) {
  const id = provider.slice("local-".length);
  const { isEngineReady } = await import("./models.js");
  if (!(await isEngineReady(id))) throw new Error("On Device AI isn't downloaded on this device. Download it again in Settings.");
  const { scanBasic } = await import("./basicScan.js");
  const r = await scanBasic(file, id);
  const bill = normalize({
    restaurant: r.restaurant, currency: r.currency,
    items: r.items,
    // A discount is a negative shared charge; the round-off becomes the bill's round-off switch
    taxes: [...r.taxes, ...(r.discount > 0 ? [{ name: "Discount", amount: -r.discount }] : [])]
  });
  bill.roundOff = Math.abs(r.round) > 0.001;
  if (bill.items.length === 0) throw new Error("Couldn't find items on this bill. Try a clearer, straight photo, or type it in.");
  bill.scanCheck = r.check; // printed vs computed total, shown on the review screen
  return bill;
}

export async function parseBillImage(file, config) {
  if (isLocalProvider(config.provider)) return scanOnDevice(file, config.provider);
  if (!navigator.onLine) throw new Error("You're offline. Scanning needs internet; enter the bill manually instead.");
  const img = await prepareImage(file);
  const apiKey = cleanApiKey(config.apiKey);
  if (!isValidApiKey(apiKey)) throw new Error("The saved API key contains characters that aren't allowed. Paste it again in settings.");
  const text = await CALLERS[config.provider]({ ...upgradeModel(config), apiKey }, img);
  let raw;
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    // Tolerate stray text around the JSON object
    const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
    raw = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    console.warn("Unparseable bill scan response:", text);
    throw new Error(text.trim()
      ? "Couldn't understand the model's response. Try a clearer photo, or type it in."
      : "The model returned an empty response. Try again, or type it in.");
  }
  const bill = normalize(raw);
  if (bill.items.length === 0) throw new Error("No items found on the bill. Try a clearer photo, or type it in.");
  return bill;
}
