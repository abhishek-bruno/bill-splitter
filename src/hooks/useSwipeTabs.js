import { useLayoutEffect, useRef, useState } from "react";

// How bills are read, as a bottom sheet (scan flow and Settings): on this device, or a cloud AI with your key
// Native-feeling tab switching: the content follows a sideways drag (rubber band at the ends), then either
// completes the switch (past ~30% of the width, or a flick) or springs back; the segment highlight tracks the
// finger. Vertical drags scroll as usual (touch-action: pan-y); drags starting in a text field are ignored.
export function useSwipeTabs(tabs, tab, setTab) {
  const contentRef = useRef(null), pillRef = useRef(null), drag = useRef(null);
  const [dir, setDir] = useState(0);
  const idx = Math.max(0, tabs.indexOf(tab));
  const setPill = (pos, animate) => {
    const p = pillRef.current;
    if (!p) return;
    p.style.transition = animate ? "transform .28s cubic-bezier(.2, .8, .2, 1)" : "none";
    p.style.transform = `translateX(${pos * 100}%)`;
  };
  useLayoutEffect(() => { setPill(idx, true); }, [idx]);
  const select = (next) => {
    const d = Math.sign(tabs.indexOf(next) - idx);
    if (!d) return;
    setDir(d);
    setTab(next);
  };
  const reset = (el) => { if (el) { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; } };
  const handlers = {
    onTouchStart: (e) => {
      if (e.target.closest("input, textarea, select")) { drag.current = null; return; }
      const t = e.touches[0];
      drag.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: null, dx: 0 };
    },
    onTouchMove: (e) => {
      const d = drag.current, el = contentRef.current;
      if (!d || !el) return;
      const t = e.touches[0], dx = t.clientX - d.x, dy = t.clientY - d.y;
      if (!d.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (d.axis !== "x") return;
      const hasNext = !!tabs[idx + (dx < 0 ? 1 : -1)];
      d.dx = hasNext ? dx : dx * 0.25;
      el.style.transition = "none";
      el.style.transform = `translateX(${d.dx}px)`;
      setPill(idx + (hasNext ? -d.dx / el.offsetWidth : 0), false);
    },
    onTouchEnd: () => {
      const d = drag.current, el = contentRef.current;
      drag.current = null;
      if (!d || d.axis !== "x" || !el) return;
      const w = el.offsetWidth, step = d.dx < 0 ? 1 : -1, next = tabs[idx + step];
      const flick = Math.abs(d.dx) / Math.max(1, Date.now() - d.t) > 0.5;
      el.style.transition = "transform .2s cubic-bezier(.2, .8, .2, 1), opacity .2s";
      if (next && (Math.abs(d.dx) > w * 0.3 || (flick && Math.abs(d.dx) > 30))) {
        el.style.transform = `translateX(${-step * w}px)`;
        el.style.opacity = "0";
        setPill(idx + step, true);
        setTimeout(() => { reset(el); select(next); }, 170);
      } else {
        el.style.transform = "translateX(0)";
        setPill(idx, true);
        setTimeout(() => reset(el), 220);
      }
    }
  };
  handlers.onTouchCancel = handlers.onTouchEnd;
  const slide = dir > 0 ? "tab-in-right" : dir < 0 ? "tab-in-left" : undefined;
  return { select, handlers, slide, contentRef, pillRef, idx };
}
