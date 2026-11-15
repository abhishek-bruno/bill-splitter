import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal.jsx";

// Reset (or, on a saved summary, delete) as an icon button at the left of the footer; asks first
// when there is something to lose
export function FooterReset({ onReset, needsConfirm = true, deletes = false }) {
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
export function StickyFooter({ children, bleed = false }) {
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
