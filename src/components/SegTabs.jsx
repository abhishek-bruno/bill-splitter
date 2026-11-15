// Segmented control whose highlight slides between options (and follows a swipe, via useSwipeTabs)
export function SegTabs({ options, value, swipe, role }) {
  return (
    <div role={role === "tab" ? "tablist" : undefined} style={{ position: "relative", display: "flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 3 }}>
      <div ref={swipe.pillRef} aria-hidden="true" style={{
        position: "absolute", top: 3, bottom: 3, left: 3, width: `calc((100% - 6px) / ${options.length})`,
        background: "var(--surface)", borderRadius: 8, boxShadow: "0 1px 3px #0001", transform: `translateX(${swipe.idx * 100}%)`
      }} />
      {options.map(([id, label]) => (
        <button key={id} {...(role === "tab" ? { role: "tab", "aria-selected": value === id } : { "aria-pressed": value === id })}
          onClick={() => swipe.select(id)} style={{
            position: "relative", flex: 1, border: "none", borderRadius: 8, padding: "7px 0", fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "inherit", background: "transparent", color: value === id ? "var(--accent)" : "var(--muted)", transition: "color .2s"
          }}>{label}</button>
      ))}
    </div>
  );
}
