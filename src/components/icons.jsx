// Arrow pointing up-right, for links that go somewhere else (external sites, other screens)
export function ArrowUpRight({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M7 17 17 7" /><path d="M8 7h9v9" />
    </svg>
  );
}

// Small stroke icons sized to the surrounding text; they replace text symbols like ← → ✓ ▾
export function Icon({ d, size = 14, strokeWidth = 2.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, verticalAlign: "-0.15em" }}>
      <path d={d} />
    </svg>
  );
}

export const ArrowLeftIcon = (props) => <Icon d="M19 12H5M12 19l-7-7 7-7" {...props} />;

export const ArrowRightIcon = (props) => <Icon d="M5 12h14M12 5l7 7-7 7" {...props} />;

export const CheckIcon = (props) => <Icon d="M20 6 9 17l-5-5" {...props} />;

export const ChevronIcon = ({ up, ...props }) => <Icon d={up ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} {...props} />;

// Line icons for places that used emoji
export function Glyph({ size = 18, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{children}</svg>
  );
}

export const ReceiptIcon = (p) => <Glyph {...p}><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2" /><path d="M9 7h6M9 11h6M13 15h2" /></Glyph>;

export const PencilIcon = (p) => <Glyph {...p}><path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4" /><path d="m13.5 6.5 4 4" /></Glyph>;

export const CameraIcon = (p) => <Glyph {...p}><path d="M5 7h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h6a1 1 0 0 1 1 1 2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" /><circle cx="12" cy="13" r="3" /></Glyph>;

export const PhotoIcon = (p) => <Glyph {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 15-5-5L5 20" /></Glyph>;

export const LockIcon = (p) => <Glyph {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></Glyph>;

// Share (three connected dots) and QR code glyphs for the summary buttons
export function ShareIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

export function QrIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </svg>
  );
}
