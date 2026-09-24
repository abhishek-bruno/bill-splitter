import { useState, useEffect, useRef } from "react";
import { PROVIDERS, parseBillImage, upgradeModel, cleanApiKey, isValidApiKey } from "./vision.js";
import { saveSecret, loadSecret, deleteSecret, clearAllSecrets } from "./secureStore.js";
import InstallBanner from "./InstallPrompt.jsx";
import { UPI_ID_PATTERN, supportsUpi, buildShareText, buildGroupShareText, shareOrCopy } from "./payment.js";

const COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"
];

function Avatar({ name, color, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#fff",
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
      fontFamily: "inherit"
    }}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function StepBar({ current }) {
  const labels = ["Bill", "People", "Assign", "Summary"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {labels.map((l, i) => (
        <div key={l} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? 1 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i <= current ? "var(--accent)" : "var(--border)",
              color: i <= current ? "#fff" : "var(--subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, transition: "all .2s"
            }}>{i + 1}</div>
            <span style={{ fontSize: 10, color: i === current ? "var(--accent)" : "var(--subtle)", fontWeight: 600, whiteSpace: "nowrap" }}>{l}</span>
          </div>
          {i < labels.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? "var(--accent)" : "var(--border)", margin: "0 6px", marginBottom: 18, transition: "all .2s" }} />
          )}
        </div>
      ))}
    </div>
  );
}

const inputStyle = {
  width: "100%", border: "1.5px solid var(--border)", borderRadius: 8,
  padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", color: "var(--text)", background: "var(--surface)"
};

const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4, display: "block" };

// ── Step 1: Bill Entry ────────────────────────────────────────────────────────
const blankItem = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", amount: "" });
const toRows = (list, fallbackId) => list?.length
  ? list.map(x => ({ ...x, amount: String(x.amount) }))
  : [{ id: fallbackId, name: "", amount: "" }];

// Keeps a most-recent-first list of remembered strings, deduped case-insensitively
const remember = (list, values, max) => {
  const fresh = values.map(v => v.trim()).filter(Boolean);
  const merged = [...fresh, ...list];
  return merged.filter((v, i) => merged.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i).slice(0, max);
};
const forget = (list, value) => list.filter(x => x.toLowerCase() !== value.toLowerCase());

// Red text button with an inline "Yes / No" confirm, skipped when needsConfirm is false
function ConfirmButton({ label, prompt, onConfirm, needsConfirm = true, style }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, ...style }}>
      <span style={{ color: "var(--muted)" }}>{prompt}</span>
      <button onClick={onConfirm} style={{ ...linkBtn, color: "var(--danger)", fontWeight: 700 }}>Yes</button>
      <button onClick={() => setConfirming(false)} style={{ ...linkBtn, fontWeight: 600 }}>No</button>
    </div>
  );
  return (
    <button onClick={() => needsConfirm ? setConfirming(true) : onConfirm()} style={{ ...linkBtn, color: "var(--danger)", fontWeight: 600, ...style }}>
      {label}
    </button>
  );
}

// Clears the current split, asking first when there is something to lose
const ResetButton = ({ onReset, hasData }) => (
  <ConfirmButton label="↺ Reset" prompt="Delete progress?" onConfirm={onReset} needsConfirm={hasData} />
);

// Top navigation row shown on every screen: Back on the left, Reset on the right
function TopBar({ onBack, onReset, hasData }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 24, marginBottom: 16 }}>
      {onBack ? <button onClick={onBack} style={linkBtn}>← Back</button> : <span />}
      <ResetButton onReset={onReset} hasData={hasData} />
    </div>
  );
}

// Primary action pinned to the bottom of the screen while scrolling; bleed cancels the parent's padding
function StickyFooter({ children, bleed = false }) {
  return (
    <div className="sticky-footer" style={{
      zIndex: 1, background: "var(--surface)",
      ...(bleed && { marginLeft: -24, marginRight: -24, marginBottom: -24 }),
      padding: "12px 24px calc(16px + env(safe-area-inset-bottom))",
      borderTop: "1px solid var(--divider)"
    }}>
      {children}
    </div>
  );
}

const CURRENCIES = [
  { symbol: "₹", code: "INR" }, { symbol: "$", code: "USD" }, { symbol: "€", code: "EUR" },
  { symbol: "£", code: "GBP" }, { symbol: "¥", code: "JPY" }, { symbol: "₱", code: "PHP" },
  { symbol: "฿", code: "THB" }
];

const linkBtn = {
  background: "none", border: "none", color: "var(--muted)", cursor: "pointer",
  fontSize: 13, padding: 0, display: "flex", alignItems: "center", gap: 4
};

// Loads the saved vision config, replacing a retired model with its successor and saving that back
async function loadVisionConfig() {
  const saved = await loadSecret("vision");
  if (!saved) return saved;
  const upgraded = { ...upgradeModel(saved), apiKey: cleanApiKey(saved.apiKey) };
  if (upgraded.model !== saved.model || upgraded.apiKey !== saved.apiKey) await saveSecret("vision", upgraded);
  return upgraded;
}

function ApiKeySettings({ config, onSave, onCancel }) {
  const [provider, setProvider] = useState(config?.provider || "google");
  const [apiKey, setApiKey] = useState(config?.apiKey || "");
  const [model, setModel] = useState(config?.model || PROVIDERS[config?.provider || "google"].defaultModel);
  const [saving, setSaving] = useState(false);
  const p = PROVIDERS[provider];

  const pick = (id) => {
    setProvider(id);
    setApiKey(id === config?.provider ? config.apiKey : "");
    setModel(id === config?.provider ? config.model : PROVIDERS[id].defaultModel);
  };

  const cleanedKey = cleanApiKey(apiKey);
  const keyInvalid = cleanedKey !== "" && !isValidApiKey(cleanedKey);

  const save = async () => {
    setSaving(true);
    await onSave({ provider, apiKey: cleanedKey, model: model.trim() || p.defaultModel });
    setSaving(false);
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 4 }}>Connect a vision API</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Use your own key to read bill photos. You pay the provider directly; a scan costs well under a cent.</div>

      <label style={labelStyle}>Provider</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {Object.entries(PROVIDERS).map(([id, info]) => (
          <button key={id} onClick={() => pick(id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            border: `1.5px solid ${provider === id ? "var(--accent)" : "var(--border)"}`,
            background: provider === id ? "var(--accent-soft)" : "var(--surface)",
            color: provider === id ? "var(--accent)" : "var(--muted)"
          }}>{info.label}</button>
        ))}
      </div>

      <label style={labelStyle}>API key</label>
      <input
        type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
        placeholder={p.keyHint} autoComplete="off" spellCheck={false}
        style={{ ...inputStyle, marginBottom: 4 }}
      />
      {keyInvalid && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 4 }}>
          This key has characters that aren't allowed. Copy it again from {p.label}.
        </div>
      )}
      <a href={p.keyUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", display: "inline-block", marginBottom: 14 }}>Get a {p.label} key ↗</a>

      <label style={labelStyle}>Model</label>
      <input value={model} onChange={e => setModel(e.target.value)} placeholder={p.defaultModel} spellCheck={false} style={{ ...inputStyle, marginBottom: 14 }} />

      <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, lineHeight: 1.5 }}>
        🔒 The key is encrypted and kept only on this device. It is sent only to {p.label} when you scan a bill.
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, border: "1.5px solid var(--border)", background: "var(--surface)", borderRadius: 10, padding: 12, fontWeight: 600, cursor: "pointer", color: "var(--text-2)" }}>Cancel</button>
        <button onClick={save} disabled={!cleanedKey || keyInvalid || saving} style={{
          flex: 2, border: "none", borderRadius: 10, padding: 12, fontWeight: 700,
          background: cleanedKey && !keyInvalid ? "var(--accent)" : "var(--border)", color: cleanedKey && !keyInvalid ? "#fff" : "var(--subtle)",
          cursor: cleanedKey && !keyInvalid ? "pointer" : "default"
        }}>{saving ? "Saving…" : "Save key"}</button>
      </div>
    </div>
  );
}

function BillStep({ initial, onDone, onReset, keyVersion, mode, setMode, onBack }) {
  const [error, setError] = useState("");
  const [restaurant, setRestaurant] = useState(initial?.restaurant === "My Bill" ? "" : initial?.restaurant || "");
  const [currency, setCurrency] = useState(initial?.currency || "₹");
  const [items, setItems] = useState(() => toRows(initial?.items, "1"));
  const [taxes, setTaxes] = useState(() => toRows(initial?.taxes, "t1"));

  // Photo scanning
  const [apiConfig, setApiConfig] = useState(undefined); // undefined = loading, null = not set
  const [editingKey, setEditingKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const cameraRef = useRef();
  const galleryRef = useRef();

  useEffect(() => {
    loadVisionConfig().then(setApiConfig).catch(() => setApiConfig(null));
  }, [keyVersion]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const saveConfig = async (cfg) => {
    await saveSecret("vision", cfg);
    setApiConfig(cfg);
    setEditingKey(false);
    setError("");
  };

  const removeConfig = async () => {
    await deleteSecret("vision");
    setApiConfig(null);
    setEditingKey(false);
  };

  const [lastFile, setLastFile] = useState(null); // kept so a failed scan can be retried without retaking the photo

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) { setError("Please choose an image file."); setLastFile(null); return; }
    setPreview(URL.createObjectURL(file));
    setLastFile(file);
    scanFile(file);
  };

  const scanFile = async (file) => {
    setError("");
    setLoading(true);
    try {
      const bill = await parseBillImage(file, apiConfig);
      setRestaurant(bill.restaurant);
      if (bill.currency) setCurrency(bill.currency);
      setItems(toRows(bill.items, "1"));
      setTaxes(toRows(bill.taxes, "t1"));
      setScanned(true);
      setMode("manual");
    } catch (e) {
      setError(e.message || "Could not read the bill.");
    } finally {
      setLoading(false);
    }
  };

  // Focus the name field of a newly added row once it has rendered
  const [focusRowId, setFocusRowId] = useState(null);
  useEffect(() => {
    if (!focusRowId) return;
    document.querySelector(`[data-row-name="${focusRowId}"]`)?.focus();
    setFocusRowId(null);
  }, [focusRowId]);

  const addItem = () => { const row = blankItem(); setItems(prev => [...prev, row]); setFocusRowId(row.id); };
  const removeItem = (id) => setItems(prev => prev.filter(x => x.id !== id));
  const updateItem = (id, field, val) => setItems(prev => prev.map(x => x.id === id ? { ...x, [field]: val } : x));

  const addTax = () => { const row = blankItem(); setTaxes(prev => [...prev, row]); setFocusRowId(row.id); };
  const removeTax = (id) => setTaxes(prev => prev.filter(x => x.id !== id));
  const updateTax = (id, field, val) => setTaxes(prev => prev.map(x => x.id === id ? { ...x, [field]: val } : x));

  const submitManual = () => {
    const validItems = items.filter(i => i.name.trim() && parseFloat(i.amount) > 0)
      .map(i => ({ ...i, name: i.name.trim(), amount: parseFloat(i.amount) }));
    if (validItems.length === 0) { setError("Add at least one item with a name and amount."); return; }
    const validTaxes = taxes.filter(t => t.name.trim() && parseFloat(t.amount) > 0)
      .map(t => ({ ...t, name: t.name.trim(), amount: parseFloat(t.amount) }));
    const total = validItems.reduce((s, i) => s + i.amount, 0) + validTaxes.reduce((s, t) => s + t.amount, 0);
    onDone({
      restaurant: restaurant.trim() || "My Bill",
      currency,
      items: validItems,
      taxes: validTaxes,
      total
    });
  };

  const formHasData = !!restaurant.trim() || [...items, ...taxes].some(x => x.name.trim() || String(x.amount).trim());
  // Mode changes can come from the browser back button, so reset per-screen state here
  useEffect(() => {
    setError(""); setEditingKey(false);
    if (mode !== "upload") setPreview(null);
  }, [mode]);

  const goLanding = onBack;
  const topBar = <TopBar onBack={goLanding} onReset={onReset} hasData={formHasData} />;

  // Landing: pick mode
  const scanDefault = !!apiConfig && online;
  const optionStyle = (primary) => ({
    display: "flex", alignItems: "center", gap: 14, borderRadius: 14, padding: "16px 18px",
    cursor: "pointer", textAlign: "left", width: "100%",
    border: `1.5px solid ${primary ? "var(--accent)" : "var(--border)"}`, background: primary ? "var(--accent-soft)" : "var(--surface)"
  });

  if (!mode) return (
    <div className="fill">
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 6 }}>How do you want to add the bill?</div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>Scan a photo or enter items manually</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={() => { setMode("upload"); setError(""); }} style={optionStyle(scanDefault)}>
          <div style={{ fontSize: 32 }}>🧾</div>
          <div>
            <div style={{ fontWeight: 700, color: scanDefault ? "var(--accent)" : "var(--text)", fontSize: 14 }}>Scan bill photo</div>
            <div style={{ fontSize: 12, color: scanDefault ? "var(--accent-muted)" : "var(--subtle)", marginTop: 2 }}>
              {!online ? "Needs internet. You're offline right now."
                : apiConfig ? `AI reads the items using ${PROVIDERS[apiConfig.provider].label}`
                : "AI reads the items using your own Gemini, Claude or OpenAI key"}
            </div>
          </div>
        </button>
        <button onClick={() => setMode("manual")} style={optionStyle(!scanDefault)}>
          <div style={{ fontSize: 32 }}>✏️</div>
          <div>
            <div style={{ fontWeight: 700, color: scanDefault ? "var(--text)" : "var(--accent)", fontSize: 14 }}>Enter manually</div>
            <div style={{ fontSize: 12, color: scanDefault ? "var(--subtle)" : "var(--accent-muted)", marginTop: 2 }}>Type in items, amounts and charges yourself. Works offline.</div>
          </div>
        </button>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        <InstallBanner />
      </div>
    </div>
  );

  // Upload mode
  if (mode === "upload") {
    if (apiConfig === undefined) return <div>{topBar}</div>;
    if (!apiConfig || editingKey) return (
      <div>
        {topBar}
        <ApiKeySettings config={apiConfig} onSave={saveConfig} onCancel={() => apiConfig ? setEditingKey(false) : goLanding()} />
        {apiConfig && (
          <button onClick={removeConfig} style={{ ...linkBtn, color: "var(--danger)", margin: "16px auto 0" }}>Remove saved key</button>
        )}
      </div>
    );
    return (
      <div>
        {topBar}
        {!online && (
          <div style={{ fontSize: 13, color: "var(--warn-text)", background: "var(--warn-soft)", border: "1px solid var(--warn-border)", borderRadius: 8, padding: "8px 14px", marginBottom: 12 }}>
            You're offline. Scanning needs internet.
          </div>
        )}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); !loading && handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragging ? "var(--accent)" : "var(--border-strong)"}`,
            borderRadius: 16, padding: "28px 20px", textAlign: "center",
            background: dragging ? "var(--accent-soft)" : "var(--surface-2)", transition: "all .2s", minHeight: 180,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12
          }}
        >
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
          <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
          {preview && <img src={preview} alt="bill" style={{ maxHeight: 200, maxWidth: "100%", borderRadius: 8, objectFit: "contain", opacity: loading ? 0.5 : 1 }} />}
          {loading ? (
            <>
              <div style={{ color: "var(--accent)", fontWeight: 600 }}>Reading your bill…</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: `bounce .8s ${i*0.15}s infinite alternate` }} />)}
              </div>
            </>
          ) : (
            <>
              {!preview && <div style={{ fontSize: 40 }}>🧾</div>}
              {!preview && <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Add a photo of the bill</div>}
              <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 320 }}>
                <button onClick={() => cameraRef.current.click()} disabled={!online} style={{
                  flex: 1, border: "none", borderRadius: 10, padding: "11px 8px", fontWeight: 700, fontSize: 14,
                  background: online ? "var(--accent)" : "var(--border)", color: online ? "#fff" : "var(--subtle)", cursor: online ? "pointer" : "default"
                }}>📷 {preview ? "Retake" : "Camera"}</button>
                <button onClick={() => galleryRef.current.click()} disabled={!online} style={{
                  flex: 1, border: "1.5px solid var(--border)", borderRadius: 10, padding: "11px 8px", fontWeight: 600, fontSize: 14,
                  background: "var(--surface)", color: online ? "var(--text-2)" : "var(--subtle)", cursor: online ? "pointer" : "default"
                }}>🖼️ Gallery</button>
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 12, fontSize: 13, color: "var(--subtle)" }}>
          Using {PROVIDERS[apiConfig.provider].label} ·
          <button onClick={() => setEditingKey(true)} disabled={loading} style={{ ...linkBtn, color: "var(--accent)", fontWeight: 600 }}>Change</button>
        </div>
        {error && (
          <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13, background: "var(--danger-soft)", borderRadius: 8, padding: "10px 14px" }}>
            <div>{error}</div>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              {lastFile && (
                <button onClick={() => scanFile(lastFile)} disabled={!online} style={{ color: online ? "var(--accent)" : "var(--subtle)", background: "none", border: "none", cursor: online ? "pointer" : "default", fontWeight: 700, fontSize: 13, padding: 0 }}>↻ Retry</button>
              )}
              <button onClick={() => { setMode("manual"); setError(""); }} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, padding: 0 }}>Enter manually →</button>
            </div>
          </div>
        )}
        <style>{`@keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-6px); } }`}</style>
      </div>
    );
  }

  // Manual mode (also used to review scanned results)
  const manualValid = items.some(i => i.name.trim() && parseFloat(i.amount) > 0);
  const scannedTotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) + taxes.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  return (
    <div className="fill">
      {topBar}
      {scanned && (
        <div style={{ fontSize: 13, color: "var(--success-text)", background: "var(--success-soft)", border: "1px solid var(--success-border)", borderRadius: 8, padding: "8px 14px", marginBottom: 16 }}>
          ✓ Scanned. Check the items against the bill (total {currency}{scannedTotal.toFixed(2)}) and fix anything the AI misread.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Restaurant / Place</label>
          <input value={restaurant} onChange={e => setRestaurant(e.target.value)} placeholder="e.g. Pizza Hut" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {!CURRENCIES.some(c => c.symbol === currency) && <option value={currency}>{currency}</option>}
            {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} {c.code}</option>)}
          </select>
        </div>
      </div>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Items</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        {items.map((item, idx) => (
          <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={item.name} onChange={e => updateItem(item.id, "name", e.target.value)}
              placeholder={`Item ${idx + 1} name`} data-row-name={item.id}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <div style={{ position: "relative", flex: "0 0 116px" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--subtle)", fontSize: 13 }}>{currency}</span>
              <input
                value={item.amount} onChange={e => updateItem(item.id, "amount", e.target.value)}
                placeholder="0.00" type="number" inputMode="decimal" min="0" step="0.01"
                style={{ ...inputStyle, paddingLeft: 24 }}
              />
            </div>
            {items.length > 1 && (
              <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "var(--border-strong)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addItem} style={{
        background: "none", border: "1.5px dashed var(--border-strong)", borderRadius: 8,
        padding: "8px 14px", color: "var(--subtle)", cursor: "pointer", fontSize: 13,
        width: "100%", marginBottom: 20
      }}>+ Add item</button>

      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
        Shared Charges
        <span style={{ fontWeight: 400, fontSize: 12, color: "var(--subtle)", marginLeft: 6 }}>(tax, service charge, etc.)</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--subtle)", marginBottom: 10 }}>These will be split equally among everyone</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        {taxes.map(tax => (
          <div key={tax.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={tax.name} onChange={e => updateTax(tax.id, "name", e.target.value)}
              placeholder={`e.g. GST, Service Charge`} data-row-name={tax.id}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <div style={{ position: "relative", flex: "0 0 116px" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--subtle)", fontSize: 13 }}>{currency}</span>
              <input
                value={tax.amount} onChange={e => updateTax(tax.id, "amount", e.target.value)}
                placeholder="0.00" type="number" inputMode="decimal" min="0" step="0.01"
                style={{ ...inputStyle, paddingLeft: 24 }}
              />
            </div>
            {taxes.length > 1 && (
              <button onClick={() => removeTax(tax.id)} style={{ background: "none", border: "none", color: "var(--border-strong)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addTax} style={{
        background: "none", border: "1.5px dashed var(--border-strong)", borderRadius: 8,
        padding: "8px 14px", color: "var(--subtle)", cursor: "pointer", fontSize: 13,
        width: "100%", marginBottom: 20
      }}>+ Add charge</button>

      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <StickyFooter bleed>
        <button onClick={submitManual} disabled={!manualValid} style={{
          width: "100%", border: "none",
          background: manualValid ? "var(--accent)" : "var(--border)",
          color: manualValid ? "#fff" : "var(--subtle)",
          borderRadius: 10, padding: 13, fontWeight: 700,
          cursor: manualValid ? "pointer" : "default", fontSize: 15, transition: "all .2s"
        }}>
          Continue with these items →
        </button>
      </StickyFooter>
    </div>
  );
}

// ── Step 2: People ────────────────────────────────────────────────────────────
const MAX_SAVED_NAMES = 30;
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

function NameChip({ name, onPick, onForget }) {
  return (
    <div onMouseDown={e => e.preventDefault()} style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--border)", borderRadius: 20, background: "var(--surface-2)", overflow: "hidden" }}>
      <button onClick={onPick} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 4px 6px 12px", fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
        + {name}
      </button>
      <button onClick={onForget} aria-label={`Forget ${name}`} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 10px 6px 6px", fontSize: 16, lineHeight: 1, color: "var(--subtle)" }}>×</button>
    </div>
  );
}

function PeopleStep({ people, setPeople, bill, savedNames, setSavedNames }) {
  const [name, setName] = useState("");

  const addPerson = (raw = name) => {
    const n = raw.trim();
    if (!n || people.find(p => sameName(p.name, n))) return;
    setPeople(prev => {
      const used = new Set(prev.map(p => p.color));
      const color = COLORS.find(c => !used.has(c)) || COLORS[prev.length % COLORS.length];
      return [...prev, { id: Date.now().toString(), name: n, color }];
    });
    setSavedNames(prev => remember(prev, [n], MAX_SAVED_NAMES));
    setName("");
  };

  const forgetName = (n) => setSavedNames(prev => forget(prev, n));

  const query = name.trim().toLowerCase();
  const suggestions = savedNames.filter(n =>
    !people.some(p => sameName(p.name, n)) && (!query || n.toLowerCase().includes(query))
  );

  return (
    <div>
      <div style={{ background: "var(--accent-soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 24 }}>🍽️</div>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{bill.restaurant}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{bill.currency}{bill.total?.toFixed(2)} total · {bill.items?.length} items</div>
        </div>
      </div>
      <div style={{ fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>Who's splitting this bill?</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addPerson()}
          placeholder="Enter name…" autoComplete="off"
          style={{ flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={() => addPerson()} style={{
          background: "var(--accent)", color: "#fff", border: "none",
          borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14
        }}>Add</button>
      </div>
      {suggestions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--subtle)", marginBottom: 6 }}>Recent</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map(n => <NameChip key={n} name={n} onPick={() => addPerson(n)} onForget={() => forgetName(n)} />)}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {people.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--divider)", borderRadius: 10, padding: "10px 14px" }}>
            <Avatar name={p.name} color={p.color} />
            <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
            <button onClick={() => setPeople(prev => prev.filter(x => x.id !== p.id))} style={{ background: "none", border: "none", color: "var(--subtle)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      {people.length === 0 && <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 13, padding: "24px 0" }}>Add at least 2 people to split with</div>}
    </div>
  );
}

// ── Step 3: Assign ────────────────────────────────────────────────────────────
function AssignStep({ bill, people, assignments, setAssignments }) {
  // Assign everyone to every item in one tap, so people can then just be deselected where they didn't share
  const everyoneOnAll = bill.items.every(item => people.every(p => (assignments[item.id] || []).includes(p.id)));
  const toggleEveryoneOnAll = () => setAssignments(
    Object.fromEntries(bill.items.map(item => [item.id, everyoneOnAll ? [] : people.map(p => p.id)]))
  );
  const toggle = (itemId, personId) => {
    setAssignments(prev => {
      const cur = prev[itemId] || [];
      return { ...prev, [itemId]: cur.includes(personId) ? cur.filter(x => x !== personId) : [...cur, personId] };
    });
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "var(--text)" }}>Items</div>
        <button onClick={toggleEveryoneOnAll} style={{
          border: "2px dashed var(--border-strong)", background: "none", borderRadius: 20,
          padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "var(--subtle)"
        }}>{everyoneOnAll ? "Unselect everyone" : "Everyone on all items"}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {bill.items?.map(item => {
          const assigned = assignments[item.id] || [];
          const perPerson = assigned.length > 0 ? (item.amount / assigned.length).toFixed(2) : null;
          return (
            <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>{bill.currency}{item.amount.toFixed(2)}</div>
                  {perPerson && <div style={{ fontSize: 11, color: "var(--muted)" }}>{bill.currency}{perPerson}/person</div>}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {people.map(p => (
                  <button key={p.id} onClick={() => toggle(item.id, p.id)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    border: assigned.includes(p.id) ? `2px solid ${p.color}` : "2px solid var(--border)",
                    background: assigned.includes(p.id) ? p.color + "18" : "var(--surface-2)",
                    borderRadius: 20, padding: "4px 12px 4px 6px",
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                    color: assigned.includes(p.id) ? p.color : "var(--muted)",
                    transition: "all .15s"
                  }}>
                    <Avatar name={p.name} color={p.color} size={20} />
                    {p.name}
                  </button>
                ))}
                {(() => {
                  const allSelected = people.every(p => assigned.includes(p.id));
                  return (
                    <button onClick={() => setAssignments(prev => ({ ...prev, [item.id]: allSelected ? [] : people.map(p => p.id) }))} style={{
                      border: "2px dashed var(--border-strong)", background: "none", borderRadius: 20,
                      padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "var(--subtle)"
                    }}>{allSelected ? "None" : "All"}</button>
                  );
                })()}
              </div>
              {assigned.length === 0 && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>⚠ No one assigned</div>}
            </div>
          );
        })}
      </div>
      {bill.taxes?.length > 0 && (
        <>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Shared Charges <span style={{ fontWeight: 400, fontSize: 12, color: "var(--subtle)" }}>(split equally)</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bill.taxes.map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                <span style={{ color: "var(--muted)", fontSize: 14 }}>{t.name}</span>
                <span style={{ fontWeight: 600 }}>{bill.currency}{t.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Totals & dates ────────────────────────────────────────────────────────────
function computeTotals(bill, people, assignments) {
  const perPersonShared = (bill.taxes?.reduce((s, t) => s + t.amount, 0) || 0) / (people.length || 1);
  return people.map(p => {
    let itemTotal = 0;
    bill.items?.forEach(item => {
      const assigned = assignments[item.id] || [];
      if (assigned.includes(p.id)) itemTotal += item.amount / assigned.length;
    });
    return { ...p, itemTotal, shared: perPersonShared, total: itemTotal + perPersonShared };
  });
}

const formatDateTime = (ts) => new Intl.DateTimeFormat(undefined, {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit"
}).format(ts);

// The first person paid the bill; everyone else owes them
const paidStatus = (entry) => {
  const debtors = entry.people.slice(1);
  const paidCount = debtors.filter(p => entry.paid?.[p.id]).length;
  return { paidCount, total: debtors.length, settled: debtors.length > 0 && paidCount === debtors.length };
};

// ── Step 4: Summary ───────────────────────────────────────────────────────────
function SummaryStep({ bill, people, assignments, payment, onOpenSettings, savedAt, paid = {}, onTogglePaid }) {
  const totals = computeTotals(bill, people, assignments);

  const [status, setStatus] = useState({}); // person id -> "shared" | "copied"
  const sharePayment = async (p) => {
    const text = buildShareText({ bill, person: p, assignments, people, payment });
    const result = await shareOrCopy(text);
    if (result === "cancelled") return;
    setStatus(prev => ({ ...prev, [p.id]: result }));
    setTimeout(() => setStatus(prev => ({ ...prev, [p.id]: null })), 2000);
  };

  const [groupStatus, setGroupStatus] = useState(null);
  const shareGroup = async () => {
    const text = buildGroupShareText({ bill, totals, assignments, payment, paid });
    const result = await shareOrCopy(text);
    if (result === "cancelled") return;
    setGroupStatus(result);
    setTimeout(() => setGroupStatus(null), 2000);
  };

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, var(--accent), #8b5cf6)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, color: "#fff" }}>
        <div style={{ fontSize: 13, opacity: 0.8 }}>{bill.restaurant}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 2 }}>{bill.currency}{bill.total?.toFixed(2)}</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{people.length} people · {bill.items?.length} items</div>
        {savedAt && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>✓ Saved to history · {formatDateTime(savedAt)}</div>}
      </div>
      {people.length > 1 && (
        <button onClick={shareGroup} style={{
          width: "100%", marginTop: -8, marginBottom: 20, borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 14, cursor: "pointer",
          border: `1.5px solid ${groupStatus ? "var(--success)" : "var(--accent)"}`,
          background: groupStatus ? "var(--success-soft)" : "var(--surface)", color: groupStatus ? "var(--success-text)" : "var(--accent)"
        }}>
          {groupStatus === "copied" ? "✓ Summary copied" : groupStatus === "shared" ? "✓ Shared" : "Share summary with group"}
        </button>
      )}
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Each person owes</div>
      {supportsUpi(bill) && !payment?.upiId && people.length > 1 && (
        <div style={{ fontSize: 13, color: "var(--muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", marginBottom: 12 }}>
          Add your UPI ID to include a pay link in shared messages.{" "}
          <button onClick={onOpenSettings} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Add UPI ID →</button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {totals.map((p, i) => (
          <div key={p.id} style={{ border: `1.5px solid ${p.color}33`, borderRadius: 14, padding: "14px 16px", background: "var(--surface)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Avatar name={p.name} color={p.color} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                {i === 0 && <div style={{ fontSize: 11, color: "var(--muted)" }}>Paid the bill</div>}
                {i > 0 && paid[p.id] && <div style={{ fontSize: 11, color: "var(--success-text)", fontWeight: 600 }}>Paid · {formatDateTime(paid[p.id])}</div>}
              </div>
              <div style={{ fontWeight: 800, fontSize: 20, color: p.color }}>{bill.currency}{p.total.toFixed(2)}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--subtle)", display: "flex", gap: 16 }}>
              <span>Items: {bill.currency}{p.itemTotal.toFixed(2)}</span>
              <span>+Shared: {bill.currency}{p.shared.toFixed(2)}</span>
            </div>
            {i > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => sharePayment(p)} style={{
                flex: 2,
                background: status[p.id] ? "var(--success)" : p.color,
                color: "#fff", border: "none", borderRadius: 8, padding: "8px",
                fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "background .2s"
              }}>
                {status[p.id] === "copied" ? "✓ Copied to clipboard" : status[p.id] === "shared" ? "✓ Shared" : "Share payment details"}
              </button>
              {onTogglePaid && (
                <button onClick={() => onTogglePaid(p.id)} style={{
                  flex: 1, borderRadius: 8, padding: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
                  border: `1.5px solid ${paid[p.id] ? "var(--success)" : "var(--border)"}`,
                  background: paid[p.id] ? "var(--success-soft)" : "var(--surface)",
                  color: paid[p.id] ? "var(--success-text)" : "var(--text-2)"
                }}>{paid[p.id] ? "✓ Paid" : "Mark paid"}</button>
              )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, background: "var(--surface-2)", borderRadius: 12, padding: "14px 16px", fontSize: 13, color: "var(--muted)" }}>
        <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Full breakdown</div>
        {bill.items?.map(item => {
          const assigned = assignments[item.id] || [];
          const names = assigned.map(id => people.find(p => p.id === id)?.name).filter(Boolean);
          return (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 4, marginBottom: 4, borderBottom: "1px solid var(--divider)" }}>
              <span>{item.name} <span style={{ opacity: 0.6 }}>({names.join(", ") || "unassigned"})</span></span>
              <span>{bill.currency}{item.amount.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
function HistoryList({ history, onOpen, onClose }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text)" }}>History</div>
        <button onClick={onClose} style={{ ...linkBtn, color: "var(--accent)", fontWeight: 700, fontSize: 14 }}>Done</button>
      </div>
      {history.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 14, padding: "32px 0" }}>
          Splits are saved here automatically when you reach the summary.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {history.map(entry => {
          const { paidCount, total, settled } = paidStatus(entry);
          return (
            <button key={entry.id} onClick={() => onOpen(entry.id)} style={{
              display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
              border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "var(--surface)", cursor: "pointer"
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.bill.restaurant}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{formatDateTime(entry.createdAt)} · {entry.people.length} people</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{entry.bill.currency}{entry.bill.total.toFixed(2)}</div>
                <div style={{
                  display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "2px 8px",
                  background: settled ? "var(--success-soft)" : "var(--warn-soft)", color: settled ? "var(--success-text)" : "var(--warn-text)"
                }}>{settled ? "Settled" : `${paidCount} of ${total} paid`}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HistoryDetail({ entry, payment, onBack, onDelete, onTogglePaid, onOpenSettings }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 24, marginBottom: 16 }}>
        <button onClick={onBack} style={linkBtn}>← History</button>
        <ConfirmButton label="Delete" prompt="Delete this split?" onConfirm={onDelete} />
      </div>
      <SummaryStep
        bill={entry.bill} people={entry.people} assignments={entry.assignments} payment={payment}
        savedAt={entry.createdAt} paid={entry.paid} onTogglePaid={onTogglePaid} onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
const maskKey = (k) => k.length <= 10 ? "••••••" : `${k.slice(0, 4)}••••••${k.slice(-4)}`;

const sectionTitle = { fontWeight: 700, color: "var(--text)", fontSize: 14, marginBottom: 10 };
const card = { border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 24 };
const outlineBtn = (color = "var(--text-2)", border = "var(--border)") => ({
  flex: 1, border: `1.5px solid ${border}`, background: "var(--surface)", borderRadius: 10,
  padding: "10px 12px", fontWeight: 600, cursor: "pointer", fontSize: 14, color
});

function PaymentSettings({ payment, setPayment, flash }) {
  const [editing, setEditing] = useState(!payment?.upiId);
  const [upiId, setUpiId] = useState(payment?.upiId || "");
  const [name, setName] = useState(payment?.name || "");
  const valid = UPI_ID_PATTERN.test(upiId.trim());

  const save = () => {
    setPayment({ upiId: upiId.trim(), name: name.trim() });
    setEditing(false);
    flash("UPI details saved.");
  };
  const remove = () => {
    if (!window.confirm("Remove your saved UPI ID?")) return;
    setPayment(null); setUpiId(""); setName(""); setEditing(true);
    flash("UPI details removed.");
  };

  if (!editing && payment?.upiId) return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
        <span style={{ color: "var(--muted)" }}>UPI ID</span>
        <span style={{ fontWeight: 600 }}>{payment.upiId}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 14 }}>
        <span style={{ color: "var(--muted)" }}>Payee name</span>
        <span style={{ fontWeight: 600 }}>{payment.name || "First person in the split"}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setEditing(true)} style={outlineBtn()}>Change</button>
        <button onClick={remove} style={outlineBtn("var(--danger)", "var(--danger-border)")}>Remove</button>
      </div>
    </>
  );

  return (
    <>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Shared payment messages for ₹ bills include a link that opens the friend's UPI app with your ID and their amount filled in.
      </div>
      <label style={labelStyle}>Your UPI ID</label>
      <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@okbank" autoComplete="off" autoCapitalize="none" spellCheck={false} style={{ ...inputStyle, marginBottom: 4 }} />
      {upiId.trim() && !valid && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 4 }}>Enter a UPI ID like name@okbank</div>}
      <label style={{ ...labelStyle, marginTop: 10 }}>Name shown to payers (optional)</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Abhishek" style={{ ...inputStyle, marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 8 }}>
        {payment?.upiId && <button onClick={() => { setUpiId(payment.upiId); setName(payment.name || ""); setEditing(false); }} style={outlineBtn()}>Cancel</button>}
        <button onClick={save} disabled={!valid} style={{
          flex: 2, border: "none", borderRadius: 10, padding: "10px 12px", fontWeight: 700, fontSize: 14,
          background: valid ? "var(--accent)" : "var(--border)", color: valid ? "#fff" : "var(--subtle)", cursor: valid ? "pointer" : "default"
        }}>Save UPI ID</button>
      </div>
    </>
  );
}

function SettingsPage({ onClose, onKeyChanged, onClearSplit, onEraseAll, savedNames, setSavedNames, payment, setPayment, historyCount, onClearHistory, theme, setTheme }) {
  const [config, setConfig] = useState(undefined);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { loadVisionConfig().then(setConfig).catch(() => setConfig(null)); }, []);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 2500); };

  const saveKey = async (cfg) => {
    await saveSecret("vision", cfg);
    setConfig(cfg);
    setEditing(false);
    onKeyChanged();
    flash("API key saved.");
  };

  const removeKey = async () => {
    if (!window.confirm("Remove the saved API key from this device?")) return;
    await deleteSecret("vision");
    setConfig(null);
    onKeyChanged();
    flash("API key removed.");
  };

  const clearSplit = () => {
    if (!window.confirm("Clear the current bill, people and assignments?")) return;
    onClearSplit();
    flash("Current split cleared.");
  };

  const eraseAll = async () => {
    if (!window.confirm("Erase all SplitEasy data on this device, including history, saved names, your UPI ID and the API key? This can't be undone.")) return;
    await clearAllSecrets();
    onEraseAll();
    setConfig(null);
    onKeyChanged();
    flash("All app data erased.");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text)" }}>Settings</div>
        <button onClick={onClose} style={{ ...linkBtn, color: "var(--accent)", fontWeight: 700, fontSize: 14 }}>Done</button>
      </div>

      {notice && (
        <div style={{ fontSize: 13, color: "var(--success-text)", background: "var(--success-soft)", border: "1px solid var(--success-border)", borderRadius: 8, padding: "8px 14px", marginBottom: 16 }}>✓ {notice}</div>
      )}

      <div style={sectionTitle}>Install app</div>
      <div style={{ marginBottom: 24 }}>
        <InstallBanner permanent />
      </div>

      <div style={sectionTitle}>Appearance</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([id, label]) => (
          <button key={id} onClick={() => setTheme(id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${theme === id ? "var(--accent)" : "var(--border)"}`,
            background: theme === id ? "var(--accent-soft)" : "var(--surface)",
            color: theme === id ? "var(--accent)" : "var(--muted)"
          }}>{label}</button>
        ))}
      </div>

      <div style={sectionTitle}>Payment details</div>
      <div style={card}>
        <PaymentSettings payment={payment} setPayment={setPayment} flash={flash} />
      </div>

      <div style={sectionTitle}>Bill scanning API key</div>
      <div style={card}>
        {config === undefined ? null : editing ? (
          <ApiKeySettings config={config} onSave={saveKey} onCancel={() => setEditing(false)} />
        ) : config ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span style={{ color: "var(--muted)" }}>Provider</span>
              <span style={{ fontWeight: 600 }}>{PROVIDERS[config.provider].label}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span style={{ color: "var(--muted)" }}>Model</span>
              <span style={{ fontWeight: 600 }}>{config.model}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 14 }}>
              <span style={{ color: "var(--muted)" }}>Key</span>
              <span style={{ fontWeight: 600, fontFamily: "ui-monospace, monospace" }}>{maskKey(config.apiKey)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(true)} style={outlineBtn()}>Change</button>
              <button onClick={removeKey} style={outlineBtn("var(--danger)", "var(--danger-border)")}>Remove key</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>No key saved. Add one to scan bill photos.</div>
            <button onClick={() => setEditing(true)} style={{ ...outlineBtn("var(--accent)", "var(--accent)"), width: "100%" }}>Add API key</button>
          </>
        )}
      </div>

      <div style={sectionTitle}>Saved names</div>
      <div style={card}>
        {savedNames.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--muted)" }}>Names you add to a split are remembered here and suggested next time.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 12 }}>
              {savedNames.map((n, i) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
                  <Avatar name={n} color={COLORS[i % COLORS.length]} size={28} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{n}</span>
                  <button onClick={() => setSavedNames(prev => prev.filter(x => x !== n))} aria-label={`Forget ${n}`} style={{ background: "none", border: "none", color: "var(--subtle)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={() => { if (window.confirm("Forget all saved names?")) { setSavedNames([]); flash("Saved names cleared."); } }} style={{ ...outlineBtn("var(--danger)", "var(--danger-border)"), width: "100%" }}>Clear all names</button>
          </>
        )}
      </div>

      <div style={sectionTitle}>Data on this device</div>
      <div style={card}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
          Your split in progress, history, saved names, UPI ID and API key are stored only in this browser. Nothing is uploaded except bill photos you choose to scan.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={clearSplit} style={outlineBtn()}>Clear current split</button>
          <button onClick={() => { if (window.confirm(`Delete all ${historyCount} saved splits?`)) { onClearHistory(); flash("History cleared."); } }}
            disabled={!historyCount} style={{ ...outlineBtn(historyCount ? "var(--text-2)" : "var(--subtle)"), cursor: historyCount ? "pointer" : "default" }}>
            Clear history{historyCount ? ` (${historyCount})` : ""}
          </button>
          <button onClick={eraseAll} style={{ ...outlineBtn("#fff", "var(--danger)"), background: "var(--danger)" }}>Erase all app data</button>
        </div>
      </div>
    </div>
  );
}

// ── Persistence ───────────────────────────────────────────────────────────────
const STORAGE_KEY = "spliteasy:v1";
const loadAll = () => {
  try {
    // savedRestaurants / savedDishes came from an earlier version; drop them
    const { savedRestaurants, savedDishes, ...rest } = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return rest;
  } catch { return {}; }
};
function usePersisted(key, initial) {
  const [val, setVal] = useState(() => loadAll()[key] ?? initial);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAll(), [key]: val })); } catch { /* storage unavailable */ }
  }, [key, val]);
  return [val, setVal];
}

// Applies "system" | "light" | "dark" to <html> and keeps the browser/status bar colour matched
function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const surface = getComputedStyle(root).getPropertyValue("--surface").trim();
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", surface));
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);
}

const HISTORY_KEY = "spliteasy:history";
function useStoredState(storageKey, initial) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(val)); } catch { /* storage unavailable */ }
  }, [storageKey, val]);
  return [val, setVal];
}

const newSplitId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const HeaderIcon = ({ label, onClick, children }) => (
  <button onClick={onClick} aria-label={label} title={label} style={{
    background: "none", border: "none", cursor: "pointer", padding: 6, lineHeight: 0, color: "var(--muted)"
  }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  </button>
);

// ── Routing ───────────────────────────────────────────────────────────────────
// Hash routes so the browser/Android back button steps back through screens instead of leaving
// the app. Hashes need no server config on GitHub Pages and don't disturb the service worker.
const STEP_ROUTES = ["", "people", "assign", "summary"];

function routeFor({ view, openEntryId, step, billMode }) {
  if (view === "settings") return "#/settings";
  if (view === "history") return openEntryId ? `#/history/${openEntryId}` : "#/history";
  if (step === 0) return billMode === "manual" ? "#/bill/manual" : billMode === "upload" ? "#/bill/scan" : "#/";
  return `#/${STEP_ROUTES[step]}`;
}

function parseRoute(hash) {
  if (!hash) return { view: "split" }; // no route yet: let saved progress decide the screen
  const [a, b] = hash.replace(/^#\/?/, "").split("/");
  if (a === "settings") return { view: "settings" };
  if (a === "history") return { view: "history", openEntryId: b ? decodeURIComponent(b) : null };
  if (a === "bill") return { view: "split", step: 0, billMode: b === "manual" ? "manual" : b === "scan" ? "upload" : null };
  const step = STEP_ROUTES.indexOf(a);
  return { view: "split", step: step > 0 ? step : 0, billMode: null };
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BillSplitter() {
  const [step, setStep] = usePersisted("step", 0);
  const [bill, setBill] = usePersisted("bill", null);
  const [people, setPeople] = usePersisted("people", []);
  const [assignments, setAssignments] = usePersisted("assignments", {});
  const [savedNames, setSavedNames] = usePersisted("savedNames", []);
  const [payment, setPayment] = usePersisted("payment", null);
  const [theme, setTheme] = usePersisted("theme", "system");
  useTheme(theme);
  const [splitId, setSplitId] = usePersisted("splitId", null);
  const [history, setHistory] = useStoredState(HISTORY_KEY, []);
  const initialRoute = useRef(parseRoute(location.hash)).current;
  const [view, setView] = useState(initialRoute.view); // "split" | "settings" | "history"
  const [openEntryId, setOpenEntryId] = useState(initialRoute.openEntryId ?? null);
  const [billMode, setBillMode] = useState( // null | "upload" | "manual"
    initialRoute.billMode !== undefined ? initialRoute.billMode : (bill ? "manual" : null)
  );
  const [keyVersion, setKeyVersion] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [resetCount, setResetCount] = useState(0);

  const resetSplit = () => {
    setStep(0); setBill(null); setPeople([]); setAssignments({}); setSplitId(null); setBillMode(null);
    setResetCount(n => n + 1); // remount BillStep so its draft form is cleared too
  };

  const eraseAll = () => {
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(HISTORY_KEY); } catch { /* storage unavailable */ }
    setSavedNames([]);
    setPayment(null);
    setHistory([]);
    resetSplit();
  };

  // Auto-save: reaching the summary records the split in history; later edits update the same entry
  useEffect(() => {
    if (step !== 3 || !bill) return;
    if (!splitId) { setSplitId(newSplitId()); return; }
    setHistory(prev => {
      const existing = prev.find(e => e.id === splitId);
      if (!existing) return [{ id: splitId, createdAt: Date.now(), bill, people, assignments, paid: {} }, ...prev];
      if (JSON.stringify([existing.bill, existing.people, existing.assignments]) === JSON.stringify([bill, people, assignments])) return prev;
      return prev.map(e => e.id === splitId ? { ...e, bill, people, assignments, updatedAt: Date.now() } : e);
    });
  }, [step, bill, people, assignments, splitId]);

  const togglePaid = (entryId, personId) => setHistory(prev => prev.map(e => {
    if (e.id !== entryId) return e;
    const paid = { ...e.paid };
    if (paid[personId]) delete paid[personId]; else paid[personId] = Date.now();
    return { ...e, paid };
  }));

  const deleteEntry = (entryId) => {
    setHistory(prev => prev.filter(e => e.id !== entryId));
    if (entryId === splitId) resetSplit(); // otherwise the open summary would re-save it
    goBack(() => setOpenEntryId(null));
  };

  // Furthest step the current data allows, so stale or hand-typed routes can't open an empty screen
  const clampStep = (s) => {
    if (!bill) return 0;
    if (s >= 2 && people.length < 2) return 1;
    if (s >= 3 && !bill.items.every(item => (assignments[item.id] || []).length > 0)) return 2;
    return s;
  };

  // Keep the URL in sync with the screen: user navigation pushes a history entry; the first
  // render and corrections after a back/forward (e.g. a clamped step) replace instead
  const firstRoute = useRef(true);
  const replaceNext = useRef(false);
  useEffect(() => {
    const target = routeFor({ view, openEntryId, step, billMode });
    if (location.hash === target) { firstRoute.current = false; replaceNext.current = false; return; }
    const depth = window.history.state?.depth ?? 0; // `history` in this component is the saved-splits list
    if (firstRoute.current || replaceNext.current) window.history.replaceState({ depth }, "", target);
    else window.history.pushState({ depth: depth + 1 }, "", target);
    firstRoute.current = false;
    replaceNext.current = false;
  }, [view, openEntryId, step, billMode]);

  useEffect(() => {
    const onPop = () => {
      const r = parseRoute(location.hash);
      const next = {
        view: r.view,
        openEntryId: r.view === "history" && r.openEntryId && history.some(e => e.id === r.openEntryId) ? r.openEntryId : null,
        step: r.view === "split" ? clampStep(r.step ?? step) : step,
        billMode
      };
      if (r.view === "split" && next.step === 0) next.billMode = r.billMode ?? null;
      setView(next.view); setOpenEntryId(next.openEntryId); setStep(next.step); setBillMode(next.billMode);
      // Stale entries (e.g. #/summary after starting a new split) show a different screen; fix the URL in place
      const target = routeFor(next);
      if (location.hash !== target) window.history.replaceState(window.history.state, "", target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  // In-app back buttons walk the same browser history; with nothing to go back to
  // (fresh load or reload), apply the fallback screen in place
  const goBack = (fallback) => {
    if ((window.history.state?.depth ?? 0) > 0) window.history.back();
    else { replaceNext.current = true; fallback(); }
  };

  const currentEntry = history.find(e => e.id === splitId);
  const openEntry = history.find(e => e.id === openEntryId);

  // If the bill changes (edited after going back), drop assignments for items that no longer exist
  useEffect(() => {
    if (!bill) return;
    const ids = new Set(bill.items.map(i => i.id));
    setAssignments(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => ids.has(k))));
  }, [bill]);

  // Drop removed people from assignments
  useEffect(() => {
    const ids = new Set(people.map(p => p.id));
    setAssignments(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.filter(id => ids.has(id))])));
  }, [people]);

  const canNext = () => {
    if (step === 1) return people.length >= 2;
    if (step === 2) return bill?.items?.every(item => (assignments[item.id] || []).length > 0);
    return false;
  };

  return (
    <div className="app-shell" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div className="app-card">
        <div className="sticky-header" style={{
          padding: "calc(14px + env(safe-area-inset-top)) 24px 12px",
          borderBottom: `1px solid ${scrolled ? "var(--divider)" : "transparent"}`
        }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--text)", marginBottom: view === "split" ? 14 : 0, display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
            <span>🍕</span> SplitEasy
            {view === "split" && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                <HeaderIcon label="History" onClick={() => { setOpenEntryId(null); setView("history"); }}>
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </HeaderIcon>
                <HeaderIcon label="Settings" onClick={() => setView("settings")}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </HeaderIcon>
              </div>
            )}
          </div>
          {view === "split" && <StepBar current={step} />}
        </div>

        {view === "history" && (
          <div style={{ padding: "16px 24px 24px" }}>
            {openEntry ? (
              <HistoryDetail
                entry={openEntry} payment={payment}
                onBack={() => goBack(() => setOpenEntryId(null))}
                onDelete={() => deleteEntry(openEntry.id)}
                onTogglePaid={personId => togglePaid(openEntry.id, personId)}
                onOpenSettings={() => setView("settings")}
              />
            ) : (
              <HistoryList history={history} onOpen={setOpenEntryId} onClose={() => goBack(() => setView("split"))} />
            )}
          </div>
        )}

        {view === "settings" && (
          <div style={{ padding: "16px 24px 24px" }}>
            <SettingsPage
              onClose={() => goBack(() => setView("split"))}
              onKeyChanged={() => setKeyVersion(v => v + 1)}
              onClearSplit={resetSplit}
              onEraseAll={eraseAll}
              savedNames={savedNames}
              setSavedNames={setSavedNames}
              payment={payment}
              setPayment={setPayment}
              historyCount={history.length}
              theme={theme}
              setTheme={setTheme}
              onClearHistory={() => { setHistory([]); setSplitId(null); }}
            />
          </div>
        )}

        {/* Hidden rather than unmounted while other views are open, so an in-progress bill form isn't lost */}
        <div className="fill" style={view === "split" ? undefined : { display: "none" }}>
        <div className="fill" style={{ padding: "16px 24px 24px" }}>
          {step === 0 && <BillStep
            key={resetCount} initial={bill} keyVersion={keyVersion} onReset={resetSplit}
            mode={billMode} setMode={setBillMode} onBack={() => goBack(() => setBillMode(null))}
            onDone={parsed => { setBill(parsed); setStep(1); }} />}
          {step >= 1 && <TopBar onBack={() => goBack(() => { if (step === 1) setBillMode("manual"); setStep(step - 1); })} onReset={resetSplit} hasData />}
          {step === 1 && <PeopleStep people={people} setPeople={setPeople} bill={bill} savedNames={savedNames} setSavedNames={setSavedNames} />}
          {step === 2 && <AssignStep bill={bill} people={people} assignments={assignments} setAssignments={setAssignments} />}
          {step === 3 && <SummaryStep
            bill={bill} people={people} assignments={assignments} payment={payment}
            onOpenSettings={() => setView("settings")}
            savedAt={currentEntry?.createdAt} paid={currentEntry?.paid}
            onTogglePaid={currentEntry ? personId => togglePaid(currentEntry.id, personId) : undefined}
          />}
        </div>

        {step >= 1 && step < 3 && (
          <StickyFooter>
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} style={{
              width: "100%", border: "none",
              background: canNext() ? "var(--accent)" : "var(--border)",
              color: canNext() ? "#fff" : "var(--subtle)",
              borderRadius: 10, padding: 12, fontWeight: 700,
              cursor: canNext() ? "pointer" : "default", fontSize: 15, transition: "all .2s", whiteSpace: "nowrap"
            }}>
              {step === 2 ? "See Summary →" : "Next →"}
            </button>
          </StickyFooter>
        )}

        {step === 3 && (
          <StickyFooter>
            <button onClick={resetSplit} style={{
              width: "100%", border: "none", background: "var(--accent)",
              borderRadius: 10, padding: 12, fontWeight: 700, cursor: "pointer", fontSize: 15, color: "#fff"
            }}>Start New Split</button>
          </StickyFooter>
        )}
        </div>
      </div>
    </div>
  );
}
