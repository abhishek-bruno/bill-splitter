import { inputStyle } from "./styles.js";

// The app's text field: theme colours, accent border on focus (index.css), red border on error
// (also announced to screen readers via aria-invalid, and kept red while focused).
//   size "md" (default) for forms, "sm" (36px, thinner border) for compact rows like Add a person.
// Any other prop goes to the <input>; style adds to or overrides the defaults.
export function TextField({ size = "md", error = false, style, ref, ...props }) {
  return (
    <input ref={ref} aria-invalid={error || undefined} {...props} style={{
      ...inputStyle,
      ...(size === "sm" && { height: 36, padding: "0 12px", border: "1px solid var(--border)" }),
      ...style,
      ...(error && { borderColor: "var(--danger)" })
    }} />
  );
}
