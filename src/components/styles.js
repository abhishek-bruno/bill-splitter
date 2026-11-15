export const inputStyle = {
  width: "100%", border: "1.5px solid var(--border)", borderRadius: 8,
  padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", color: "var(--text)", background: "var(--surface)"
};

export const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4, display: "block" };

// Secondary Back button beside the primary action in the footer; as wide as its label
export const footerBackBtn = {
  flex: "0 0 auto", border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)",
  borderRadius: 10, padding: "12px 16px", fontWeight: 700, cursor: "pointer", fontSize: 15, whiteSpace: "nowrap",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
};

export const linkBtn = {
  background: "none", border: "none", color: "var(--muted)", cursor: "pointer",
  fontSize: 13, padding: 0, display: "flex", alignItems: "center", gap: 4
};

// Home footer buttons: primary (accent) or outlined, icon + label, thumb-sized
export const homeBtn = (primary) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", borderRadius: 12, padding: "14px 12px",
  fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  border: primary ? "none" : "1.5px solid var(--border)", background: primary ? "var(--accent)" : "var(--surface)", color: primary ? "#fff" : "var(--text-2)"
});

// Small outlined buttons on the scanned bill card
export const cardBtn = { display: "inline-flex", alignItems: "center", gap: 5, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

export const sectionTitle = { fontWeight: 700, color: "var(--text)", fontSize: 14, marginBottom: 10 };

export const card = { border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 24 };

export const outlineBtn = (color = "var(--text-2)", border = "var(--border)") => ({
  flex: 1, border: `1.5px solid ${border}`, background: "var(--surface)", borderRadius: 10,
  padding: "10px 12px", fontWeight: 600, cursor: "pointer", fontSize: 14, color
});
