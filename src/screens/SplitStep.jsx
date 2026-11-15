import { useState } from "react";
import { Avatar } from "../components/Avatar.jsx";
import { ChevronIcon, Icon } from "../components/icons.jsx";
import { isUneven, sharesOf } from "../lib/totals.js";

export function SplitStep({ bill, people, assignments, setAssignments, onTaxSplit }) {
  // An item's list holds one entry per share ([a, a, b] = a had 2 of 3), so "selected" means "appears at all"
  const addMissing = (cur) => [...cur, ...people.map(p => p.id).filter(id => !cur.includes(id))];

  // Assign everyone to every item in one tap, so people can then just be deselected where they didn't share
  const everyoneOnAll = bill.items.every(item => people.every(p => (assignments[item.id] || []).includes(p.id)));
  const toggleEveryoneOnAll = () => setAssignments(prev =>
    Object.fromEntries(bill.items.map(item => [item.id, everyoneOnAll ? [] : addMissing(prev[item.id] || [])]))
  );
  const toggle = (itemId, personId) => {
    setAssignments(prev => {
      const cur = prev[itemId] || [];
      return { ...prev, [itemId]: cur.includes(personId) ? cur.filter(x => x !== personId) : [...cur, personId] };
    });
  };
  const setShares = (itemId, personId, n) => setAssignments(prev => {
    const cur = prev[itemId] || [];
    return { ...prev, [itemId]: [...cur.filter(x => x !== personId), ...Array(Math.max(1, n)).fill(personId)] };
  });
  const makeEven = (itemId) => setAssignments(prev => ({ ...prev, [itemId]: [...new Set(prev[itemId] || [])] }));

  const [open, setOpen] = useState({}); // item id -> share counts expanded
  const stepBtn = { width: 26, height: 26, borderRadius: 13, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", cursor: "pointer", fontSize: 15, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "var(--text)" }}>Items</div>
        <button onClick={toggleEveryoneOnAll} style={{
          border: "2px dashed var(--border-strong)", background: "none", borderRadius: 20,
          padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "var(--subtle)"
        }}>{everyoneOnAll ? "Unselect everyone" : "Everyone on all items"}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {bill.items?.map(item => {
          const assigned = assignments[item.id] || [];
          const onItem = people.filter(p => assigned.includes(p.id));
          const uneven = isUneven(assigned);
          const canExpand = onItem.length > 1;
          const expanded = open[item.id] && canExpand;
          const toggleOpen = () => setOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }));
          return (
            // Tapping the card (anywhere but its buttons) opens or closes the share counts
            <div key={item.id} onClick={e => { if (canExpand && !e.target.closest("button, [data-shares]")) toggleOpen(); }}
              style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "var(--surface)", cursor: canExpand ? "pointer" : "default" }}>
              {/* One header line: name, then the split toggle next to the price */}
              {/* Same line height for all three so their first lines sit level, even when the name wraps */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8, lineHeight: "22px" }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{item.name}</span>
                {canExpand && (
                  <button onClick={toggleOpen} aria-expanded={!!expanded} style={{ background: "none", border: "none", padding: 0, fontSize: 12, lineHeight: "22px", fontWeight: 600, color: "var(--accent)", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                    {uneven ? "Split by quantity" : "Split equally"} <ChevronIcon up={expanded} size={12} />
                  </button>
                )}
                <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>{bill.currency}{item.amount.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {people.map(p => (
                  <button key={p.id} onClick={() => toggle(item.id, p.id)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    border: assigned.includes(p.id) ? `2px solid ${p.color}` : "2px solid var(--border)",
                    background: assigned.includes(p.id) ? p.color + "18" : "var(--surface-2)",
                    borderRadius: 20, padding: "4px 12px 4px 6px",
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                    color: assigned.includes(p.id) ? p.color : "var(--muted)",
                    transition: "all .15s"
                  }}>
                    <Avatar name={p.name} color={p.color} size={20} />
                    {p.name}{uneven && assigned.includes(p.id) ? ` ×${sharesOf(assigned, p.id)}` : ""}
                  </button>
                ))}
                {(() => {
                  const allSelected = people.every(p => assigned.includes(p.id));
                  return (
                    <button onClick={() => setAssignments(prev => ({ ...prev, [item.id]: allSelected ? [] : addMissing(prev[item.id] || []) }))} style={{
                      border: "2px dashed var(--border-strong)", background: "none", borderRadius: 20,
                      padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "var(--subtle)"
                    }}>{allSelected ? "None" : "All"}</button>
                  );
                })()}
              </div>
              {expanded && (
                <div data-shares style={{ marginTop: 10, borderTop: "1px solid var(--divider)", paddingTop: 8, cursor: "default" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>How many did each person have?</div>
                  {onItem.map(p => {
                    const n = sharesOf(assigned, p.id);
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                        <Avatar name={p.name} color={p.color} size={26} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{bill.currency}{(item.amount * n / assigned.length).toFixed(2)}</span>
                        </span>
                        <button onClick={() => setShares(item.id, p.id, n - 1)} disabled={n <= 1} aria-label={`Fewer for ${p.name}`} style={{ ...stepBtn, opacity: n <= 1 ? 0.4 : 1, cursor: n <= 1 ? "default" : "pointer" }}>−</button>
                        <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{n}</span>
                        <button onClick={() => setShares(item.id, p.id, n + 1)} aria-label={`More for ${p.name}`} style={stepBtn}>+</button>
                      </div>
                    );
                  })}
                  {uneven && (
                    <button onClick={() => makeEven(item.id)} style={{ background: "none", border: "none", padding: "6px 0 0", fontSize: 11, color: "var(--subtle)", cursor: "pointer", textDecoration: "underline" }}>Split equally again</button>
                  )}
                </div>
              )}
              {assigned.length === 0 && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>⚠ No one assigned</div>}
            </div>
          );
        })}
      </div>
      {bill.taxes?.length > 0 && (
        <>
          {/* How shared charges are divided, at the right end: one tap switches */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Shared Charges</span>
            <button
              onClick={() => onTaxSplit(bill.taxSplit === "proportional" ? "equal" : "proportional")}
              aria-label={bill.taxSplit === "proportional" ? "Split proportionally. Tap to split equally" : "Split equally. Tap to split proportionally"}
              title={bill.taxSplit === "proportional" ? "Tap to split equally" : "Tap to split in proportion to what each person had"}
              style={{ marginLeft: "auto", flexShrink: 0, background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: "var(--accent)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
            >
              <span style={{ fontWeight: 400, color: "var(--subtle)" }}>Split</span> {bill.taxSplit === "proportional" ? "proportionally" : "equally"}
              <Icon d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" size={11} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bill.taxes.map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                <span style={{ color: "var(--muted)", fontSize: 14 }}>{t.name}</span>
                <span style={{ fontWeight: 600 }}>{bill.currency}{t.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
