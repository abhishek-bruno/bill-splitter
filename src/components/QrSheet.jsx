// PayQrSheet: a UPI QR for one person's share, to scan with any UPI app at the table
import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { upiLink } from "../lib/payment.js";
import { Sheet } from "./Sheet.jsx";

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

export function PayQrSheet({ request, onClose }) {
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
