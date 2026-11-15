import { TextField } from "./TextField.jsx";

// Name field with an Add button, plus an error (red) or hint (grey) line under it. Used wherever people
// are added (People step, Settings); pair it with useAddPerson for the matching rules and the
// "Same person?" dialog. Enter adds too; the button stays grey until something is typed.
export function AddPersonInput({ value, onChange, onSubmit, placeholder = "Add a person", label, error = "", hint = "", inputRef, style }) {
  const ready = value.trim() !== "";
  const note = (text, color) => text && <div style={{ fontSize: 12, color, marginTop: 4, lineHeight: 1.4 }}>{text}</div>;
  return (
    <div style={style}>
      <div style={{ display: "flex", gap: 8 }}>
        <TextField size="sm" error={!!error} ref={inputRef} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && ready && onSubmit(value)}
          placeholder={placeholder} aria-label={label || placeholder} autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
        <button onClick={() => onSubmit(value)} disabled={!ready} style={{
          flex: "0 0 auto", height: 36, padding: "0 16px", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, fontFamily: "inherit",
          background: ready ? "var(--accent)" : "var(--surface-2)", color: ready ? "#fff" : "var(--subtle)",
          cursor: ready ? "pointer" : "default", transition: "background .15s"
        }}>Add</button>
      </div>
      {note(error, "var(--danger)")}
      {note(hint, "var(--muted)")}
    </div>
  );
}
