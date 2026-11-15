import { useEffect, useRef, useState } from "react";
import { Avatar } from "../components/Avatar.jsx";
import { ConfirmModal } from "../components/ConfirmModal.jsx";
import { CheckIcon, PencilIcon, TrashIcon } from "../components/icons.jsx";
import { card, inputStyle, labelStyle, outlineBtn, sectionTitle } from "../components/styles.js";
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
    <div style={{ marginBottom: people.length ? 8 : 0 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input ref={newInput} value={newName} onChange={e => { setNewName(e.target.value); setExists(""); adder.clearHint(); }}
          onKeyDown={e => e.key === "Enter" && adder.submit(newName)}
          placeholder="Add a person" aria-label="Add a person" autoComplete="off"
          style={{ ...inputStyle, height: 36, padding: "0 12px", border: `1px solid ${exists ? "var(--danger)" : "var(--border)"}`, flex: 1, minWidth: 0 }} />
        <button onClick={() => adder.submit(newName)} disabled={!newName.trim()} style={{
          flex: "0 0 auto", height: 36, padding: "0 16px", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, fontFamily: "inherit",
          background: newName.trim() ? "var(--accent)" : "var(--surface-2)", color: newName.trim() ? "#fff" : "var(--subtle)",
          cursor: newName.trim() ? "pointer" : "default", transition: "background .15s"
        }}>Add</button>
      </div>
      {exists && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{exists}</div>}
      {adder.hint && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>{adder.hint}</div>}
      {adder.dialog}
    </div>
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
                  <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus aria-label={`New name for ${c.name}`}
                    onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(null); }}
                    style={{ ...inputStyle, height: 28, padding: "0 8px", fontWeight: 600, borderColor: taken ? "var(--danger)" : undefined }} />
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
      <div style={{ textAlign: "center", fontSize: 11, color: "var(--subtle)", margin: "16px 0" }}>Build {__APP_BUILD__}</div>
    </div>
  );
}
