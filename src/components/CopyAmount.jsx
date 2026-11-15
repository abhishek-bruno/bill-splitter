import { useState } from "react";
import { CheckIcon } from "./icons.jsx";
import { copyText } from "../lib/payment.js";

// An amount you can tap to copy (just the number, for pasting into a UPI app). A small "Copied" pill
// floats above it briefly, so nothing around it shifts.
export function CopyAmount({ value, display, label, style }) {
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
