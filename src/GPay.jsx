// PayQrSheet: a UPI QR for one person's share, to scan with any UPI app at the table
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import qrcode from "qrcode-generator";
import { upiLink } from "./payment.js";

// Back (browser, Android or a swipe gesture) closes the open sheet only: each sheet adds a history entry,
// and closing it any other way (×, Esc, tap outside) goes back through that entry, so none is left behind
const openSheets = new Set();
if (typeof window !== "undefined") {
  // A reload while a sheet was open keeps its entry's state; no sheet is open now, so drop the marker
  if (window.history.state?.sheet) {
    const { sheet, ...rest } = window.history.state; // eslint-disable-line no-unused-vars
    window.history.replaceState(rest, "");
  }
  window.addEventListener("popstate", (e) => {
    // Landed on the entry of a sheet that was closed in code (e.g. after saving): skip past it
    if (e.state?.sheet && !openSheets.has(e.state.sheet)) window.history.back();
  });
}

export function Sheet({ title, onClose, children }) {
  const id = useRef(null);
  if (!id.current) id.current = `s${Math.random().toString(36).slice(2, 9)}`;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const me = id.current;
    openSheets.add(me);
    if (window.history.state?.sheet !== me) window.history.pushState({ ...window.history.state, sheet: me }, "");
    const onPop = () => { if (window.history.state?.sheet !== me) onCloseRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => { openSheets.delete(me); window.removeEventListener("popstate", onPop); };
  }, []);

  const close = () => {
    if (window.history.state?.sheet === id.current) window.history.back(); // popstate then calls onClose
    else onClose();
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // On <body> so the backdrop also covers the sticky header
  return createPortal(
    // Bottom sheet on phones, centred modal on wide screens (styles in index.css: .sheet-backdrop, .sheet-panel)
    <div onClick={close} className="sheet-backdrop fade-in">
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} className="sheet-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
          <button onClick={close} aria-label="Close" style={{
            background: "none", border: "none", fontSize: 22, lineHeight: 1, color: "var(--muted)", cursor: "pointer", padding: 4
          }}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// Crisp SVG QR code. Always dark-on-white with a quiet zone, so scanners read it in dark mode too.
function QrCode({ value, size = 240 }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, count: n + 8 };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${count} ${count}`} width={size} height={size} shapeRendering="crispEdges"
      role="img" aria-label="UPI payment QR code" style={{ display: "block", background: "#fff", borderRadius: 12 }}>
      <path d={path} fill="#000" />
    </svg>
  );
}

export function PayQrSheet({ person, request, onClose }) {
  return (
    <Sheet title="Scan to pay" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: 32, fontWeight: 800 }}>₹{request.amount.toFixed(2)}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 16px" }}>to {request.payeeName} · {request.upiId}</div>
        <QrCode value={upiLink(request)} />
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 16, maxWidth: 300 }}>
          Works with any UPI app.
        </div>
      </div>
    </Sheet>
  );
}
