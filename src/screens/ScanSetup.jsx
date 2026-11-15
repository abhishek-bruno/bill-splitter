import { useEffect, useRef, useState } from "react";
import { SegTabs } from "../components/SegTabs.jsx";
import { Sheet } from "../components/Sheet.jsx";
import { ArrowUpRight, CheckIcon, LockIcon } from "../components/icons.jsx";
import { inputStyle, labelStyle, linkBtn, outlineBtn } from "../components/styles.js";
import { useSwipeTabs } from "../hooks/useSwipeTabs.js";
import { loadVisionKeys, rememberCloudKey } from "../lib/scanSettings.js";
import { ENGINES, downloadEngine, isEngineReady } from "../scan/models.js";
import { PROVIDERS, cleanApiKey, isLocalProvider, isValidApiKey } from "../scan/vision.js";
import { TextField } from "../components/TextField.jsx";

export function CloudAiSettings({ config, savedKeys = {}, onSave, onCancel, heading = true, children }) {
  // Start on the active cloud provider, else one with a saved key, else Gemini
  const startId = config?.provider || Object.keys(savedKeys).find(id => PROVIDERS[id]) || "google";
  const [provider, setProvider] = useState(startId);
  const [apiKey, setApiKey] = useState(config?.apiKey || savedKeys[startId]?.apiKey || "");
  const [model, setModel] = useState(config?.model || savedKeys[startId]?.model || PROVIDERS[startId].defaultModel);
  const [saving, setSaving] = useState(false);
  const p = PROVIDERS[provider];
  // A model not in the provider's list (typed earlier) opens straight in manual entry
  const [manualModel, setManualModel] = useState(() => !p.models.some(m => m.id === model));

  // Each provider shows its own saved key, if any
  const pick = (id) => {
    setProvider(id);
    setApiKey(savedKeys[id]?.apiKey || "");
    const next = savedKeys[id]?.model || PROVIDERS[id].defaultModel;
    setModel(next);
    setManualModel(!PROVIDERS[id].models.some(m => m.id === next));
  };

  const cleanedKey = cleanApiKey(apiKey);
  const keyInvalid = cleanedKey !== "" && !isValidApiKey(cleanedKey);

  // What the button does for the shown provider: use a saved key as is, save changes and use them, or save a new key
  const saved = savedKeys[provider];
  const inUse = config?.provider === provider && config.apiKey === cleanedKey && config.model === (model.trim() || p.defaultModel);
  const unchanged = saved && saved.apiKey === cleanedKey && (saved.model || p.defaultModel) === (model.trim() || p.defaultModel);
  const actionLabel = inUse ? "In use" : unchanged ? "Use this" : saved ? "Save and use" : "Save key";
  const canSave = !!cleanedKey && !keyInvalid && !inUse;

  const save = async () => {
    setSaving(true);
    await onSave({ provider, apiKey: cleanedKey, model: model.trim() || p.defaultModel });
    setSaving(false);
  };

  return (
    <div>
      {heading && <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 4 }}>Connect a vision API</div>}
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>More accurate, needs internet.</div>

      <label style={labelStyle}>Provider</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {Object.entries(PROVIDERS).map(([id, info]) => (
          <button key={id} onClick={() => pick(id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            border: `1.5px solid ${provider === id ? "var(--accent)" : "var(--border)"}`,
            background: provider === id ? "var(--accent-soft)" : "var(--surface)",
            color: provider === id ? "var(--accent)" : "var(--muted)"
          }}>
            {info.label}
            {savedKeys[id] && <span title="Key saved" style={{ marginLeft: 4, color: "var(--success-text)" }}><CheckIcon size={11} /></span>}
          </button>
        ))}
      </div>

      <label style={labelStyle}>API key</label>
      <TextField
        type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
        placeholder={p.keyHint} autoComplete="off" spellCheck={false} style={{ marginBottom: 4 }}
      />
      {keyInvalid && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 4 }}>
          This key has characters that aren't allowed. Copy it again from {p.label}.
        </div>
      )}
      <a href={p.keyUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 3, marginBottom: 14 }}>Get {/^[AEIOU]/i.test(p.label) ? "an" : "a"} {p.label} key <ArrowUpRight size={12} /></a>

      <label style={labelStyle}>Model</label>
      <select
        value={manualModel ? "__manual" : model}
        onChange={e => {
          if (e.target.value === "__manual") { setManualModel(true); return; }
          setManualModel(false);
          setModel(e.target.value);
        }}
        style={{ ...inputStyle, cursor: "pointer", marginBottom: manualModel ? 8 : 14 }}
      >
        {p.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        <option value="__manual">Enter manually…</option>
      </select>
      {manualModel && (
        <TextField value={model} onChange={e => setModel(e.target.value)} placeholder={`Model ID, e.g. ${p.defaultModel}`} spellCheck={false} autoCapitalize="none" autoFocus style={{ marginBottom: 14 }} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, lineHeight: 1.5 }}>
        <LockIcon size={12} /><span>The key is encrypted and kept only on this device.</span>
      </div>

      {children}
      {(() => {
        const actions = (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, border: "1.5px solid var(--border)", background: "var(--surface)", borderRadius: 10, padding: 12, fontWeight: 600, fontSize: 15, cursor: "pointer", color: "var(--text-2)" }}>Cancel</button>
            <button onClick={save} disabled={!canSave || saving} style={{
              flex: 2, border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: canSave ? "var(--accent)" : "var(--border)", color: canSave ? "#fff" : "var(--subtle)",
              cursor: canSave ? "pointer" : "default"
            }}>{saving ? "Saving…" : <>{inUse && <CheckIcon size={14} />}{actionLabel}</>}</button>
          </div>
        );
        return actions;
      })()}
    </div>
  );
}

export function ScanSetupSheet({ config, onSave, onClose }) {
  const local = isLocalProvider(config?.provider);
  const [savedKeys, setSavedKeys] = useState(null);
  useEffect(() => { loadVisionKeys(config).then(setSavedKeys).catch(() => setSavedKeys({})); }, [config]);
  // A cloud key is kept per provider on save; choosing On Device AI only changes the active reader
  const save = async (cfg) => { await rememberCloudKey(cfg); onSave(cfg); };
  // New users start on the free on-device tab; people with a cloud key start on theirs
  const [tab, setTab] = useState(config && !local ? "cloud" : "device");
  const swipe = useSwipeTabs(["device", "cloud"], tab, setTab);
  return (
    <Sheet title="How to read bills" onClose={onClose}>
      <div {...swipe.handlers}>
      <div style={{ marginBottom: 16 }}>
        <SegTabs options={[["device", "On Device AI"], ["cloud", "Cloud AI"]]} value={tab} swipe={swipe} role="tab" />
      </div>
      <div key={tab} ref={swipe.contentRef} className={swipe.slide} style={{ touchAction: "pan-y" }}>
        {tab === "device" ? (
          <OnDeviceAiOptions config={config} onUse={(id) => onSave({ provider: `local-${id}` })} />
        ) : savedKeys && (
          // Removing a key lives in Settings > Bill scanning
          <CloudAiSettings config={local ? null : config} savedKeys={savedKeys} onSave={save} onCancel={onClose} heading={false} />
        )}
      </div>
      </div>
    </Sheet>
  );
}

// On-device readers: nothing downloads until the user agrees; then Use (removing is in Settings)
export function OnDeviceAiOptions({ config, onUse }) {
  const [ready, setReady] = useState({}); // engine id -> downloaded
  const [progress, setProgress] = useState(null); // { id, value }
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    Promise.all(Object.keys(ENGINES).map(async id => [id, await isEngineReady(id)])).then(list => setReady(Object.fromEntries(list)));
  }, []);

  const start = async (id) => {
    setError("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress({ id, value: 0 });
    try {
      await downloadEngine(id, { signal: ctrl.signal, onProgress: v => setProgress({ id, value: v }) });
      // Fetch the reader's code and start it once, so it's all cached and the first scan works offline
      await (await import("../scan/basicScan.js")).warmUp(id);
      setReady(r => ({ ...r, [id]: true }));
      setProgress(null);
      onUse(id); // they chose this reader; use it straight away
    } catch (e) {
      setProgress(null);
      if (e.name !== "AbortError") setError(e.message || "Download failed. Try again.");
    }
  };


  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>Free, private, and works offline.</div>
      {Object.entries(ENGINES).map(([id, e]) => {
        const inUse = config?.provider === `local-${id}`;
        const busy = progress?.id === id;
        return (
          <div key={id} style={{ border: `1.5px solid ${inUse ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{e.label}</span>
              <span style={{ fontSize: 12, color: "var(--subtle)" }}>{e.sizeMB} MB</span>
              {inUse && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--accent)" }}><CheckIcon size={11} /> In use</span>}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 10px", lineHeight: 1.4 }}>{e.blurb}</div>
            {busy ? (
              <div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(progress.value * 100)}%`, height: "100%", background: "var(--accent)", transition: "width .2s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  <span>Downloading… {Math.round(progress.value * 100)}%</span>
                  <button onClick={() => abortRef.current?.abort()} style={{ ...linkBtn, fontSize: 12, color: "var(--muted)", textDecoration: "underline" }}>Cancel</button>
                </div>
              </div>
            ) : ready[id] ? (
              // Downloaded: use it (removing a download lives in Settings > Bill scanning)
              !inUse && <button onClick={() => onUse(id)} style={{ ...outlineBtn("var(--accent)", "var(--accent)"), width: "100%" }}>Use this</button>
            ) : (
              // Tapping Download (with the size on it) is the consent; nothing downloads before that
              <button onClick={() => start(id)} disabled={!!progress} style={{ ...outlineBtn("#fff", "var(--accent)"), background: "var(--accent)", width: "100%" }}>Download · {e.sizeMB} MB</button>
            )}
          </div>
        );
      })}
      {error && <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
