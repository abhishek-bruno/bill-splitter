import { useEffect, useRef, useState } from "react";
import { AddPersonInput } from "../components/AddPersonInput.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { ConfirmModal } from "../components/ConfirmModal.jsx";
import { CheckIcon, PencilIcon, TrashIcon } from "../components/icons.jsx";
import { card, labelStyle, outlineBtn, sectionTitle } from "../components/styles.js";
import { COLORS } from "../lib/constants.js";
import { maskKey } from "../lib/format.js";
import { UPI_ID_PATTERN } from "../lib/payment.js";
import { asContact, forget, remember, rename, sameName } from "../lib/savedPeople.js";
import { forgetCloudKey, loadVisionConfig, loadVisionKeys, readerLabel } from "../lib/scanSettings.js";
import { clearAllSecrets, deleteSecret, saveSecret } from "../lib/secureStore.js";
import { ENGINES, isEngineReady, removeEngine } from "../scan/models.js";
import { PROVIDERS } from "../scan/vision.js";
import { ScanSetupSheet } from "./ScanSetup.jsx";
import { useAddPerson } from "../hooks/useAddPerson.jsx";
import InstallBanner from "../components/InstallPrompt.jsx";
import { TextField } from "../components/TextField.jsx";

export function PaymentSettings({ payment, setPayment, flash }) {
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
      <TextField value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@okbank" autoComplete="off" autoCapitalize="none" spellCheck={false} style={{ marginBottom: 4 }} />
      {upiId.trim() && !valid && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 4 }}>Enter a UPI ID like name@okbank</div>}
      <label style={{ ...labelStyle, marginTop: 10 }}>Name shown to payers (optional)</label>
      <TextField value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Abhishek" style={{ marginBottom: 14 }} />
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

// Saved people: add someone, rename (pencil; also renames them in saved splits) or remove (trash) each one,
// or clear them all
export function SavedPeopleSettings({ savedNames, setSavedNames, history = [], onRenamePerson, flash }) {
  const [editing, setEditing] = useState(null); // name being renamed
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState(null); // { name } to remove one, or { all: true }
  const people = savedNames.map(asContact);
  const renamed = editing !== null ? rename(savedNames, editing, draft) : null;
  const taken = editing !== null && draft.trim() !== "" && renamed === null;
  const startEdit = (name) => { setEditing(name); setDraft(name); };
  const save = () => {
    if (!renamed) return;
    setSavedNames(renamed);
    const contact = people.find(c => sameName(c.name, editing));
    const splits = onRenamePerson ? onRenamePerson(contact, draft) : 0;
    setEditing(null);
    flash(splits ? `Name updated here and in ${splits} saved ${splits === 1 ? "split" : "splits"}.` : "Name updated.");
  };
  const iconBtn = { background: "none", border: "none", color: "var(--subtle)", cursor: "pointer", lineHeight: 1, padding: "4px 6px", display: "inline-flex" };

  // Adding someone works as on the People step (asks when the name is in earlier splits)
  const [newName, setNewName] = useState("");
  const [exists, setExists] = useState("");
  const newInput = useRef(null);
  const adder = useAddPerson({
    savedNames, history, inputRef: newInput,
    onAdd: (contact, kind) => {
      if (kind === "saved") { setExists(`${contact.name} is already saved`); return false; }
      setSavedNames(prev => remember(prev, [contact]));
      setNewName("");
      flash(`${contact.name} saved.`);
      return true;
    }
  });
  const addRow = (
    <>
      <AddPersonInput value={newName} onChange={v => { setNewName(v); setExists(""); adder.clearHint(); }} onSubmit={adder.submit}
        error={exists} hint={adder.hint} inputRef={newInput} style={{ marginBottom: people.length ? 8 : 0 }} />
      {adder.dialog}
    </>
  );

  // Section heading, with Remove all at its right end (rare and destructive, so a quiet link)
  const heading = (
    <div id="saved-people" style={{ ...sectionTitle, scrollMarginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span>Saved people</span>
      {people.length > 0 && (
        <button onClick={() => setConfirm({ all: true })} style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: "var(--danger)", cursor: "pointer", fontFamily: "inherit" }}>Remove all</button>
      )}
    </div>
  );

  if (people.length === 0) return (
    <>
      {heading}
      <div style={card}>
        <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>People you add to a split are kept on this device and suggested next time.</div>
        {addRow}
      </div>
    </>
  );
  return (
    <>
    {heading}
    <div style={card}>
      {addRow}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {people.map((c, i) => (
          <div key={c.id || c.name} style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
            <Avatar name={editing === c.name ? draft || c.name : c.name} color={COLORS[i % COLORS.length]} size={28} />
            {editing === c.name ? (
              <>
                {/* Same height as the name it replaces, so the list doesn't move; the error floats below */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TextField value={draft} onChange={e => setDraft(e.target.value)} autoFocus aria-label={`New name for ${c.name}`}
                    onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(null); }} style={{ height: 28, padding: "0 8px", fontWeight: 600 }} error={taken} />
                  {taken && (
                    <div role="alert" style={{
                      position: "absolute", left: 38, top: "calc(100% - 6px)", zIndex: 1, fontSize: 12, color: "var(--danger)",
                      background: "var(--surface)", border: "1px solid var(--danger-border)", borderRadius: 6, padding: "2px 8px", boxShadow: "0 4px 12px #0001"
                    }}>{draft.trim()} is already saved</div>
                  )}
                </div>
                <button onClick={save} disabled={!renamed} aria-label="Save name" style={{ ...iconBtn, color: renamed ? "var(--accent)" : "var(--border-strong)", cursor: renamed ? "pointer" : "default" }}><CheckIcon size={18} /></button>
                <button onClick={() => setEditing(null)} aria-label="Cancel" style={{ ...iconBtn, fontSize: 20 }}>×</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <button onClick={() => startEdit(c.name)} aria-label={`Rename ${c.name}`} style={iconBtn}><PencilIcon size={15} /></button>
                <button onClick={() => setConfirm({ name: c.name })} aria-label={`Remove ${c.name}`} title="Remove" style={{ ...iconBtn, color: "var(--danger)" }}><TrashIcon size={16} /></button>
              </>
            )}
          </div>
        ))}
      </div>
      {/* Removing only stops the suggestions; saved splits keep their names */}
      {confirm && (
        <ConfirmModal
          title={confirm.all ? "Remove all saved people?" : `Remove ${confirm.name}?`}
          message={confirm.all
            ? "They won't be suggested when you add people. Your saved splits keep their names."
            : `${confirm.name} won't be suggested when you add people. Your saved splits keep the name.`}
          confirmLabel={confirm.all ? "Remove all" : "Remove"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.all) { setSavedNames([]); flash("All saved people removed."); }
            else { setSavedNames(prev => forget(prev, confirm.name)); flash(`${confirm.name} removed from saved people.`); }
            setConfirm(null);
          }}
        />
      )}
    </div>
    </>
  );
}

export function SettingsPage({ onKeyChanged, onEraseAll, savedNames, setSavedNames, history, onRenamePerson, payment, setPayment, theme, setTheme, focus, onFocused }) {
  // Opened from a shortcut (e.g. Saved > Manage): jump to that section once
  useEffect(() => {
    if (!focus) return;
    document.getElementById(focus)?.scrollIntoView({ block: "start" });
    onFocused?.();
  }, [focus, onFocused]);
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

  // Everything bill scanning keeps on this device: downloaded readers and saved cloud keys
  const [scanStore, setScanStore] = useState({ keys: {}, engines: {} });
  const refreshScanStore = async (cfg) => {
    const keys = await loadVisionKeys(cfg).catch(() => ({}));
    const engines = Object.fromEntries(await Promise.all(Object.keys(ENGINES).map(async id => [id, await isEngineReady(id)])));
    setScanStore({ keys, engines });
  };
  useEffect(() => { if (config !== undefined && !editing) refreshScanStore(config); }, [config, editing]);
  // Removing the thing in use also stops using it
  const stopIfActive = async (provider) => {
    if (config?.provider !== provider) return;
    await deleteSecret("vision");
    setConfig(null);
    onKeyChanged();
  };

  const removeDownload = async (id) => {
    if (!window.confirm(`Remove the On Device AI download (${ENGINES[id]?.label})? This frees about ${ENGINES[id]?.sizeMB} MB.`)) return;
    await removeEngine(id);
    await stopIfActive(`local-${id}`);
    await refreshScanStore(config?.provider === `local-${id}` ? null : config);
    flash("On Device AI download removed.");
  };

  const removeSavedKey = async (provider) => {
    if (!window.confirm(`Remove the saved ${PROVIDERS[provider].label} key from this device?`)) return;
    await forgetCloudKey(provider);
    await stopIfActive(provider);
    await refreshScanStore(config?.provider === provider ? null : config);
    flash("API key removed.");
  };

  const eraseAll = async () => {
    if (!window.confirm("Erase all SplitEasy data on this device, including history, saved people, your UPI ID and the API key? This can't be undone.")) return;
    await clearAllSecrets();
    onEraseAll();
    setConfig(null);
    onKeyChanged();
    flash("All app data erased.");
  };

  return (
    <div className="fill">

      {notice && (
        <div style={{ fontSize: 13, color: "var(--success-text)", background: "var(--success-soft)", border: "1px solid var(--success-border)", borderRadius: 8, padding: "8px 14px", marginBottom: 16 }}><CheckIcon size={13} /> {notice}</div>
      )}

      <InstallBanner permanent title={<div style={sectionTitle}>Install app</div>} />

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

      <div style={sectionTitle}>Bill scanning</div>
      <div style={card}>
        {editing && <ScanSetupSheet config={config} onSave={saveKey} onClose={() => setEditing(false)} />}
        {config === undefined ? null : (() => {
          const downloads = Object.keys(ENGINES).filter(id => scanStore.engines[id]);
          const keys = Object.keys(scanStore.keys).filter(id => PROVIDERS[id]);
          const subhead = { fontSize: 12, fontWeight: 600, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: 0.4, margin: "14px 0 4px" };
          const itemRow = (key, label, detail, onRemove) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--divider)" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ color: "var(--muted)", marginLeft: 6, fontFamily: detail.startsWith("About") ? "inherit" : "ui-monospace, monospace", fontSize: 13 }}>{detail}</span>
              </span>
              <button onClick={onRemove} style={{ ...outlineBtn("var(--danger)", "var(--danger-border)"), flex: "none", padding: "6px 12px", fontSize: 13 }}>Remove</button>
            </div>
          );
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  <span style={{ color: "var(--muted)" }}>In use</span>
                  <span style={{ fontWeight: 600, marginLeft: 8 }}>{config ? readerLabel(config) : "Not set up"}</span>
                </span>
                <button onClick={() => setEditing(true)} style={{ ...outlineBtn(config ? "var(--text-2)" : "var(--accent)", config ? "var(--border)" : "var(--accent)"), flex: "none", padding: "6px 14px", fontSize: 13 }}>{config ? "Change" : "Set up"}</button>
              </div>
              {downloads.length > 0 && <>
                <div style={subhead}>On Device AI</div>
                {downloads.map(id => itemRow(id, ENGINES[id].label, `About ${ENGINES[id].sizeMB} MB`, () => removeDownload(id)))}
              </>}
              {keys.length > 0 && <>
                <div style={subhead}>Saved AI keys</div>
                {keys.map(id => itemRow(id, PROVIDERS[id].label, maskKey(scanStore.keys[id].apiKey), () => removeSavedKey(id)))}
              </>}
            </>
          );
        })()}
      </div>

      <SavedPeopleSettings savedNames={savedNames} setSavedNames={setSavedNames} history={history} onRenamePerson={onRenamePerson} flash={flash} />

      <div style={sectionTitle}>Data on this device</div>
      <div style={card}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
          Your split in progress, history, saved people, UPI ID and API key are stored only in this browser. Nothing is uploaded except bill photos you choose to scan.
        </div>
        {/* Clearing the current split lives in the split's footer; clearing history on the History page */}
        <button onClick={eraseAll} style={{ ...outlineBtn("#fff", "var(--danger)"), background: "var(--danger)", width: "100%" }}>Erase all app data</button>
      </div>
      {/* Which build this device is running; handy when an installed app hasn't picked up an update yet */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "var(--subtle)", margin: "16px 0" }}>
        <span>Build {__APP_BUILD__}</span>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/abhishek-bruno/bill-splitter" target="_blank" rel="noreferrer" style={{ color: "var(--subtle)", display: "inline-flex", alignItems: "center", gap: 5, padding: 4, textDecoration: "none" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
          Star on GitHub
        </a>
      </div>
    </div>
  );
}
