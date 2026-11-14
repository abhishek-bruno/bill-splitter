import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PROVIDERS, parseBillImage, upgradeModel, cleanApiKey, isValidApiKey, isLocalProvider } from "./vision.js";
import { ENGINES, isEngineReady, downloadEngine, removeEngine } from "./local/models.js";
import { saveSecret, loadSecret, deleteSecret, clearAllSecrets } from "./secureStore.js";
import InstallBanner from "./InstallPrompt.jsx";
import { UPI_ID_PATTERN, supportsUpi, buildShareText, buildGroupShareText, shareOrCopy, upiRequest, copyText, sharesOf, isUneven, roundAdjust } from "./payment.js";
import { PayQrSheet, Sheet } from "./GPay.jsx";

const COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"
];

// Arrow pointing up-right, for links that go somewhere else (external sites, other screens)
function ArrowUpRight({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M7 17 17 7" /><path d="M8 7h9v9" />
    </svg>
  );
}

// Small stroke icons sized to the surrounding text; they replace text symbols like ← → ✓ ▾
function Icon({ d, size = 14, strokeWidth = 2.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, verticalAlign: "-0.15em" }}>
      <path d={d} />
    </svg>
  );
}
const ArrowLeftIcon = (props) => <Icon d="M19 12H5M12 19l-7-7 7-7" {...props} />;
const ArrowRightIcon = (props) => <Icon d="M5 12h14M12 5l7 7-7 7" {...props} />;
const CheckIcon = (props) => <Icon d="M20 6 9 17l-5-5" {...props} />;
const ChevronIcon = ({ up, ...props }) => <Icon d={up ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} {...props} />;

// Line icons for places that used emoji
function Glyph({ size = 18, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{children}</svg>
  );
}
const ReceiptIcon = (p) => <Glyph {...p}><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2" /><path d="M9 7h6M9 11h6M13 15h2" /></Glyph>;
const PencilIcon = (p) => <Glyph {...p}><path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4" /><path d="m13.5 6.5 4 4" /></Glyph>;
const CameraIcon = (p) => <Glyph {...p}><path d="M5 7h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h6a1 1 0 0 1 1 1 2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" /><circle cx="12" cy="13" r="3" /></Glyph>;
const PhotoIcon = (p) => <Glyph {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 15-5-5L5 20" /></Glyph>;
const LockIcon = (p) => <Glyph {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></Glyph>;

// Share (three connected dots) and QR code glyphs for the summary buttons
function ShareIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
function QrIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </svg>
  );
}

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

// Earlier steps are buttons that jump back; the current and later ones are plain labels.
// Three steps of work; Settle is the result screen, where the bar is hidden
function StepBar({ current, onJump }) {
  const labels = ["Bill", "People", "Split"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {labels.map((l, i) => {
        const canJump = onJump && i < current;
        const Step = canJump ? "button" : "div";
        return (
        <div key={l} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? 1 : 0 }}>
          <Step {...(canJump && { onClick: () => onJump(i), "aria-label": `Back to ${l}`, title: `Back to ${l}` })}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, fontFamily: "inherit", cursor: canJump ? "pointer" : "default" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i <= current ? "var(--accent)" : "var(--border)",
              color: i <= current ? "#fff" : "var(--subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, transition: "all .2s"
            }}>{i + 1}</div>
            <span style={{ fontSize: 10, color: i === current ? "var(--accent)" : "var(--subtle)", fontWeight: 600, whiteSpace: "nowrap" }}>{l}</span>
          </Step>
          {i < labels.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? "var(--accent)" : "var(--border)", margin: "0 6px", marginBottom: 18, transition: "all .2s" }} />
          )}
        </div>
        );
      })}
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
// Example names for empty item rows, one per row, in keeping with the "e.g. Barbeque Nation" bill name
const ITEM_EXAMPLES = ["e.g. Non-veg buffet", "e.g. Veg buffet", "e.g. Mocktail", "e.g. Fresh lime soda", "e.g. Kulfi"];
const blankItem = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", amount: "" });
const toRows = (list, fallbackId) => list?.length
  ? list.map(x => ({ ...x, amount: String(x.amount) }))
  : [{ id: fallbackId, name: "", amount: "" }];

// Saved people: most-recent-first { name }, deduped case-insensitively.
// Older saves are plain name strings (and briefly carried a phone), so everything goes through asContact.
const asContact = (x) => ({ name: typeof x === "string" ? x : x?.name || "" });
const remember = (list, values, max) => {
  const out = [];
  [...values, ...list].map(asContact).forEach(c => {
    const name = c.name.trim();
    if (name && !out.some(x => x.name.toLowerCase() === name.toLowerCase())) out.push({ name });
  });
  return out.slice(0, max);
};
const forget = (list, name) => list.map(asContact).filter(x => x.name.toLowerCase() !== name.toLowerCase());

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
  <ConfirmButton label={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Glyph size={13}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></Glyph> Reset</span>} prompt="Delete progress?" onConfirm={onReset} needsConfirm={hasData} />
);

// Home page promises: small icon chips under the headline; icons are 24x24 stroke paths
const FEATURES = [
  { title: "Fully local", // cloud with a slash
    points: [
      "Your splits, history and saved people stay in this browser. There's no server and no tracking.",
      "Works offline once installed.",
      "On Device AI reads bills on your phone. With Cloud AI, only the bill photo goes to the provider you pick."
    ],
    icon: <><path d="M2 2l20 20" /><path d="M5.8 5.8A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.3-.2" /><path d="M21.5 16.5A4.5 4.5 0 0 0 17.5 10h-1.8A7 7 0 0 0 10 5.1" /></> },
  { title: "No sign-up", // person with a cross
    points: [
      "Open the app and start splitting. No account, email or phone number.",
      "Friends don't need the app. They get a link with their share and a UPI button."
    ],
    icon: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><path d="M17 8l5 5M22 8l-5 5" /></> },
  { title: "Free", // gift box
    points: [
      "No ads, no subscription, no limits.",
      "On Device AI scanning is free. Cloud AI uses your own key, and Google Gemini has a free tier."
    ],
    icon: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></> }
];

// Home intro: a little drawing of what the app does (a bill shared by three friends), the headline,
// and the promises as chips. Styles in index.css (.hero-*)
function HomeHero() {
  const [open, setOpen] = useState(null); // index of the promise the sheet opens on
  return (
    <div className="hero">
      <div className="hero-art" aria-hidden="true">
        <div className="hero-bill">
          <div className="hero-bill-title" />
          {[62, 48, 70, 40].map((w, i) => (
            <div key={i} className="hero-bill-row"><span style={{ width: `${w}%` }} /><span /></div>
          ))}
          <div className="hero-bill-total"><span /><span /></div>
        </div>
        <div className="hero-people">
          {[0, 1, 2].map(i => (
            <span key={i} style={{ background: COLORS[i] }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.5" /><path d="M3.5 21a8.5 8.5 0 0 1 17 0z" /></svg>
            </span>
          ))}
        </div>
      </div>
      <div className="hero-title">Split any bill by item in seconds</div>
      <div className="hero-chips">
        {FEATURES.map(f => (
          <button key={f.title} type="button" className="hero-chip" onClick={() => setOpen(FEATURES.indexOf(f))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.icon}</svg>
            {f.title}
          </button>
        ))}
      </div>
      {open !== null && <PromiseSheet start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// The three promises as a swipeable carousel (native scroll snapping), opened on the chip that was tapped
function PromiseSheet({ start, onClose }) {
  const track = useRef(null);
  const [index, setIndex] = useState(start);
  useLayoutEffect(() => { const t = track.current; if (t) t.scrollLeft = start * t.clientWidth; }, [start]);
  const onScroll = () => { const t = track.current; setIndex(Math.round(t.scrollLeft / t.clientWidth)); };
  const go = (i) => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" });
  return (
    <Sheet title="Why SplitEasy" onClose={onClose}>
      <div ref={track} onScroll={onScroll} className="promise-track">
        {FEATURES.map(f => (
          <div key={f.title} className="promise-slide">
            <div style={{ width: 56, height: 56, borderRadius: 28, margin: "0 auto 12px", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.icon}</svg>
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, textAlign: "center", marginBottom: 14 }}>{f.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {f.points.map(t => (
                <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--success)", marginTop: 2, flexShrink: 0 }}><CheckIcon size={15} /></span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16 }}>
        {FEATURES.map((f, i) => (
          <button key={f.title} onClick={() => go(i)} aria-label={f.title} aria-current={i === index} style={{
            width: i === index ? 18 : 6, height: 6, borderRadius: 3, border: "none", padding: 0, cursor: "pointer",
            background: i === index ? "var(--accent)" : "var(--border-strong)", transition: "width .2s, background .2s"
          }} />
        ))}
      </div>
    </Sheet>
  );
}

// Top navigation row shown on every screen: Back on the left, Reset on the right
function TopBar({ onBack, onReset, hasData }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 24, marginBottom: 16 }}>
      {onBack ? <button onClick={onBack} style={linkBtn}><ArrowLeftIcon size={16} /> Back</button> : <span />}
      <ResetButton onReset={onReset} hasData={hasData} />
    </div>
  );
}

// Secondary Back button beside the primary action in the footer; as wide as its label
const footerBackBtn = {
  flex: "0 0 auto", border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)",
  borderRadius: 10, padding: "12px 16px", fontWeight: 700, cursor: "pointer", fontSize: 15, whiteSpace: "nowrap",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
};

// Centered yes/no dialog; Escape or a tap outside cancels. Rendered on <body> so the dimmed backdrop
// also covers the sticky header (which sits in its own stacking layer).
function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return createPortal(
    <div onClick={onCancel} className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 60, background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="alertdialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={el => el?.focus()} onClick={e => e.stopPropagation()} className="dialog-in" style={{
        outline: "none",
        width: "100%", maxWidth: 340, background: "var(--surface)", color: "var(--text)", borderRadius: 16, padding: "20px 18px 16px", boxShadow: "0 12px 40px #0004"
      }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5, marginBottom: 18 }}>{message}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, border: "none", background: "var(--danger)", color: "#fff", borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Reset (or, on a saved summary, delete) as an icon button at the left of the footer; asks first
// when there is something to lose
function FooterReset({ onReset, needsConfirm = true, deletes = false }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button onClick={() => (needsConfirm ? setAsking(true) : onReset())} aria-label={deletes ? "Delete split" : "Reset split"} title={deletes ? "Delete" : "Reset"} style={{
        flex: "0 0 48px", border: "1.5px solid var(--danger-border)", background: "var(--surface)", color: "var(--danger)",
        borderRadius: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {deletes
            ? <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
            : <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>}
        </svg>
      </button>
      {asking && (
        <ConfirmModal
          title={deletes ? "Delete split?" : "Reset split?"}
          message={deletes ? "Are you sure? It will also be removed from History." : "Are you sure you want to start over?"}
          confirmLabel={deletes ? "Delete" : "Reset"}
          onCancel={() => setAsking(false)}
          onConfirm={() => { setAsking(false); onReset(); }}
        />
      )}
    </>
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
// Saved cloud keys, one per provider ({ google: { apiKey, model }, ... }), kept apart from the active choice
// so switching readers (or providers) never loses a key. Includes the active cloud key from older saves.
async function loadVisionKeys(active) {
  const keys = (await loadSecret("visionKeys").catch(() => null)) || {};
  if (active?.apiKey && PROVIDERS[active.provider] && !keys[active.provider]) keys[active.provider] = { apiKey: active.apiKey, model: active.model };
  return keys;
}
async function rememberCloudKey(cfg) {
  if (!PROVIDERS[cfg?.provider] || !cfg.apiKey) return;
  const keys = await loadVisionKeys(null);
  keys[cfg.provider] = { apiKey: cfg.apiKey, model: cfg.model };
  await saveSecret("visionKeys", keys);
}
async function forgetCloudKey(provider) {
  const keys = await loadVisionKeys(null);
  delete keys[provider];
  await saveSecret("visionKeys", keys);
}

async function loadVisionConfig() {
  const saved = await loadSecret("vision");
  if (!saved) return saved;
  const upgraded = { ...upgradeModel(saved), apiKey: cleanApiKey(saved.apiKey) };
  if (upgraded.model !== saved.model || upgraded.apiKey !== saved.apiKey) await saveSecret("vision", upgraded);
  return upgraded;
}

function ApiKeySettings({ config, savedKeys = {}, onSave, onCancel, heading = true, children }) {
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
        <input value={model} onChange={e => setModel(e.target.value)} placeholder={`Model ID, e.g. ${p.defaultModel}`} spellCheck={false} autoCapitalize="none" autoFocus style={{ ...inputStyle, marginBottom: 14 }} />
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

// The scanned bill photo, to compare with what was read
function PhotoSheet({ file, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <Sheet title="Bill" onClose={onClose}>
      {url && <img src={url} alt="Scanned bill" style={{ width: "100%", borderRadius: 10, display: "block" }} />}
    </Sheet>
  );
}
// Home footer buttons: primary (accent) or outlined, icon + label, thumb-sized
const homeBtn = (primary) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", borderRadius: 12, padding: "14px 12px",
  fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  border: primary ? "none" : "1.5px solid var(--border)", background: primary ? "var(--accent)" : "var(--surface)", color: primary ? "#fff" : "var(--text-2)"
});
// Small outlined buttons on the scanned bill card
const cardBtn = { display: "inline-flex", alignItems: "center", gap: 5, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

// How bills are read, as a bottom sheet (scan flow and Settings): on this device, or a cloud AI with your key
function ApiKeySheet({ config, onSave, onClose, onRemove }) {
  const local = isLocalProvider(config?.provider);
  const [savedKeys, setSavedKeys] = useState(null);
  useEffect(() => { loadVisionKeys(config).then(setSavedKeys).catch(() => setSavedKeys({})); }, [config]);
  // A cloud key is kept per provider on save; choosing On Device AI only changes the active reader
  const save = async (cfg) => { await rememberCloudKey(cfg); onSave(cfg); };
  // New users start on the free on-device tab; people with a cloud key start on theirs
  const [tab, setTab] = useState(config && !local ? "cloud" : "device");
  return (
    <Sheet title="How to read bills" onClose={onClose}>
      <div role="tablist" style={{ display: "flex", gap: 4, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, marginBottom: 16 }}>
        {[["device", "On Device AI"], ["cloud", "Cloud AI"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{
            flex: 1, border: "none", borderRadius: 8, padding: "8px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: tab === id ? "var(--surface)" : "transparent", color: tab === id ? "var(--accent)" : "var(--muted)",
            boxShadow: tab === id ? "0 1px 3px #0001" : "none"
          }}>{label}</button>
        ))}
      </div>
      {tab === "device" ? (
        <LocalEngines config={config} onUse={(id) => onSave({ provider: `local-${id}` })} />
      ) : savedKeys && (
        // Removing a key lives in Settings > Bill scanning
        <ApiKeySettings config={local ? null : config} savedKeys={savedKeys} onSave={save} onCancel={onClose} heading={false} />
      )}
    </Sheet>
  );
}

// On-device readers: nothing downloads until the user agrees; then Use (removing is in Settings)
function LocalEngines({ config, onUse }) {
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
      await (await import("./local/basicScan.js")).warmUp();
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

// "Google Gemini" or "On Device AI (Basic)" for a saved config
const readerLabel = (cfg) => isLocalProvider(cfg?.provider)
  ? `On Device AI (${ENGINES[cfg.provider.slice(6)]?.label || "Basic"})`
  : PROVIDERS[cfg?.provider]?.label || "";

// The scanned bill photo survives a refresh: a reduced JPEG kept in Cache Storage until the split is reset
const PHOTO_CACHE = "spliteasy-scan-photo", PHOTO_KEY = "/scan-photo";
async function storeScanPhoto(file) {
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
async function loadScanPhoto() {
  try {
    const res = await (await caches.open(PHOTO_CACHE)).match(PHOTO_KEY);
    return res ? new File([await res.blob()], "bill.jpg", { type: "image/jpeg" }) : null;
  } catch { return null; }
}
const clearScanPhoto = () => { try { caches.delete(PHOTO_CACHE); } catch { /* unavailable */ } };
// Drops the bill form's draft from storage (before the form remounts on Reset / a new split)
const clearBillDraft = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAll(), billDraft: null })); } catch { /* unavailable */ }
  clearScanPhoto();
};

// Small per-device preferences; storage can be unavailable (private mode), so failures are ignored
const TAX_SPLIT_PREF = "spliteasy:taxSplit";
const ROUND_OFF_PREF = "spliteasy:roundOff";
const readPref = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const writePref = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

function BillStep({ initial, onDone, onReset, keyVersion, mode, setMode, onBack }) {
  // An unfinished form is saved as a draft, so a refresh doesn't lose it; a submitted bill takes priority
  const [draft, setDraft] = usePersisted("billDraft", null);
  const start = initial ? null : draft;
  const [error, setError] = useState("");
  const [restaurant, setRestaurant] = useState(initial ? (initial.restaurant === "My Bill" ? "" : initial.restaurant || "") : start?.restaurant || "");
  const [currency, setCurrency] = useState(initial?.currency || start?.currency || "₹");
  const [items, setItems] = useState(() => toRows(initial?.items || start?.items, "1"));
  const [taxes, setTaxes] = useState(() => toRows(initial?.taxes || start?.taxes, "t1"));
  // "equal" | "proportional", chosen on the Assign step. A new bill starts with the last choice made on this device.
  const [taxSplit] = useState(() => initial?.taxSplit || readPref(TAX_SPLIT_PREF) || "equal");
  // Round the total to the nearest rupee; a new bill starts with the last choice made on this device
  const [roundOff, setRoundOffState] = useState(() => initial?.roundOff ?? start?.roundOff ?? readPref(ROUND_OFF_PREF) === "1");
  const setRoundOff = (on) => { setRoundOffState(on); writePref(ROUND_OFF_PREF, on ? "1" : "0"); };
  const [showPhoto, setShowPhoto] = useState(false);

  // Photo scanning
  const [apiConfig, setApiConfig] = useState(undefined); // undefined = loading, null = not set
  // Reader setup sheet: null (closed) or open; after setup the home footer offers Scan bill / Gallery
  const [keySheet, setKeySheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [scanned, setScanned] = useState(!!start?.scanned);
  const [scanCheck, setScanCheck] = useState(start?.scanCheck || null); // printed vs computed total
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
    setKeySheet(null);
    setError("");
    // Changed reader on the reading screen: read the same photo again with it (no need to pick it again)
    if (mode === "upload" && lastFile) scanFile(lastFile, cfg);
  };

  const removeConfig = async () => {
    await deleteSecret("vision");
    setApiConfig(null);
    setKeySheet(null);
  };

  const [lastFile, setLastFile] = useState(null); // kept so a failed scan can be retried without retaking the photo

  // After a refresh, bring back the scanned photo for the bill card
  useEffect(() => {
    if (!scanned || lastFile) return;
    loadScanPhoto().then(f => { if (f) { setLastFile(f); setPreview(URL.createObjectURL(f)); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A photo from the camera or gallery goes straight to the reading screen
  const scanRun = useRef(0); // bumping it makes an in-flight scan's result be ignored (Cancel)
  const handleFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) { setError("Please choose an image file."); return; }
    setPreview(URL.createObjectURL(file));
    setLastFile(file);
    storeScanPhoto(file);
    setMode("upload");
    scanFile(file);
  };

  const scanFile = async (file, config = apiConfig) => {
    const run = ++scanRun.current; // a newer scan (or Cancel) makes this one's result be ignored
    setError("");
    setLoading(true);
    try {
      const bill = await parseBillImage(file, config);
      if (run !== scanRun.current) return; // cancelled
      setRestaurant(bill.restaurant);
      if (bill.currency) setCurrency(bill.currency);
      setItems(toRows(bill.items, "1"));
      setTaxes(toRows(bill.taxes, "t1"));
      setScanCheck(bill.scanCheck || null);
      if (bill.roundOff) setRoundOffState(true); // the bill shows a round-off line
      setScanned(true);
      setMode("manual");
    } catch (e) {
      if (run === scanRun.current) setError(e.message || "Could not read the bill.");
    } finally {
      if (run === scanRun.current) setLoading(false);
    }
  };
  const cancelScan = () => { scanRun.current++; setLoading(false); setError(""); goLandingRef.current?.(); };
  const goLandingRef = useRef(null);

  // Focus the name field of a newly added row once it has rendered
  const [focusRowId, setFocusRowId] = useState(null);
  useEffect(() => {
    if (!focusRowId) return;
    document.querySelector(`[data-row-name="${focusRowId}"]`)?.focus();
    setFocusRowId(null);
  }, [focusRowId]);

  const addItem = () => { const row = blankItem(); setItems(prev => [...prev, row]); setFocusRowId(row.id); };
  // Removing the last row clears it instead, so there's always one row to type into.
  const removeItem = (id) => setItems(prev => prev.length > 1 ? prev.filter(x => x.id !== id) : [blankItem()]);
  const updateItem = (id, field, val) => setItems(prev => prev.map(x => x.id === id ? { ...x, [field]: val } : x));

  const addTax = () => { const row = blankItem(); setTaxes(prev => [...prev, row]); setFocusRowId(row.id); };
  const removeTax = (id) => setTaxes(prev => prev.length > 1 ? prev.filter(x => x.id !== id) : [blankItem()]);
  const updateTax = (id, field, val) => setTaxes(prev => prev.map(x => x.id === id ? { ...x, [field]: val } : x));

  // Long-press a row to drag it: reorder it, or drop it in the other list (an item that is really a charge,
  // like a service charge the scanner read as an item, or the other way round)
  const listRefs = { item: useRef(null), tax: useRef(null) };
  const [drag, setDrag] = useState(null); // { from, id, dy, to, index, lineTop }
  const dragRef = useRef(null);

  const scrollerOf = (el) => {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement;
  };

  // Which list the finger is over (the nearest one), and where among its other rows the row would land
  const dropTarget = (y, id) => {
    let best = null, bestDist = Infinity;
    for (const k of ["item", "tax"]) {
      const el = listRefs[k].current;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (dist < bestDist) { bestDist = dist; best = { k, el }; }
    }
    const rows = [...best.el.querySelectorAll("[data-drag-row]")].filter(el => el.dataset.dragRow !== id);
    let index = rows.findIndex(el => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (index === -1) index = rows.length;
    const lineTop = !rows.length ? 0 : index < rows.length ? rows[index].offsetTop - 5 : rows[rows.length - 1].offsetTop + rows[rows.length - 1].offsetHeight + 3;
    return { to: best.k, index, lineTop };
  };

  // Long-press a row (not the field being typed in, so its own long-press for select/paste still works).
  // Moving the finger before the press completes cancels it, so the page scrolls as usual.
  const pressRow = (e, from, id) => {
    if (e.button > 0 || dragRef.current) return;
    if (e.currentTarget.contains(document.activeElement) && e.target === document.activeElement) return;
    const x0 = e.clientX, y0 = e.clientY;
    const off = () => { clearTimeout(timer); window.removeEventListener("pointermove", early); window.removeEventListener("pointerup", off); window.removeEventListener("pointercancel", off); };
    const early = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) off(); };
    const timer = setTimeout(() => { off(); beginDrag(from, id, y0); }, 400);
    window.addEventListener("pointermove", early);
    window.addEventListener("pointerup", off);
    window.addEventListener("pointercancel", off);
  };

  const beginDrag = (from, id, y) => {
    document.activeElement?.blur?.();
    window.getSelection?.()?.removeAllRanges();
    const scroller = scrollerOf(listRefs.item.current);
    const onMove = (ev) => { if (dragRef.current) dragRef.current.y = ev.clientY; };
    const onUp = () => endDrag(true);
    const onCancel = () => endDrag(false);
    // While dragging, the finger moves the row, not the page; and lifting it doesn't tap the field below
    const block = (ev) => ev.cancelable && ev.preventDefault();
    const listeners = [["pointermove", onMove], ["pointerup", onUp], ["pointercancel", onCancel], ["touchmove", block], ["touchend", block], ["contextmenu", block]];
    listeners.forEach(([t, fn]) => window.addEventListener(t, fn, { passive: false }));
    const d = { from, id, startY: y, y, scroller, startScroll: scroller.scrollTop, cleanup: () => listeners.forEach(([t, fn]) => window.removeEventListener(t, fn)) };
    dragRef.current = d;
    navigator.vibrate?.(10);
    document.body.style.userSelect = "none";
    const tick = () => {
      const cur = dragRef.current;
      if (!cur) return;
      // Scroll when held near the top, or near the footer at the bottom
      const edge = cur.y < 90 ? -1 : cur.y > window.innerHeight - 160 ? 1 : 0;
      if (edge) cur.scroller.scrollTop += edge * 8;
      const dy = cur.y - cur.startY + (cur.scroller.scrollTop - cur.startScroll);
      setDrag({ from, id, dy, ...dropTarget(cur.y, id) });
      cur.raf = requestAnimationFrame(tick);
    };
    tick();
  };
  const endDrag = (commit) => {
    const d = dragRef.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    d.cleanup();
    dragRef.current = null;
    document.body.style.userSelect = "";
    const target = commit ? dropTarget(d.y, d.id) : null;
    setDrag(null);
    if (!target) return;
    const src = d.from === "item" ? items : taxes;
    const row = src.find(r => r.id === d.id);
    if (!row) return;
    if (target.to === "item" && parseFloat(row.amount) < 0) return; // a discount can't be an item
    const blank = (r) => !r.name.trim() && !String(r.amount).trim();
    if (target.to === d.from) {
      const rest = src.filter(r => r.id !== d.id);
      rest.splice(target.index, 0, row);
      (d.from === "item" ? setItems : setTaxes)(rest);
    } else {
      const moved = { id: row.id, name: row.name, amount: row.amount };
      const rest = src.filter(r => r.id !== d.id);
      (d.from === "item" ? setItems : setTaxes)(rest.length ? rest : [blankItem()]);
      (target.to === "item" ? setItems : setTaxes)(prev => {
        const list = prev.length === 1 && blank(prev[0]) ? [] : [...prev];
        list.splice(Math.min(target.index, list.length), 0, moved);
        return list;
      });
    }
  };
  // Style for a row while dragged (follows the finger) and for a list the row would move into
  const dragRowStyle = (id) => drag?.id === id ? {
    transform: `translateY(${drag.dy}px) scale(1.02)`, position: "relative", zIndex: 5,
    background: "var(--surface)", borderRadius: 10, boxShadow: "0 8px 24px #0002", opacity: 0.97
  } : null;
  const dropListStyle = (kind) => ({
    position: "relative", borderRadius: 10, transition: "background .15s, box-shadow .15s",
    ...(drag && drag.to === kind && drag.from !== kind && { background: "var(--accent-soft)", boxShadow: "0 0 0 6px var(--accent-soft)" })
  });
  const dropLine = (kind) => drag && drag.to === kind && (
    <div style={{ position: "absolute", left: 0, right: 0, top: drag.lineTop, height: 2, borderRadius: 1, background: "var(--accent)", pointerEvents: "none" }} />
  );

  const submitManual = () => {
    const validItems = items.filter(i => i.name.trim() && parseFloat(i.amount) > 0)
      .map(i => ({ ...i, name: i.name.trim(), amount: parseFloat(i.amount) }));
    if (validItems.length === 0) { setError("Add at least one item with a name and amount."); return; }
    // Charges can be negative (a discount)
    const validTaxes = taxes.filter(t => t.name.trim() && parseFloat(t.amount) && !Number.isNaN(parseFloat(t.amount)))
      .map(t => ({ ...t, name: t.name.trim(), amount: parseFloat(t.amount) }));
    const raw = validItems.reduce((s, i) => s + i.amount, 0) + validTaxes.reduce((s, t) => s + t.amount, 0);
    const total = raw + roundAdjust({ items: validItems, taxes: validTaxes, roundOff });
    onDone({
      restaurant: restaurant.trim() || "My Bill",
      currency,
      items: validItems,
      taxes: validTaxes,
      // Keep a choice made on Assign since this form opened; a new bill uses the remembered one
      taxSplit: initial?.taxSplit || taxSplit,
      roundOff,
      total
    });
  };

  const formHasData = !!restaurant.trim() || [...items, ...taxes].some(x => x.name.trim() || String(x.amount).trim());
  // Keep the draft in step with the form (cleared once there's nothing in it)
  useEffect(() => {
    setDraft(formHasData || scanned ? { restaurant, currency, items, taxes, roundOff, scanned, scanCheck } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, currency, items, taxes, roundOff, scanned, scanCheck]);
  // Mode changes can come from the browser back button, so reset per-screen state here
  useEffect(() => {
    if (mode !== "upload") setError("");
    setKeySheet(null);
  }, [mode]);

  const goLanding = onBack;
  goLandingRef.current = goLanding;

  const keySheetEl = keySheet && (
    <ApiKeySheet config={apiConfig} onSave={saveConfig} onClose={() => setKeySheet(null)} onRemove={removeConfig} />
  );

  // The reading screen only makes sense with a photo (a reload on #/bill/scan has none): back to the start
  useEffect(() => {
    if (mode === "upload" && !lastFile) setMode(null);
  }, [mode, lastFile]);

  // One pair of hidden pickers, reachable from every screen (Scan bill, Gallery, Retake)
  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
    </>
  );

  // Landing: pick mode
  const localReader = isLocalProvider(apiConfig?.provider);
  const canScan = online || localReader; // the on-device reader works offline

  if (!mode) return (
    <div className="fill screen-in" key="home">
      {/* Intro block centers itself vertically in the space above the buttons */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 16 }}>
      <HomeHero />
      </div>
      <StickyFooter bleed>
        {/* Row 1: scan (camera / gallery) or, before setup, one setup button. Row 2: enter manually */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {apiConfig ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => cameraRef.current.click()} disabled={!canScan} style={{ ...homeBtn(true), flex: 3, opacity: canScan ? 1 : 0.5 }}><CameraIcon size={20} /> Scan bill</button>
              <button onClick={() => galleryRef.current.click()} disabled={!canScan} style={{ ...homeBtn(false), flex: 2, opacity: canScan ? 1 : 0.5 }}><PhotoIcon size={20} /> Gallery</button>
            </div>
          ) : apiConfig === null ? (
            <button onClick={() => setKeySheet("setup")} style={homeBtn(true)}><ReceiptIcon size={20} /> Set up bill scanning</button>
          ) : null}
          <button onClick={() => setMode("manual")} style={homeBtn(false)}><PencilIcon size={20} /> Enter manually</button>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 12, color: "var(--subtle)", minHeight: 18 }}>
            {apiConfig ? (
              <>
                {!canScan ? "You're offline. This reader needs internet." : <>Scans with {readerLabel(apiConfig)}</>} ·
                <button onClick={() => setKeySheet("change")} style={{ ...linkBtn, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Change</button>
              </>
            ) : apiConfig === null ? "Free On Device AI, or your own AI key" : null}
          </div>
        </div>
      </StickyFooter>
      {fileInputs}
      {keySheetEl}
    </div>
  );

  // Upload mode
  // Scan result banner (review form and, after Back, the scanner): message left, actions right
  const scanSum = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) + taxes.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  // Reading screen: the photo being read; Cancel goes home. A failed read offers ways on from the footer.
  if (mode === "upload") {
    return (
      <div className="fill screen-in" key="upload">
        {fileInputs}
        {keySheetEl}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "8px 0 16px" }}>
          {preview && (
            <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", maxWidth: "100%", boxShadow: "0 4px 20px #0002" }}>
              <img src={preview} alt="Bill" style={{ display: "block", maxHeight: "52vh", maxWidth: "100%", objectFit: "contain", opacity: loading ? 0.85 : 1 }} />
              {loading && <div className="scan-line" />}
            </div>
          )}
          {loading ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>Reading bill…</div>
              <div style={{ fontSize: 12, color: "var(--subtle)", marginTop: 2 }}>
                {readerLabel(apiConfig)} · <button onClick={() => setKeySheet("change")} style={{ ...linkBtn, display: "inline", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Change</button>
              </div>
            </div>
          ) : error && (
            // The error, and right under it which model failed with a way to change it (re-reads this photo)
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxWidth: 360, width: "100%" }}>
              <div style={{ fontSize: 14, color: "var(--danger)", background: "var(--danger-soft)", borderRadius: 10, padding: "10px 14px", textAlign: "center", width: "100%", boxSizing: "border-box" }}>{error}</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 12, color: "var(--subtle)" }}>
                Scans with {readerLabel(apiConfig)} ·
                <button onClick={() => setKeySheet("change")} style={{ ...linkBtn, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Change</button>
              </div>
            </div>
          )}
        </div>
        <style>{`.scan-line { position: absolute; left: 0; right: 0; height: 3px; background: var(--accent); box-shadow: 0 0 12px var(--accent); animation: scanmove 1.6s ease-in-out infinite alternate; }
          @keyframes scanmove { from { top: 4%; } to { top: 94%; } }`}</style>
        <StickyFooter bleed>
          {loading ? (
            <button onClick={cancelScan} style={{ ...footerBackBtn, width: "100%" }}>Cancel</button>
          ) : (
            // Couldn't read it: the same photo again, or (link below) with another model. Anything else starts from home.
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelScan} style={{ ...footerBackBtn, flex: 1 }}>Cancel</button>
              {lastFile && <button onClick={() => scanFile(lastFile)} disabled={!canScan} style={{ ...homeBtn(true), flex: 2, padding: 12 }}>Try again</button>}
            </div>
          )}
        </StickyFooter>
      </div>
    );
  }

  // Scanned bill card: photo thumbnail, whether it adds up, and Retake / View
  const billCard = scanned && (() => {
    const warn = scanCheck && !scanCheck.matches;
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", border: `1px solid ${warn ? "var(--warn-border)" : "var(--border)"}`, background: warn ? "var(--warn-soft)" : "var(--surface-2)", borderRadius: 14, padding: 10, marginBottom: 16 }}>
        {preview && (
          <button onClick={() => setShowPhoto(true)} aria-label="View bill photo" style={{ flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer", borderRadius: 8, overflow: "hidden", width: 52, height: 64 }}>
            <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
          {/* Icon and text centred on one line, starting at the same edge as the buttons below */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: warn ? "var(--warn-text)" : "var(--success-text)" }}>
            {!warn && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}><path d="M20 6 9 17l-5-5" /></svg>}
            <span>{warn ? `Adds up to ${currency}${scanSum.toFixed(2)}, bill says ${currency}${scanCheck.printedTotal.toFixed(2)}`
              : scanCheck?.matches ? "Matches the bill total" : "Scanned. Check against the bill"}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => cameraRef.current.click()} style={cardBtn}><CameraIcon size={15} /> Retake</button>
            {lastFile && <button onClick={() => setShowPhoto(true)} style={cardBtn}><PhotoIcon size={15} /> View</button>}
          </div>
        </div>
      </div>
    );
  })();

  // Manual mode (also used to review scanned results)
  const manualValid = items.some(i => i.name.trim() && parseFloat(i.amount) > 0);
  return (
    <div className="fill screen-in" key="manual">
      {fileInputs}
      {billCard}
      {showPhoto && lastFile && <PhotoSheet file={lastFile} onClose={() => setShowPhoto(false)} />}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 2 }}>
          <label style={{ display: "block", fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Bill name</label>
          <div style={{ position: "relative" }}>
            <input value={restaurant} onChange={e => setRestaurant(e.target.value)} placeholder="e.g. Barbeque Nation" style={{ ...inputStyle, paddingRight: restaurant ? 34 : 12 }} />
            {restaurant && (
              <button onClick={() => setRestaurant("")} aria-label="Clear bill name" title="Clear" style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 24, height: 24,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "none", padding: 0, color: "var(--subtle)", cursor: "pointer"
              }}><Icon d="M18 6 6 18M6 6l12 12" size={14} /></button>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {/* "₹ INR" explains itself, so no visible label; it lines up with the restaurant input */}
          <select value={currency} onChange={e => setCurrency(e.target.value)} aria-label="Currency" style={{ ...inputStyle, cursor: "pointer" }}>
            {!CURRENCIES.some(c => c.symbol === currency) && <option value={currency}>{currency}</option>}
            {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} {c.code}</option>)}
          </select>
        </div>
      </div>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Items</div>
      <div ref={listRefs.item} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8, ...dropListStyle("item") }}>
        {dropLine("item")}
        {items.map((item, idx) => (
          <div key={item.id} data-drag-row={item.id} onPointerDown={e => pressRow(e, "item", item.id)} style={{ display: "flex", gap: 8, alignItems: "center", WebkitTouchCallout: "none", ...dragRowStyle(item.id) }}>
            <input
              value={item.name} onChange={e => updateItem(item.id, "name", e.target.value)}
              placeholder={ITEM_EXAMPLES[idx % ITEM_EXAMPLES.length]} data-row-name={item.id}
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
            {(items.length > 1 || item.name || item.amount) && (
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

      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Shared Charges</div>
      <div ref={listRefs.tax} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8, ...dropListStyle("tax") }}>
        {dropLine("tax")}
        {taxes.map(tax => (
          <div key={tax.id} data-drag-row={tax.id} onPointerDown={e => pressRow(e, "tax", tax.id)} style={{ display: "flex", gap: 8, alignItems: "center", WebkitTouchCallout: "none", ...dragRowStyle(tax.id) }}>
            <input
              value={tax.name} onChange={e => updateTax(tax.id, "name", e.target.value)}
              placeholder={`e.g. GST, Service Charge`} data-row-name={tax.id}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <div style={{ position: "relative", flex: "0 0 116px" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--subtle)", fontSize: 13 }}>{currency}</span>
              <input
                value={tax.amount} onChange={e => updateTax(tax.id, "amount", e.target.value)}
                placeholder="0.00" type="number" inputMode="decimal" step="0.01" title="Use a minus sign for a discount"
                style={{ ...inputStyle, paddingLeft: 24 }}
              />
            </div>
            {(taxes.length > 1 || tax.name || tax.amount) && (
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

      {(() => {
        // Running total, to check against the paper bill
        const itemSum = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        const chargeSum = taxes.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
        const adj = roundOff ? Math.round((Math.round(itemSum + chargeSum) - (itemSum + chargeSum)) * 100) / 100 : 0;
        const fmt = (n) => `${n < 0 ? "−" : ""}${currency}${Math.abs(n).toFixed(2)}`;
        const row = (label, value, strong) => (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 400, color: strong ? "var(--text)" : "var(--muted)", padding: "3px 0" }}>
            <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
        );
        return (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", marginBottom: 20 }}>
            {row("Items", fmt(itemSum))}
            {chargeSum !== 0 && row("Shared charges", fmt(chargeSum))}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)", padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={roundOff} onChange={e => setRoundOff(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16, margin: 0 }} />
              <span style={{ flex: 1 }}>Round off</span>
              {roundOff && <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(adj)}</span>}
            </label>
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>{row("Total", fmt(itemSum + chargeSum + adj), true)}</div>
          </div>
        );
      })()}

      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <StickyFooter bleed>
        <div style={{ display: "flex", gap: 8 }}>
        <FooterReset onReset={onReset} needsConfirm={formHasData} />
        <button onClick={goLanding} style={footerBackBtn}><ArrowLeftIcon size={16} /> Back</button>
        <button onClick={submitManual} disabled={!manualValid} style={{
          flex: 2, border: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: manualValid ? "var(--accent)" : "var(--border)",
          color: manualValid ? "#fff" : "var(--subtle)",
          borderRadius: 10, padding: 13, fontWeight: 700,
          cursor: manualValid ? "pointer" : "default", fontSize: 15, transition: "all .2s"
        }}>
          Add people <ArrowRightIcon size={16} />
        </button>
        </div>
      </StickyFooter>
    </div>
  );
}

// ── Step 2: People ────────────────────────────────────────────────────────────
const MAX_SAVED_NAMES = 30;
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

// One row in the Saved list: tap to add the person (forgetting lives in Settings > Saved people)
function SavedRow({ contact, color, onPick, first }) {
  return (
    <button onClick={onPick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", borderTop: first ? "none" : "1px solid var(--divider)", cursor: "pointer", padding: "10px 4px", textAlign: "left", fontFamily: "inherit", color: "var(--text)" }}>
      <Avatar name={contact.name} color={color} size={32} />
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contact.name}</span>
      <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>+ Add</span>
    </button>
  );
}

function PeopleStep({ people, setPeople, bill, savedNames, setSavedNames, onManageSaved }) {
  const [name, setName] = useState("");

  // Adds a person (skipping blanks and anyone already in the split) and remembers them for Saved
  const addPerson = (raw = name) => {
    const n = raw.trim();
    if (!n) return;
    setName("");
    if (people.some(p => sameName(p.name, n))) return;
    setPeople(prev => {
      const used = new Set(prev.map(p => p.color));
      const color = COLORS.find(c => !used.has(c)) || COLORS[prev.length % COLORS.length];
      return [...prev, { id: Date.now().toString(), name: n, color }];
    });
    setSavedNames(prev => remember(prev, [n], MAX_SAVED_NAMES));
  };

  // Typing filters Saved
  const query = name.trim().toLowerCase();
  const suggestions = savedNames.map(asContact).filter(c =>
    c.name && !people.some(p => sameName(p.name, c.name)) && (!query || c.name.toLowerCase().includes(query))
  );

  return (
    <div>
      <div style={{ background: "var(--accent-soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--accent)" }}><ReceiptIcon size={24} /></div>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{bill.restaurant}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{bill.currency}{bill.total?.toFixed(2)} total · {bill.items?.length} {bill.items?.length === 1 ? "item" : "items"}</div>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {people.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--divider)", borderRadius: 10, padding: "10px 14px" }}>
            <Avatar name={p.name} color={p.color} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600 }}>{p.name}</span>
              {/* The first person is the payer everywhere (summary, messages, pay page) */}
              {i === 0
                ? <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>Payer</span>
                // Move them to the front; assignments are keyed by id, so order changes are safe
                : <button onClick={() => setPeople(prev => [p, ...prev.filter(x => x.id !== p.id)])} style={{ display: "block", background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit" }}>Set as payer</button>}
            </span>
            <button onClick={() => setPeople(prev => prev.filter(x => x.id !== p.id))} aria-label={`Remove ${p.name}`} style={{ background: "none", border: "none", color: "var(--subtle)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      {people.length === 0 && <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 13, padding: "16px 0" }}>Add at least 2 people to split with</div>}
      {suggestions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4, fontSize: 12, color: "var(--subtle)" }}>
            <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Saved</span>
            <button onClick={onManageSaved} aria-label="Manage saved people" title="Manage" style={{ display: "inline-flex", background: "none", border: "none", padding: 4, color: "var(--accent)", cursor: "pointer" }}>
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--divider)", borderRadius: 10, padding: "0 12px" }}>
            {suggestions.map((c, i) => (
              <SavedRow key={c.name} contact={c} color={COLORS[i % COLORS.length]} first={i === 0} onPick={() => addPerson(c.name)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Assign ────────────────────────────────────────────────────────────
function AssignStep({ bill, people, assignments, setAssignments, onTaxSplit }) {
  // An item's list holds one entry per share ([a, a, b] = a had 2 of 3), so "selected" means "appears at all"
  const addMissing = (cur) => [...cur, ...people.map(p => p.id).filter(id => !cur.includes(id))];

  // Assign everyone to every item in one tap, so people can then just be deselected where they didn't share
  const everyoneOnAll = bill.items.every(item => people.every(p => (assignments[item.id] || []).includes(p.id)));
  const toggleEveryoneOnAll = () => setAssignments(prev =>
    Object.fromEntries(bill.items.map(item => [item.id, everyoneOnAll ? [] : addMissing(prev[item.id] || [])]))
  );
  const toggle = (itemId, personId) => {
    setAssignments(prev => {
      const cur = prev[itemId] || [];
      return { ...prev, [itemId]: cur.includes(personId) ? cur.filter(x => x !== personId) : [...cur, personId] };
    });
  };
  const setShares = (itemId, personId, n) => setAssignments(prev => {
    const cur = prev[itemId] || [];
    return { ...prev, [itemId]: [...cur.filter(x => x !== personId), ...Array(Math.max(1, n)).fill(personId)] };
  });
  const makeEven = (itemId) => setAssignments(prev => ({ ...prev, [itemId]: [...new Set(prev[itemId] || [])] }));

  const [open, setOpen] = useState({}); // item id -> share counts expanded
  const stepBtn = { width: 26, height: 26, borderRadius: 13, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", cursor: "pointer", fontSize: 15, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 };

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
          const onItem = people.filter(p => assigned.includes(p.id));
          const uneven = isUneven(assigned);
          const canExpand = onItem.length > 1;
          const expanded = open[item.id] && canExpand;
          const toggleOpen = () => setOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }));
          return (
            // Tapping the card (anywhere but its buttons) opens or closes the share counts
            <div key={item.id} onClick={e => { if (canExpand && !e.target.closest("button, [data-shares]")) toggleOpen(); }}
              style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "var(--surface)", cursor: canExpand ? "pointer" : "default" }}>
              {/* One header line: name, then the split toggle next to the price */}
              {/* Same line height for all three so their first lines sit level, even when the name wraps */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8, lineHeight: "22px" }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{item.name}</span>
                {canExpand && (
                  <button onClick={toggleOpen} aria-expanded={!!expanded} style={{ background: "none", border: "none", padding: 0, fontSize: 12, lineHeight: "22px", fontWeight: 600, color: "var(--accent)", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                    {uneven ? "Split by quantity" : "Split equally"} <ChevronIcon up={expanded} size={12} />
                  </button>
                )}
                <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>{bill.currency}{item.amount.toFixed(2)}</span>
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
                    {p.name}{uneven && assigned.includes(p.id) ? ` ×${sharesOf(assigned, p.id)}` : ""}
                  </button>
                ))}
                {(() => {
                  const allSelected = people.every(p => assigned.includes(p.id));
                  return (
                    <button onClick={() => setAssignments(prev => ({ ...prev, [item.id]: allSelected ? [] : addMissing(prev[item.id] || []) }))} style={{
                      border: "2px dashed var(--border-strong)", background: "none", borderRadius: 20,
                      padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "var(--subtle)"
                    }}>{allSelected ? "None" : "All"}</button>
                  );
                })()}
              </div>
              {expanded && (
                <div data-shares style={{ marginTop: 10, borderTop: "1px solid var(--divider)", paddingTop: 8, cursor: "default" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>How many did each person have?</div>
                  {onItem.map(p => {
                    const n = sharesOf(assigned, p.id);
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                        <Avatar name={p.name} color={p.color} size={26} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{bill.currency}{(item.amount * n / assigned.length).toFixed(2)}</span>
                        </span>
                        <button onClick={() => setShares(item.id, p.id, n - 1)} disabled={n <= 1} aria-label={`Fewer for ${p.name}`} style={{ ...stepBtn, opacity: n <= 1 ? 0.4 : 1, cursor: n <= 1 ? "default" : "pointer" }}>−</button>
                        <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{n}</span>
                        <button onClick={() => setShares(item.id, p.id, n + 1)} aria-label={`More for ${p.name}`} style={stepBtn}>+</button>
                      </div>
                    );
                  })}
                  {uneven && (
                    <button onClick={() => makeEven(item.id)} style={{ background: "none", border: "none", padding: "6px 0 0", fontSize: 11, color: "var(--subtle)", cursor: "pointer", textDecoration: "underline" }}>Split equally again</button>
                  )}
                </div>
              )}
              {assigned.length === 0 && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>⚠ No one assigned</div>}
            </div>
          );
        })}
      </div>
      {bill.taxes?.length > 0 && (
        <>
          {/* How shared charges are divided, at the right end: one tap switches */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Shared Charges</span>
            <button
              onClick={() => onTaxSplit(bill.taxSplit === "proportional" ? "equal" : "proportional")}
              aria-label={bill.taxSplit === "proportional" ? "Split proportionally. Tap to split equally" : "Split equally. Tap to split proportionally"}
              title={bill.taxSplit === "proportional" ? "Tap to split equally" : "Tap to split in proportion to what each person had"}
              style={{ marginLeft: "auto", flexShrink: 0, background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: "var(--accent)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
            >
              <span style={{ fontWeight: 400, color: "var(--subtle)" }}>Split</span> {bill.taxSplit === "proportional" ? "proportionally" : "equally"}
              <Icon d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" size={11} />
            </button>
          </div>
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
// Shared charges are split equally, or (bill.taxSplit === "proportional") in proportion to what each person had
function computeTotals(bill, people, assignments) {
  // Shared pool: charges plus the round-off (if on), split the same way
  const taxTotal = (bill.taxes?.reduce((s, t) => s + t.amount, 0) || 0) + roundAdjust(bill);
  const withItems = people.map(p => {
    let itemTotal = 0;
    bill.items?.forEach(item => {
      const assigned = assignments[item.id] || [];
      const n = sharesOf(assigned, p.id); // one entry per share; usually 1
      if (n) itemTotal += item.amount * n / assigned.length;
    });
    return { ...p, itemTotal };
  });
  const itemsSum = withItems.reduce((s, p) => s + p.itemTotal, 0);
  const byItems = bill.taxSplit === "proportional" && itemsSum > 0;
  return withItems.map(p => {
    const shared = byItems ? taxTotal * p.itemTotal / itemsSum : taxTotal / (people.length || 1);
    return { ...p, shared, total: p.itemTotal + shared };
  });
}

const formatDateTime = (ts) => new Intl.DateTimeFormat(undefined, {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit"
}).format(ts);

// The first person paid the bill; everyone else owes them
const paidStatus = (entry) => {
  // Only people who owe something count (someone on no items has nothing to pay)
  const debtors = computeTotals(entry.bill, entry.people, entry.assignments).slice(1).filter(p => p.total >= 0.005);
  const paidCount = debtors.filter(p => entry.paid?.[p.id]).length;
  return { paidCount, total: debtors.length, settled: debtors.length > 0 && paidCount === debtors.length };
};

// An amount you can tap to copy (just the number, for pasting into a UPI app). A small "Copied" pill
// floats above it briefly, so nothing around it shifts.
function CopyAmount({ value, display, label, style }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button onClick={copy} aria-label={copied ? "Copied" : `Copy ${label}`} title="Tap to copy" style={{
      position: "relative", background: "none", border: "none", padding: 0, cursor: "copy", fontFamily: "inherit", color: "inherit", ...style
    }}>
      {display}
      {copied && (
        <span style={{
          position: "absolute", bottom: "100%", left: "50%", transform: "translate(-50%, -4px)", whiteSpace: "nowrap",
          fontSize: 11, fontWeight: 700, color: "#fff", background: "#111c", borderRadius: 6, padding: "2px 7px", pointerEvents: "none"
        }}><CheckIcon size={10} /> Copied</span>
      )}
    </button>
  );
}

// ── Step 4: Summary ───────────────────────────────────────────────────────────
function SummaryStep({ bill, people, assignments, payment, onOpenSettings, savedAt, paid = {}, onTogglePaid }) {
  const totals = computeTotals(bill, people, assignments);
  const owes = (p) => p.total >= 0.005;
  // With a UPI ID (₹ bills) the shared link has a pay button; otherwise it's the split breakdown
  const canPay = supportsUpi(bill) && !!payment?.upiId;
  // Expanded cards: "bill" for the top card (full breakdown), or person ids (their own lines)
  const [open, setOpen] = useState({});
  const toggle = (key) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  // Tapping a card (not its buttons) opens or closes it
  const cardTap = (key) => (e) => { if (!e.target.closest("button, a")) toggle(key); };
  // One person's lines, worded like their pay page: item name (×n when they had more than one of an
  // unevenly split item) and their share, then shared charges
  const linesFor = (p) => {
    const lines = [];
    bill.items?.forEach(item => {
      const assigned = assignments[item.id] || [];
      const n = sharesOf(assigned, p.id);
      if (!n) return;
      lines.push({ label: item.name, note: isUneven(assigned) && n > 1 ? `×${n}` : "", amount: item.amount * n / assigned.length });
    });
    const names = [...bill.taxes.map(t => t.name), ...(roundAdjust(bill) ? ["Round off"] : [])].join(", ");
    if (Math.abs(p.shared) >= 0.005) lines.push({ label: `Shared charges (${names})`, note: "", amount: p.shared });
    return lines;
  };
  const lineRow = (key, label, note, amount, color) => (
    <div key={key} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 13, color }}>
      <span style={{ flex: 1, minWidth: 0 }}>{label}{note && <span style={{ opacity: 0.6 }}> {note}</span>}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{bill.currency}{amount.toFixed(2)}</span>
    </div>
  );

  const [status, setStatus] = useState({}); // person id -> "shared" | "copied"
  const sharePayment = async (p) => {
    const text = buildShareText({ bill, person: p, assignments, people: totals, payment, paid });
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

  const [qrPerson, setQrPerson] = useState(null);
  const qrRequest = qrPerson && upiRequest({ bill, person: qrPerson, people, payment });

  return (
    <div>
      {qrRequest && <PayQrSheet person={qrPerson} request={qrRequest} onClose={() => setQrPerson(null)} />}
      {(() => {
        // Who still owes: everyone after the payer, minus those marked paid
        // Only people who actually owe something (someone on no items owes nothing)
        const debtors = totals.slice(1).filter(owes);
        const toCollect = debtors.reduce((t, p) => t + p.total, 0);
        const left = debtors.filter(p => !paid[p.id]).reduce((t, p) => t + p.total, 0);
        const paidCount = debtors.filter(p => paid[p.id]).length;
        const date = savedAt && new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(savedAt);
        return (
          <div onClick={cardTap("bill")} style={{ background: "linear-gradient(135deg, var(--accent), #8b5cf6)", borderRadius: 14, padding: "16px 18px", marginBottom: 20, color: "#fff", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bill.restaurant || "Bill"}</div>
              {date && <div title={formatDateTime(savedAt)} style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>{date}</div>}
              <button onClick={() => toggle("bill")} aria-expanded={!!open.bill} aria-label={open.bill ? "Hide full breakdown" : "Show full breakdown"} style={{ background: "none", border: "none", padding: 2, color: "#fff", opacity: 0.85, cursor: "pointer", display: "inline-flex" }}>
                <ChevronIcon up={open.bill} size={16} />
              </button>
            </div>
            {/* Total and payer on the left, a compact group-share button on the right */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <CopyAmount value={bill.total?.toFixed(2)} display={`${bill.currency}${bill.total?.toFixed(2)}`} label="bill total" style={{ fontSize: 30, fontWeight: 800, color: "#fff" }} />
                <div style={{ fontSize: 13, opacity: 0.85 }}>Paid by {totals[0]?.name} · {people.length} people</div>
              </div>
              {debtors.length > 1 && (
                <button onClick={shareGroup} aria-label={groupStatus ? (groupStatus === "copied" ? "Summary copied" : "Shared") : "Share summary with group"} title="Share summary with group" style={{
                  flexShrink: 0, borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none",
                  background: "#fff", color: groupStatus ? "var(--success-text)" : "var(--accent)",
                  display: "inline-flex", alignItems: "center", gap: 6
                }}>
                  {groupStatus ? <><CheckIcon size={14} /> {groupStatus === "copied" ? "Copied" : "Shared"}</> : <><ShareIcon size={14} /> Share</>}
                </button>
              )}
            </div>
            {debtors.length > 0 && toCollect > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 6, borderRadius: 3, background: "#ffffff40", overflow: "hidden" }}>
                  <div style={{ width: `${((toCollect - left) / toCollect) * 100}%`, height: "100%", background: "#fff", borderRadius: 3, transition: "width .3s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                  <span>{left > 0 ? `${bill.currency}${left.toFixed(2)} left to collect` : "All settled"}</span>
                  <span>{paidCount} of {debtors.length} paid</span>
                </div>
              </div>
            )}
            {/* Full breakdown: every item with who had it, then shared charges */}
            {open.bill && (
              <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #ffffff40" }}>
                {bill.items?.map(item => {
                  const assigned = assignments[item.id] || [];
                  const names = people.filter(p => assigned.includes(p.id)).map(p => isUneven(assigned) ? `${p.name} ×${sharesOf(assigned, p.id)}` : p.name);
                  return lineRow(item.id, item.name, `· ${names.join(", ") || "unassigned"}`, item.amount, "#fff");
                })}
                {bill.taxes?.map(t => lineRow(`tax-${t.id}`, t.name, bill.taxSplit === "proportional" ? "· proportional" : "· everyone", t.amount, "#fff"))}
                {roundAdjust(bill) !== 0 && lineRow("round", "Round off", "", roundAdjust(bill), "#fff")}
              </div>
            )}
          </div>
        );
      })()}
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Each person's share</div>
      {supportsUpi(bill) && !payment?.upiId && people.length > 1 && (
        <div style={{ fontSize: 13, color: "var(--muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", marginBottom: 12 }}>
          Add your UPI ID so shared links get a UPI pay button.{" "}
          <button onClick={onOpenSettings} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Add UPI ID <ArrowRightIcon size={13} /></button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {totals.map((p, i) => (
          <div key={p.id} onClick={cardTap(p.id)} style={{ border: `1.5px solid ${p.color}33`, borderRadius: 14, padding: "14px 16px", background: "var(--surface)", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={p.name} color={p.color} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                {i === 0 && <div style={{ fontSize: 11, color: "var(--muted)" }}>Payer</div>}
                {/* Paid status lives under the name: a link to mark it, and the date with an undo once paid */}
                {i > 0 && !owes(p) && <div style={{ fontSize: 11, lineHeight: "16px", height: 16, color: "var(--muted)" }}>Nothing to pay</div>}
                {i > 0 && owes(p) && paid[p.id] && (
                  <div style={{ fontSize: 11, lineHeight: "16px", height: 16, color: "var(--success-text)", fontWeight: 600 }}>
                    <span title={formatDateTime(paid[p.id])}><CheckIcon size={11} /> Paid {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(paid[p.id])}</span>
                    {onTogglePaid && <> · <button onClick={() => onTogglePaid(p.id)} style={{ background: "none", border: "none", padding: 0, fontSize: 11, lineHeight: "inherit", color: "var(--subtle)", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", verticalAlign: "baseline" }}>Undo</button></>}
                  </div>
                )}
                {i > 0 && owes(p) && !paid[p.id] && onTogglePaid && (
                  <button onClick={() => onTogglePaid(p.id)} style={{ display: "block", background: "none", border: "none", padding: 0, fontSize: 11, lineHeight: "16px", height: 16, fontWeight: 600, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit" }}>Mark as paid</button>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <CopyAmount value={p.total.toFixed(2)} display={`${bill.currency}${p.total.toFixed(2)}`} label={`${p.name}'s amount`} style={{ fontWeight: 800, fontSize: 20, color: p.color }} />
                <button onClick={() => toggle(p.id)} aria-expanded={!!open[p.id]} aria-label={open[p.id] ? `Hide ${p.name}'s items` : `Show ${p.name}'s items`} style={{ background: "none", border: "none", padding: 2, color: "var(--subtle)", cursor: "pointer", display: "inline-flex" }}>
                  <ChevronIcon up={open[p.id]} size={16} />
                </button>
              </div>
            </div>
            {open[p.id] && (
              <div className="fade-in" style={{ marginTop: 10, paddingTop: 6, borderTop: "1px solid var(--divider)" }}>
                {linesFor(p).map((l, k) => lineRow(k, l.label, l.note, l.amount, "var(--text-2)"))}
              </div>
            )}
            {/* Nothing left to do once they've paid; Undo lives next to the paid date */}
            {i > 0 && owes(p) && !paid[p.id] && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => sharePayment(p)} style={{
                flex: 2,
                // Outlined like Show QR, so the footer keeps the only solid button; it turns green once shared
                background: status[p.id] ? "var(--success-soft)" : "var(--surface)",
                color: status[p.id] ? "var(--success-text)" : "var(--text-2)",
                border: `1.5px solid ${status[p.id] ? "var(--success)" : "var(--border)"}`, borderRadius: 8, padding: "8px",
                fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "background .2s",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
                {status[p.id] ? <><CheckIcon size={15} /> {status[p.id] === "copied" ? "Copied to clipboard" : "Shared"}</> : <><ShareIcon /> {canPay ? "Share payment link" : "Share split details"}</>}
              </button>
              {upiRequest({ bill, person: p, people, payment }) && (
                <button onClick={() => setQrPerson(p)} aria-label={`Show UPI QR for ${p.name}`} title="Show QR to scan and pay" style={{
                  order: -1, // QR on the left, Share at the right end (thumb side)
                  flex: 1, borderRadius: 8, padding: "8px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer",
                  border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
                }}><QrIcon /> Show QR</button>
              )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
// Long-press a split to start selecting; while selecting, taps toggle instead of opening
function HistoryList({ history, requests = [], tab = "splits", setTab, onOpen, onClose, selected, setSelected }) {
  const selecting = selected.length > 0;
  const press = useRef(null); // { timer, x, y, fired }
  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const startPress = (id, e) => {
    clearTimeout(press.current?.timer);
    press.current = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => {
      press.current.fired = true;
      if (!selected.includes(id)) toggle(id);
      navigator.vibrate?.(15);
    }, 450) };
  };
  const cancelPress = () => clearTimeout(press.current?.timer);
  // A finger that moves (scrolling) isn't a long-press
  const movePress = (e) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.timer);
  };
  const tap = (id) => {
    if (press.current?.fired) { press.current.fired = false; return; } // the long-press already handled it
    if (selecting) toggle(id);
    else if (tab === "requests") window.location.href = `pay.html#${id}`; // the pay page shows it, as when first opened
    else onOpen(id);
  };
  const rowProps = (id) => ({
    onClick: () => tap(id),
    onPointerDown: e => startPress(id, e), onPointerUp: cancelPress, onPointerLeave: cancelPress, onPointerMove: movePress,
    onContextMenu: e => e.preventDefault(), "aria-pressed": selecting ? selected.includes(id) : undefined,
    style: {
      display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
      border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px",
      background: "var(--surface)", cursor: "pointer",
      userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none"
    }
  });
  const tick = (id) => selecting && (
    <span aria-hidden="true" style={{
      width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `2px solid ${selected.includes(id) ? "var(--accent)" : "var(--border-strong)"}`, background: selected.includes(id) ? "var(--accent)" : "transparent", color: "#fff"
    }}>{selected.includes(id) && <CheckIcon size={12} strokeWidth={3} />}</span>
  );
  // Splits / Requests switch, once there's a request to show
  const tabs = (requests.length > 0 || tab === "requests") && (
    <div style={{ display: "flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, marginBottom: 14 }}>
      {[["splits", "My splits"], ["requests", "Requests"]].map(([id, label]) => (
        <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} style={{
          flex: 1, border: "none", borderRadius: 8, padding: "7px 0", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          background: tab === id ? "var(--surface)" : "transparent", color: tab === id ? "var(--accent)" : "var(--muted)",
          boxShadow: tab === id ? "0 1px 3px #0001" : "none"
        }}>{label}</button>
      ))}
    </div>
  );
  if (tab === "requests") return (
    <div className="fill">
      {tabs}
      {requests.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 14, padding: "32px 0" }}>
          Payment links you open are saved here.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {requests.map(r => (
          <button key={r.id} {...rowProps(r.id)}>
            {tick(r.id)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.group ? `Paid by ${r.payee}` : `To ${r.payee}`} · {new Date(r.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>{r.c}{Number(r.amount).toFixed(2)}</div>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="fill">
      {tabs}
      {history.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 14, padding: "32px 0" }}>
          Splits are saved here automatically when you reach the summary.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {history.map(entry => {
          const { paidCount, total, settled } = paidStatus(entry);
          const isSel = selected.includes(entry.id);
          return (
            <button key={entry.id} onClick={() => tap(entry.id)}
              onPointerDown={e => startPress(entry.id, e)} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerMove={movePress}
              onContextMenu={e => e.preventDefault()} aria-pressed={selecting ? isSel : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
                // The tick circle shows selection; the row itself stays as it is
                border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px",
                background: "var(--surface)", cursor: "pointer",
                userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none"
              }}>
              {selecting && (
                <span aria-hidden="true" style={{
                  width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: `2px solid ${isSel ? "var(--accent)" : "var(--border-strong)"}`, background: isSel ? "var(--accent)" : "transparent", color: "#fff"
                }}>{isSel && <CheckIcon size={12} strokeWidth={3} />}</span>
              )}
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

function HistoryDetail({ entry, payment, onBack, onDelete, onEdit, onTogglePaid, onOpenSettings }) {
  return (
    <div className="fill">
      <SummaryStep
        bill={entry.bill} people={entry.people} assignments={entry.assignments} payment={payment}
        savedAt={entry.createdAt} paid={entry.paid} onTogglePaid={onTogglePaid} onOpenSettings={onOpenSettings}
      />
      <StickyFooter bleed>
        <div style={{ display: "flex", gap: 8 }}>
          <FooterReset onReset={onDelete} deletes />
          {/* Same order as the settle screen: delete, Edit, then the wide button */}
          <button onClick={onEdit} style={footerBackBtn}><Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" size={16} /> Edit</button>
          <button onClick={onBack} style={{ ...footerBackBtn, flex: 1 }}><ArrowLeftIcon size={16} /> History</button>
        </div>
      </StickyFooter>
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

function SettingsPage({ onClose, onKeyChanged, onEraseAll, savedNames, setSavedNames, payment, setPayment, theme, setTheme, focus, onFocused }) {
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
        {editing && <ApiKeySheet config={config} onSave={saveKey} onClose={() => setEditing(false)} />}
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

      <div id="saved-people" style={{ ...sectionTitle, scrollMarginTop: 16 }}>Saved people</div>
      <div style={card}>
        {savedNames.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--muted)" }}>People you add to a split are kept on this device and suggested next time.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 12 }}>
              {savedNames.map(asContact).map((c, i) => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
                  <Avatar name={c.name} color={COLORS[i % COLORS.length]} size={28} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                  <button onClick={() => setSavedNames(prev => forget(prev, c.name))} aria-label={`Forget ${c.name}`} style={{ background: "none", border: "none", color: "var(--subtle)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={() => { if (window.confirm("Forget all saved people?")) { setSavedNames([]); flash("Saved people cleared."); } }} style={{ ...outlineBtn("var(--danger)", "var(--danger-border)"), width: "100%" }}>Clear all saved people</button>
          </>
        )}
      </div>

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
const REQUESTS_KEY = "spliteasy:requests"; // payment requests opened on this device (written by pay.html)
function useStoredState(storageKey, initial) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(val)); } catch { /* storage unavailable */ }
  }, [storageKey, val]);
  // Another tab (e.g. the pay page saving a request) changed it: take that value
  useEffect(() => {
    const onStorage = (e) => { if (e.key === storageKey) { try { setVal(JSON.parse(e.newValue) ?? initial); } catch { /* ignore */ } } };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
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
  // What is actually showing, so the header toggle can flip it even while following the system
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  const [splitId, setSplitId] = usePersisted("splitId", null);
  const [history, setHistory] = useStoredState(HISTORY_KEY, []);
  const [requests, setRequests] = useStoredState(REQUESTS_KEY, []);
  // History has two lists: splits made here and requests received; the pay page links to ?tab=requests
  const [historyTab, setHistoryTabRaw] = useState(() => {
    const q = new URLSearchParams(location.search);
    if (!q.has("tab")) return "splits";
    const tab = q.get("tab") === "requests" ? "requests" : "splits";
    q.delete("tab");
    window.history.replaceState(window.history.state, "", location.pathname + (q.toString() ? `?${q}` : "") + location.hash);
    return tab;
  });
  const initialRoute = useRef(parseRoute(location.hash)).current;
  const [view, setView] = useState(initialRoute.view); // "split" | "settings" | "history"
  const [settingsFocus, setSettingsFocus] = useState(null); // section id to scroll to when Settings opens
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState([]); // ids picked by long-press on the History list
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  useEffect(() => {
    if (!selectedHistory.length) return;
    const onKey = (e) => e.key === "Escape" && setSelectedHistory([]);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedHistory.length]);
  const setHistoryTab = (t) => { setSelectedHistory([]); setHistoryTabRaw(t); };
  const deleteSelectedHistory = () => {
    if (historyTab === "requests") { setRequests(prev => prev.filter(r => !selectedHistory.includes(r.id))); setSelectedHistory([]); return; }
    setHistory(prev => prev.filter(e => !selectedHistory.includes(e.id)));
    if (selectedHistory.includes(splitId)) resetSplit(); // otherwise the open summary would re-save it
    setSelectedHistory([]);
  };
  const [openEntryId, setOpenEntryId] = useState(initialRoute.openEntryId ?? null);
  // Leaving the list (or opening a split) ends selection
  useEffect(() => { if (view !== "history" || openEntryId) setSelectedHistory([]); }, [view, openEntryId]);
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
    clearBillDraft();
    setStep(0); setBill(null); setPeople([]); setAssignments({}); setSplitId(null); setBillMode(null);
    setResetCount(n => n + 1); // remount BillStep so its draft form is cleared too
  };

  const eraseAll = () => {
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(HISTORY_KEY); localStorage.removeItem(REQUESTS_KEY); } catch { /* storage unavailable */ }
    setRequests([]);
    clearScanPhoto();
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

  // Summary footer: delete the saved split and start fresh
  const deleteCurrentSplit = () => {
    if (splitId) setHistory(prev => prev.filter(e => e.id !== splitId));
    resetSplit();
  };

  // Edit a saved split: load it into the steps at Assign. It keeps its id, so auto-save updates the same
  // History entry (paid status included). An unsaved split in progress is replaced only after asking.
  const [pendingEdit, setPendingEdit] = useState(null);
  const loadForEdit = (entry) => {
    setBill(entry.bill); setPeople(entry.people); setAssignments(entry.assignments); setSplitId(entry.id);
    setBillMode("manual"); setResetCount(n => n + 1); // remount the bill form with this bill
    setOpenEntryId(null); setView("split"); setStep(2);
  };
  const editEntry = (entry) => {
    const unsaved = bill && splitId !== entry.id && !history.some(e => e.id === splitId);
    if (unsaved) setPendingEdit(entry); else loadForEdit(entry);
  };

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

  // The step indicator shows while building the split; the settle screen (step 3) is the result, so it's hidden there
  const showSteps = view === "split" && step < 3 && !(step === 0 && !billMode); // not on the home page

  // Footer Back always goes to the previous step (not just the last screen visited), replacing the
  // current history entry so browser Back doesn't bounce forward again. People goes back to editing the bill.
  const prevStep = () => {
    replaceNext.current = true;
    if (step === 1) setBillMode("manual");
    setStep(step - 1);
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
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--text)", marginBottom: showSteps ? 14 : 0, display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
            {/* History and Settings show their own name here instead of the app name */}
            <img src="pizza.svg" alt="" width="28" height="28" style={{ flexShrink: 0 }} /> {view === "history" ? (selectedHistory.length ? `${selectedHistory.length} selected` : "History") : view === "settings" ? "Settings" : "SplitEasy"}
            {/* Delete sits by the title, well away from × on the right */}
            {selectedHistory.length > 0 ? (
              <HeaderIcon label="Delete selected" onClick={() => setConfirmDeleteSelected(true)}>
                <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
              </HeaderIcon>
            ) : view === "history" && !openEntryId && (historyTab === "requests" ? requests : history).length > 0 && (
              <HeaderIcon label="Clear all history" onClick={() => setConfirmClearHistory(true)}>
                <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
              </HeaderIcon>
            )}
            {view === "split" && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                <HeaderIcon label={isDark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(isDark ? "light" : "dark")}>
                  {isDark
                    ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>
                    : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
                </HeaderIcon>
                <HeaderIcon label="History" onClick={() => { setOpenEntryId(null); setView("history"); }}>
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </HeaderIcon>
                <HeaderIcon label="Settings" onClick={() => setView("settings")}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </HeaderIcon>
              </div>
            )}
            {/* History and Settings: an × in the title bar, same as Close in the footer
                (from a saved split it leaves History altogether) */}
            {view !== "split" && (
              <div style={{ marginLeft: "auto", display: "flex" }}>
                <HeaderIcon label={selectedHistory.length ? "Cancel selection" : `Close ${view === "history" ? "History" : "Settings"}`} onClick={() => {
                  if (selectedHistory.length) { setSelectedHistory([]); return; }
                  if (view === "history" && openEntryId) { replaceNext.current = true; setOpenEntryId(null); setView("split"); }
                  else goBack(() => setView("split"));
                }}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </HeaderIcon>
              </div>
            )}
          </div>
          {pendingEdit && (
            <ConfirmModal
              title="Replace current split?"
              message="Are you sure? The split you haven't finished will be cleared."
              confirmLabel="Replace"
              onCancel={() => setPendingEdit(null)}
              onConfirm={() => { const e = pendingEdit; setPendingEdit(null); loadForEdit(e); }}
            />
          )}
          {confirmDeleteSelected && (
            <ConfirmModal
              title={`Delete ${selectedHistory.length} ${historyTab === "requests" ? "request" : "split"}${selectedHistory.length === 1 ? "" : "s"}?`}
              message="Are you sure? They will be removed from History."
              confirmLabel="Delete"
              onCancel={() => setConfirmDeleteSelected(false)}
              onConfirm={() => { setConfirmDeleteSelected(false); deleteSelectedHistory(); }}
            />
          )}
          {confirmClearHistory && (
            <ConfirmModal
              title={historyTab === "requests" ? "Clear all requests?" : "Clear all history?"}
              message={historyTab === "requests"
                ? `Are you sure? All ${requests.length} saved ${requests.length === 1 ? "request" : "requests"} will be deleted.`
                : `Are you sure? All ${history.length} saved ${history.length === 1 ? "split" : "splits"} will be deleted.`}
              confirmLabel="Clear"
              onCancel={() => setConfirmClearHistory(false)}
              onConfirm={() => { setConfirmClearHistory(false); if (historyTab === "requests") setRequests([]); else { setHistory([]); setSplitId(null); } }}
            />
          )}
          {showSteps && <StepBar current={step} onJump={i => { if (i === 0) setBillMode("manual"); setStep(i); }} />}
          {/* home page only: floats just below the header */}
          {view === "split" && step === 0 && !billMode && <InstallBanner toast />}
        </div>

        {view === "history" && (
          <div className="fill screen-in" key={openEntry ? openEntry.id : "list"} style={{ padding: "16px 24px 24px" }}>
            {openEntry ? (
              <HistoryDetail
                entry={openEntry} payment={payment}
                onBack={() => goBack(() => setOpenEntryId(null))}
                onDelete={() => deleteEntry(openEntry.id)}
                onEdit={() => editEntry(openEntry)}
                onTogglePaid={personId => togglePaid(openEntry.id, personId)}
                onOpenSettings={() => setView("settings")}
              />
            ) : (
              <HistoryList history={history} requests={requests} tab={historyTab} setTab={setHistoryTab}
                onOpen={setOpenEntryId} onClose={() => goBack(() => setView("split"))}
                selected={selectedHistory} setSelected={setSelectedHistory} />
            )}
          </div>
        )}

        {view === "settings" && (
          <div className="fill screen-in" style={{ padding: "16px 24px 24px" }}>
            <SettingsPage
              focus={settingsFocus}
              onFocused={() => setSettingsFocus(null)}
              onClose={() => goBack(() => setView("split"))}
              onKeyChanged={() => setKeyVersion(v => v + 1)}
              onEraseAll={eraseAll}
              savedNames={savedNames}
              setSavedNames={setSavedNames}
              payment={payment}
              setPayment={setPayment}
              theme={theme}
              setTheme={setTheme}
            />
          </div>
        )}

        {/* Hidden rather than unmounted while other views are open, so an in-progress bill form isn't lost */}
        <div className="fill screen-in" style={view === "split" ? undefined : { display: "none" }}>
        <div className="fill screen-in" key={`step-${step}`} style={{ padding: "16px 24px 24px" }}>
          {step === 0 && <BillStep
            key={resetCount} initial={bill} keyVersion={keyVersion} onReset={resetSplit}
            mode={billMode} setMode={setBillMode} onBack={() => { replaceNext.current = true; setBillMode(null); }}
            onDone={parsed => { setBill(parsed); setStep(1); }} />}
          {step === 1 && <PeopleStep people={people} setPeople={setPeople} bill={bill} savedNames={savedNames} setSavedNames={setSavedNames}
            onManageSaved={() => { setSettingsFocus("saved-people"); setView("settings"); }} />}
          {step === 2 && <AssignStep bill={bill} people={people} assignments={assignments} setAssignments={setAssignments}
            onTaxSplit={v => { setBill(b => ({ ...b, taxSplit: v })); writePref(TAX_SPLIT_PREF, v); }} />}
          {step === 3 && <SummaryStep
            bill={bill} people={people} assignments={assignments} payment={payment}
            onOpenSettings={() => setView("settings")}
            savedAt={currentEntry?.createdAt} paid={currentEntry?.paid}
            onTogglePaid={currentEntry ? personId => togglePaid(currentEntry.id, personId) : undefined}
          />}
        </div>

        {step >= 1 && step < 3 && (
          <StickyFooter>
            <div style={{ display: "flex", gap: 8 }}>
            <FooterReset onReset={resetSplit} />
            <button onClick={prevStep} style={footerBackBtn}><ArrowLeftIcon size={16} /> Back</button>
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} style={{
              flex: 2, border: "none",
              background: canNext() ? "var(--accent)" : "var(--border)",
              color: canNext() ? "#fff" : "var(--subtle)",
              borderRadius: 10, padding: 12, fontWeight: 700,
              cursor: canNext() ? "pointer" : "default", fontSize: 15, transition: "all .2s", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
            }}>
              {step === 2 ? "Settle up" : "Split items"} <ArrowRightIcon size={16} />
            </button>
            </div>
          </StickyFooter>
        )}

        {step === 3 && (
          <StickyFooter>
            <div style={{ display: "flex", gap: 8 }}>
            <FooterReset onReset={currentEntry ? deleteCurrentSplit : resetSplit} deletes={!!currentEntry} />
            {/* The settle screen is the result: Edit goes back into the steps (Assign, with the step indicator) */}
            <button onClick={prevStep} style={footerBackBtn}><Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" size={16} /> Edit</button>
            <button onClick={resetSplit} style={{
              flex: 2, border: "none", background: "var(--accent)",
              borderRadius: 10, padding: 12, fontWeight: 700, cursor: "pointer", fontSize: 15, color: "#fff"
            }}>Start New Split</button>
            </div>
          </StickyFooter>
        )}
        </div>
      </div>
    </div>
  );
}
