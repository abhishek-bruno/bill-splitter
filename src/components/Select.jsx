import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputStyle } from "./styles.js";
import { CheckIcon, ChevronIcon } from "./icons.jsx";

// The app's dropdown, in place of the browser's <select>: looks like a TextField, opens a themed list.
//   options: [{ value, label, hint? }]   size: "md" (forms) or "sm" (36px, compact rows)
// The list is drawn on <body> at a fixed position under the button (flipping above when there's no room),
// so a scrolling sheet can't clip it. Escape, a tap outside, scrolling or picking an option closes it.
// Keyboard: Enter / Space / ArrowDown open it; arrows move; Enter picks; Home / End jump.
export function Select({ value, onChange, options, label, size = "md", style, highlight = false }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null); // { top, left, width, maxHeight }
  const button = useRef(null), list = useRef(null);
  const id = useId();
  const current = options.find(o => o.value === value);

  const show = () => {
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); };
  const pick = (o) => { onChange(o.value); close(); };

  // Place the list under the button, or above it when the space below is too small
  useLayoutEffect(() => {
    if (!open) return;
    const r = button.current.getBoundingClientRect();
    const width = Math.max(r.width, 160);
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 180 && above > below;
    const maxHeight = Math.min(280, up ? above : below);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPlace({ left, width, maxHeight, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e) => { if (!list.current?.contains(e.target) && !button.current?.contains(e.target)) close(false); };
    const scrolled = (e) => { if (!list.current?.contains(e.target)) close(false); };
    // Escape closes just the list: caught first (capture on window) so a sheet it sits in stays open
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    window.addEventListener("keydown", esc, true);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", scrolled);
    return () => {
      window.removeEventListener("keydown", esc, true);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", scrolled);
    };
  }, [open]);

  // Keep the active option in view while moving with the keyboard
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onButtonKey = (e) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); show(); }
  };
  const onListKey = (e) => {
    const last = options.length - 1;
    const moves = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (e.key in moves) { e.preventDefault(); setActive(moves[e.key]); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(options[active]); }
    else if (e.key === "Tab") { e.preventDefault(); close(); }
  };

  const sm = size === "sm";
  return (
    <>
      <button ref={button} type="button" onClick={() => (open ? close() : show())} onKeyDown={onButtonKey}
        aria-haspopup="listbox" aria-expanded={open} aria-label={label ? `${label}: ${current?.label ?? ""}` : undefined}
        style={{
          ...inputStyle, fontSize: 16, display: "flex", alignItems: "center", gap: 6, textAlign: "left", cursor: "pointer",
          ...(sm && { height: 36, padding: "0 10px", border: "1px solid var(--border)" }),
          ...(open && { borderColor: "var(--accent)" }),
          color: highlight ? "var(--accent)" : "var(--text)", fontWeight: highlight ? 600 : 400,
          ...style
        }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current?.label ?? ""}</span>
        <span aria-hidden="true" style={{ color: "var(--subtle)", display: "inline-flex", transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}><ChevronIcon size={14} /></span>
      </button>
      {open && place && createPortal(
        <ul ref={list} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-${active}`} onKeyDown={onListKey}
          className="select-list" style={{
            position: "fixed", zIndex: 80, margin: 0, padding: 4, listStyle: "none", overflowY: "auto", outline: "none",
            top: place.top, bottom: place.bottom, left: place.left, width: place.width, maxHeight: place.maxHeight,
            background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 32px #0003"
          }}>
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={selected}
                onPointerEnter={() => setActive(i)} onClick={() => pick(o)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 7, cursor: "pointer", fontSize: 15,
                  background: i === active ? "var(--accent-soft)" : "transparent",
                  color: selected ? "var(--accent)" : "var(--text)", fontWeight: selected ? 600 : 400
                }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {o.label}
                  {o.hint && <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>{o.hint}</span>}
                </span>
                {selected && <CheckIcon size={14} />}
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </>
  );
}
