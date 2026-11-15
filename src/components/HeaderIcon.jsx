export const HeaderIcon = ({ label, onClick, children }) => (
  <button onClick={onClick} aria-label={label} title={label} style={{
    background: "none", border: "none", cursor: "pointer", padding: 6, lineHeight: 0, color: "var(--muted)"
  }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  </button>
);
