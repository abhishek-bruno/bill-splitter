import { useEffect, useState } from "react";

// Chrome/Edge fire beforeinstallprompt once, often before React mounts, so capture it at module load
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; notify(); });
window.addEventListener("appinstalled", () => { deferredPrompt = null; notify(); });

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

// Install banner: one-tap install where the browser supports it, Add to Home Screen steps on iOS
export default function InstallBanner() {
  const [, rerender] = useState(0);
  const [dismissed, setDismissed] = useState(recentlyDismissed);

  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  if (dismissed || isStandalone()) return null;
  const ios = isIOS();
  if (!deferredPrompt && !ios) return null;

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
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--border)", borderRadius: 14, padding: "12px 14px", background: "var(--surface-2)" }}>
      <img src="pwa-64x64.png" alt="" width="40" height="40" style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Install SplitEasy</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
          {ios
            ? <>Tap <ShareIcon /> Share, then <b>Add to Home Screen</b></>
            : "Opens like an app and works offline"}
        </div>
      </div>
      {!ios && (
        <button onClick={install} style={{ border: "none", borderRadius: 10, padding: "8px 14px", background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color: "var(--subtle)", fontSize: 20, lineHeight: 1, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}>×</button>
    </div>
  );
}
