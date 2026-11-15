import { useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "../components/Sheet.jsx";
import { CheckIcon } from "../components/icons.jsx";
import { COLORS } from "../lib/constants.js";

// Home page promises: small icon chips under the headline; icons are 24x24 stroke paths
export const FEATURES = [
  { title: "Fully local", // cloud with a slash
    points: [
      "Your splits, history and saved people stay in this browser. There's no server and no tracking.",
      "Works offline once installed.",
      "On Device AI reads bills on your phone. With Cloud AI, only the bill photo goes to the provider you pick."
    ],
    icon: <><path d="M2 2l20 20" /><path d="M5.8 5.8A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.3-.2" /><path d="M21.5 16.5A4.5 4.5 0 0 0 17.5 10h-1.8A7 7 0 0 0 10 5.1" /></> },
  { title: "No sign-up", // person with a cross
    points: [
      "Open the app and start splitting. No account, email or phone number.",
      "Friends don't need the app. They get a link with their share and a UPI button."
    ],
    icon: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><path d="M17 8l5 5M22 8l-5 5" /></> },
  { title: "Free forever", // gift box
    points: [
      "No ads, no subscription, no limits.",
      "On Device AI scanning is free. Cloud AI uses your own key, and Google Gemini has a free tier."
    ],
    icon: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></> }
];

// Home intro: a little drawing of what the app does (a bill shared by three friends), the headline,
// and the promises as chips. Styles in index.css (.hero-*)
export function HomeHero() {
  const [open, setOpen] = useState(null); // index of the promise the sheet opens on
  return (
    <div className="hero">
      <div className="hero-art" aria-hidden="true">
        <div className="hero-bill">
          <div className="hero-bill-title" />
          {[62, 48, 70, 40].map((w, i) => (
            <div key={i} className="hero-bill-row"><span style={{ width: `${w}%` }} /><span /></div>
          ))}
          <div className="hero-bill-total"><span /><span /></div>
        </div>
        <div className="hero-people">
          {[0, 1, 2].map(i => (
            <span key={i} style={{ background: COLORS[i] }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.5" /><path d="M3.5 21a8.5 8.5 0 0 1 17 0z" /></svg>
            </span>
          ))}
        </div>
      </div>
      <div className="hero-title">Split any bill by item in seconds</div>
      <div className="hero-chips">
        {FEATURES.map(f => (
          <button key={f.title} type="button" className="hero-chip" onClick={() => setOpen(FEATURES.indexOf(f))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.icon}</svg>
            {f.title}
          </button>
        ))}
      </div>
      {open !== null && <PromiseSheet start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// The three promises as a swipeable carousel (native scroll snapping), opened on the chip that was tapped
export function PromiseSheet({ start, onClose }) {
  const track = useRef(null);
  const [index, setIndex] = useState(start);
  useLayoutEffect(() => { const t = track.current; if (t) t.scrollLeft = start * t.clientWidth; }, [start]);
  const onScroll = () => { const t = track.current; setIndex(Math.round(t.scrollLeft / t.clientWidth)); };
  const go = (i) => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" });
  return (
    <Sheet title="Why SplitEasy" onClose={onClose}>
      <div ref={track} onScroll={onScroll} className="promise-track">
        {FEATURES.map(f => (
          <div key={f.title} className="promise-slide">
            <div style={{ width: 56, height: 56, borderRadius: 28, margin: "0 auto 12px", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.icon}</svg>
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, textAlign: "center", marginBottom: 14 }}>{f.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {f.points.map(t => (
                <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--success)", marginTop: 2, flexShrink: 0 }}><CheckIcon size={15} /></span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16 }}>
        {FEATURES.map((f, i) => (
          <button key={f.title} onClick={() => go(i)} aria-label={f.title} aria-current={i === index} style={{
            width: i === index ? 18 : 6, height: 6, borderRadius: 3, border: "none", padding: 0, cursor: "pointer",
            background: i === index ? "var(--accent)" : "var(--border-strong)", transition: "width .2s, background .2s"
          }} />
        ))}
      </div>
    </Sheet>
  );
}
