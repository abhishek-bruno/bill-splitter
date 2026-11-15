export function Avatar({ name, color, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#fff",
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
      fontFamily: "inherit"
    }}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}
