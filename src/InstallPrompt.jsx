import { useEffect, useState } from "react";

// Chrome/Edge fire beforeinstallprompt once, often before React mounts, so capture it at module load
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; notify(); });
let installedElsewhere = false; // true when opened in a browser tab but the app is already installed
window.addEventListener("appinstalled", () => { deferredPrompt = null; installedElsewhere = true; notify(); });
navigator.getInstalledRelatedApps?.()
  .then(apps => { if (apps.length) { installedElsewhere = true; notify(); } })
  .catch(() => {});

const DISMISS_KEY = "spliteasy:installDismissedAt";
const DISMISS_DAYS = 14;

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch { return false; }
}

const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}>
    <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

// Install banner: one-tap install where the browser supports it, Add to Home Screen steps on iOS.
// On the home page it floats as a dismissible toast below the header (its parent must be
// positioned); in Settings (permanent) it sits inline and always shows.
export default function InstallBanner({ permanent = false, toast = false }) {
  const [, rerender] = useState(0);
  const [dismissed, setDismissed] = useState(recentlyDismissed);

  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const ios = isIOS();
  if (permanent && isStandalone()) return (
    <div style={{ fontSize: 14, color: "var(--muted)" }}>✓ SplitEasy is installed on this device.</div>
  );
  if (permanent && installedElsewhere && !deferredPrompt) return (
    <div style={{ fontSize: 14, color: "var(--muted)" }}>✓ SplitEasy is already installed. Open it from your home screen or app list.</div>
  );
  if (isStandalone() || installedElsewhere || (!permanent && dismissed)) return null;
  // Browsers without a one-tap prompt (Firefox, or Chrome before it offers one) only get the Settings hint
  if (!deferredPrompt && !ios && !permanent) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    setDismissed(true);
  };

  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferredPrompt = null;
    if (outcome === "dismissed") dismiss(); else rerender(n => n + 1);
  };

  return (
    <div role={toast ? "status" : undefined} className={toast ? "install-toast" : undefined} style={{
      display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--border)", borderRadius: 14, padding: "12px 14px",
      background: toast ? "var(--surface)" : "var(--surface-2)",
      ...(toast && { position: "absolute", left: 16, right: 16, top: "calc(100% + 8px)", boxShadow: "0 8px 28px #0003" })
    }}>
      <img src="pwa-64x64.png" alt="" width="40" height="40" style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Install SplitEasy</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
          {ios
            ? <>Tap <ShareIcon /> Share, then <b>Add to Home Screen</b></>
            : deferredPrompt ? "Opens like an app and works offline"
            : <>Use your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b></>}
        </div>
      </div>
      {deferredPrompt && (
        <button onClick={install} style={{ border: "none", borderRadius: 10, padding: "8px 14px", background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
          Install
        </button>
      )}
      {!permanent && <button onClick={dismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color: "var(--subtle)", fontSize: 20, lineHeight: 1, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}>×</button>}
    </div>
  );
}
