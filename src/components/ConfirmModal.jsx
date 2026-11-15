import { useEffect } from "react";
import { createPortal } from "react-dom";

// Centered yes/no dialog; Escape or a tap outside cancels. Use tone "accent" for a choice that isn't
// destructive. Rendered on <body> so the dimmed backdrop also covers the sticky header (which sits in
// its own stacking layer).
export function ConfirmModal({ title, message, confirmLabel, cancelLabel = "Cancel", tone = "danger", onConfirm, onCancel }) {
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
          <button onClick={onCancel} style={{ flex: 1, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{cancelLabel}</button>
          <button onClick={onConfirm} style={{ flex: 1, border: "none", background: tone === "accent" ? "var(--accent)" : "var(--danger)", color: "#fff", borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
