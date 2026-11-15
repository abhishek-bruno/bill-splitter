// Earlier steps are buttons that jump back; the current and later ones are plain labels.
// Three steps of work; Settle is the result screen, where the bar is hidden
export function StepBar({ current, onJump }) {
  const labels = ["Bill", "People", "Split"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {labels.map((l, i) => {
        const canJump = onJump && i < current;
        const Step = canJump ? "button" : "div";
        return (
        <div key={l} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? 1 : 0 }}>
          <Step {...(canJump && { onClick: () => onJump(i), "aria-label": `Back to ${l}`, title: `Back to ${l}` })}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, fontFamily: "inherit", cursor: canJump ? "pointer" : "default" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i <= current ? "var(--accent)" : "var(--border)",
              color: i <= current ? "#fff" : "var(--subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, transition: "all .2s"
            }}>{i + 1}</div>
            <span style={{ fontSize: 10, color: i === current ? "var(--accent)" : "var(--subtle)", fontWeight: 600, whiteSpace: "nowrap" }}>{l}</span>
          </Step>
          {i < labels.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? "var(--accent)" : "var(--border)", margin: "0 6px", marginBottom: 18, transition: "all .2s" }} />
          )}
        </div>
        );
      })}
    </div>
  );
}
