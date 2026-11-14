import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// When a new version has downloaded, ask before switching to it. The check runs on launch, whenever the
// app comes back to the foreground (installed apps are often resumed, not relaunched), and hourly.
export default function UpdatePrompt() {
  const [later, setLater] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      setInterval(check, 60 * 60 * 1000);
    }
  });

  if (!needRefresh || later) return null;
  const btn = { flex: 1, borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 70, background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="alertdialog" aria-modal="true" aria-label="Update available" className="dialog-in" style={{
        width: "100%", maxWidth: 340, background: "var(--surface)", color: "var(--text)", borderRadius: 16, padding: "20px 18px 16px", boxShadow: "0 12px 40px #0004"
      }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Update available</div>
        <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5, marginBottom: 18 }}>A new version of SplitEasy is ready. Your split is saved.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setLater(true)} style={{ ...btn, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)" }}>Later</button>
          <button onClick={() => updateServiceWorker(true)} style={{ ...btn, border: "none", background: "var(--accent)", color: "#fff" }}>Reload</button>
        </div>
      </div>
    </div>
  );
}
