import { useRef, useState } from "react";
import { Avatar } from "../components/Avatar.jsx";
import { useAddPerson } from "../hooks/useAddPerson.jsx";
import { ArrowUpRight, ReceiptIcon } from "../components/icons.jsx";
import { COLORS } from "../lib/constants.js";
import { asContact, newContactId, remember, sameName, tidy } from "../lib/savedPeople.js";

// One row in the Saved list: tap to add the person (forgetting lives in Settings > Saved people)
export function SavedRow({ contact, color, onPick, first }) {
  return (
    <button onClick={onPick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", borderTop: first ? "none" : "1px solid var(--divider)", cursor: "pointer", padding: "10px 4px", textAlign: "left", fontFamily: "inherit", color: "var(--text)" }}>
      <Avatar name={contact.name} color={color} size={32} />
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contact.name}</span>
      <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>+ Add</span>
    </button>
  );
}

export function PeopleStep({ people, setPeople, bill, savedNames, setSavedNames, history = [], onManageSaved }) {
  const [name, setName] = useState("");
  const input = useRef(null);

  // Adds a contact ({ id, name }) to the split, unless they're already in it, and puts them first in Saved
  const add = (contact) => {
    setName("");
    adder.clearHint();
    if (people.some(p => (contact.id && p.contactId === contact.id) || sameName(p.name, contact.name))) return true;
    setPeople(prev => {
      const used = new Set(prev.map(p => p.color));
      const color = COLORS.find(c => !used.has(c)) || COLORS[prev.length % COLORS.length];
      return [...prev, { id: Date.now().toString(), name: contact.name, color, contactId: contact.id }];
    });
    setSavedNames(prev => remember(prev, [contact]));
    return true;
  };

  // A typed name: a saved person is used as is; a name only found in earlier splits asks first, so the
  // same person isn't saved twice (even if they were removed from Saved); anyone else is new
  const adder = useAddPerson({ savedNames, history, onAdd: add, inputRef: input });
  const addTyped = (raw = name) => {
    if (people.some(p => sameName(p.name, tidy(raw)))) { setName(""); return; }
    adder.submit(raw);
  };

  // Typing filters Saved
  const query = name.trim().toLowerCase();
  const suggestions = savedNames.map(asContact).filter(c =>
    c.name && !people.some(p => sameName(p.name, c.name)) && (!query || c.name.toLowerCase().includes(query))
  );

  return (
    <div>
      <div style={{ background: "var(--accent-soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--accent)" }}><ReceiptIcon size={24} /></div>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{bill.restaurant}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{bill.currency}{bill.total?.toFixed(2)} total · {bill.items?.length} {bill.items?.length === 1 ? "item" : "items"}</div>
        </div>
      </div>
      <div style={{ fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>Who's splitting this bill?</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={name} onChange={e => setName(e.target.value)}
          ref={input} onKeyDown={e => e.key === "Enter" && addTyped()}
          placeholder="Enter name…" autoComplete="off"
          style={{ flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={() => addTyped()} style={{
          background: "var(--accent)", color: "#fff", border: "none",
          borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14
        }}>Add</button>
      </div>
      {adder.hint && <div style={{ fontSize: 12, color: "var(--muted)", margin: "-4px 0 12px", lineHeight: 1.4 }}>{adder.hint}</div>}
      {adder.dialog}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {people.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--divider)", borderRadius: 10, padding: "10px 14px" }}>
            <Avatar name={p.name} color={p.color} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600 }}>{p.name}</span>
              {/* The first person is the payer everywhere (summary, messages, pay page) */}
              {i === 0
                ? <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>Payer</span>
                // Move them to the front; assignments are keyed by id, so order changes are safe
                : <button onClick={() => setPeople(prev => [p, ...prev.filter(x => x.id !== p.id)])} style={{ display: "block", background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit" }}>Set as payer</button>}
            </span>
            <button onClick={() => setPeople(prev => prev.filter(x => x.id !== p.id))} aria-label={`Remove ${p.name}`} style={{ background: "none", border: "none", color: "var(--subtle)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      {people.length === 0 && <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 13, padding: "16px 0" }}>Add at least 2 people to split with</div>}
      {suggestions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4, fontSize: 12, color: "var(--subtle)" }}>
            <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Saved</span>
            <button onClick={onManageSaved} aria-label="Manage saved people" title="Manage" style={{ display: "inline-flex", background: "none", border: "none", padding: 4, color: "var(--accent)", cursor: "pointer" }}>
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--divider)", borderRadius: 10, padding: "0 12px" }}>
            {suggestions.map((c, i) => (
              <SavedRow key={c.id || c.name} contact={c} color={COLORS[i % COLORS.length]} first={i === 0} onPick={() => add({ ...c, id: c.id || newContactId() })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
