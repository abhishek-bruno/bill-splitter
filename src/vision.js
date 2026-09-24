// Bill photo parsing via the user's own vision API key (bring your own key).
// Requests go straight from the device to the chosen provider.

export const PROVIDERS = {
  google: {
    label: "Google Gemini",
    // Alias that tracks Google's current Flash model, so retirements don't break scanning
    defaultModel: "gemini-flash-latest",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…"
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-opus-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…"
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…"
  }
};

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
  if (res.status === 401 || res.status === 403 || reason === "API_KEY_INVALID") return new Error(`${PROVIDERS[provider].label} rejected the API key. Check it in settings.`);
  if (res.status === 429) return new Error(`${PROVIDERS[provider].label} rate limit or quota reached. Try again later.`);
  return new Error(msg || `${PROVIDERS[provider].label} request failed (${res.status}).`);
}

// Gemini's schema support is a subset of JSON Schema; drop the fields it may reject
const geminiSchema = (schema) => JSON.parse(JSON.stringify(schema, (k, v) => k === "additionalProperties" ? undefined : v));

// Interactions API: https://ai.google.dev/gemini-api/docs/interactions-overview
async function callGoogle(config, img) {
  const { apiKey, model } = config;
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model,
      input: [
        { type: "text", text: PROMPT },
        { type: "image", data: img.base64, mime_type: img.mediaType }
      ],
      response_format: { type: "text", mime_type: "application/json", schema: geminiSchema(SCHEMA) }
    })
  });
  // Older models or regions without the Interactions API: fall back to generateContent
  if (res.status === 404) return callGoogleGenerateContent(config, img);
  if (!res.ok) throw await httpError(res, "google");
  const data = await res.json();
  const it = data.interaction ?? data;
  return it.output_text ?? it.outputText
    ?? (it.outputs || []).filter(o => o.type === "text").map(o => o.text).join("");
}

async function callGoogleGenerateContent({ apiKey, model }, img) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: img.mediaType, data: img.base64 } }, { text: PROMPT }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });
  if (!res.ok) throw await httpError(res, "google");
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
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
  // Server-side refusal fallback is only offered on the top-tier models.
  const fallback = /^claude-(opus-5|fable-5-1)$/.test(model)
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
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new Error("Anthropic rejected the API key. Check it in settings.");
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
    .filter(x => x.name && x.amount > 0);
  const cur = String(raw?.currency || "").trim();
  return {
    restaurant: String(raw?.restaurant || "").trim(),
    currency: CODE_TO_SYMBOL[cur.toUpperCase()] || cur || "₹",
    items: rows(raw?.items, "i"),
    taxes: rows(raw?.taxes, "t")
  };
}

export async function parseBillImage(file, config) {
  if (!navigator.onLine) throw new Error("You're offline. Scanning needs internet; enter the bill manually instead.");
  const img = await prepareImage(file);
  const text = await CALLERS[config.provider](upgradeModel(config), img);
  let raw;
  try {
    raw = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Couldn't understand the model's response. Try a clearer photo or enter manually.");
  }
  const bill = normalize(raw);
  if (bill.items.length === 0) throw new Error("No items found on the bill. Try a clearer photo or enter manually.");
  return bill;
}
