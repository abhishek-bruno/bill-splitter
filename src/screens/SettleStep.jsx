import { useState } from "react";
import { Avatar } from "../components/Avatar.jsx";
import { CopyAmount } from "../components/CopyAmount.jsx";
import { PayQrSheet } from "../components/QrSheet.jsx";
import { ArrowRightIcon, CheckIcon, ChevronIcon, QrIcon, ShareIcon } from "../components/icons.jsx";
import { formatDateTime } from "../lib/format.js";
import { buildGroupShareText, buildShareText, shareOrCopy, supportsUpi, upiRequest } from "../lib/payment.js";
import { computeTotals, isUneven, roundAdjust, shareLines, sharesOf } from "../lib/totals.js";

export function SettleStep({ bill, people, assignments, payment, onOpenSettings, savedAt, paid = {}, onTogglePaid }) {
  const totals = computeTotals(bill, people, assignments);
  const owes = (p) => p.total >= 0.005;
  // With a UPI ID (₹ bills) the shared link has a pay button; otherwise it's the split breakdown
  const canPay = supportsUpi(bill) && !!payment?.upiId;
  // Expanded cards: "bill" for the top card (full breakdown), or person ids (their own lines)
  const [open, setOpen] = useState({});
  const toggle = (key) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  // Tapping a card (not its buttons) opens or closes it
  const cardTap = (key) => (e) => { if (!e.target.closest("button, a")) toggle(key); };
  // One person's lines, worded like their pay page (src/lib/totals.js builds them for both)
  const linesFor = (p) => shareLines(bill, assignments, p);
  const lineRow = (key, label, note, amount, color) => (
    <div key={key} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 13, color }}>
      <span style={{ flex: 1, minWidth: 0 }}>{label}{note && <span style={{ opacity: 0.6 }}> {note}</span>}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{bill.currency}{amount.toFixed(2)}</span>
    </div>
  );

  const [status, setStatus] = useState({}); // person id -> "shared" | "copied"
  const sharePayment = async (p) => {
    const text = buildShareText({ bill, person: p, assignments, people: totals, payment, paid });
    const result = await shareOrCopy(text);
    if (result === "cancelled") return;
    setStatus(prev => ({ ...prev, [p.id]: result }));
    setTimeout(() => setStatus(prev => ({ ...prev, [p.id]: null })), 2000);
  };

  const [groupStatus, setGroupStatus] = useState(null);
  const shareGroup = async () => {
    const text = buildGroupShareText({ bill, totals, assignments, payment, paid });
    const result = await shareOrCopy(text);
    if (result === "cancelled") return;
    setGroupStatus(result);
    setTimeout(() => setGroupStatus(null), 2000);
  };

  const [qrPerson, setQrPerson] = useState(null);
  const qrRequest = qrPerson && upiRequest({ bill, person: qrPerson, people, payment });

  return (
    <div>
      {qrRequest && <PayQrSheet request={qrRequest} onClose={() => setQrPerson(null)} />}
      {(() => {
        // Who still owes: everyone after the payer, minus those marked paid
        // Only people who actually owe something (someone on no items owes nothing)
        const debtors = totals.slice(1).filter(owes);
        const toCollect = debtors.reduce((t, p) => t + p.total, 0);
        const left = debtors.filter(p => !paid[p.id]).reduce((t, p) => t + p.total, 0);
        const paidCount = debtors.filter(p => paid[p.id]).length;
        const date = savedAt && new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(savedAt);
        return (
          <div onClick={cardTap("bill")} style={{ background: "linear-gradient(135deg, var(--accent), #8b5cf6)", borderRadius: 14, padding: "16px 18px", marginBottom: 20, color: "#fff", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bill.restaurant || "Bill"}</div>
              {date && <div title={formatDateTime(savedAt)} style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>{date}</div>}
              <button onClick={() => toggle("bill")} aria-expanded={!!open.bill} aria-label={open.bill ? "Hide full breakdown" : "Show full breakdown"} style={{ background: "none", border: "none", padding: 2, color: "#fff", opacity: 0.85, cursor: "pointer", display: "inline-flex" }}>
                <ChevronIcon up={open.bill} size={16} />
              </button>
            </div>
            {/* Total and payer on the left, a compact group-share button on the right */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <CopyAmount value={bill.total?.toFixed(2)} display={`${bill.currency}${bill.total?.toFixed(2)}`} label="bill total" style={{ fontSize: 30, fontWeight: 800, color: "#fff" }} />
                <div style={{ fontSize: 13, opacity: 0.85 }}>Paid by {totals[0]?.name} · {people.length} people</div>
              </div>
              {debtors.length > 1 && (
                <button onClick={shareGroup} aria-label={groupStatus ? (groupStatus === "copied" ? "Summary copied" : "Shared") : "Share summary with group"} title="Share summary with group" style={{
                  flexShrink: 0, borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none",
                  background: "#fff", color: groupStatus ? "var(--success-text)" : "var(--accent)",
                  display: "inline-flex", alignItems: "center", gap: 6
                }}>
                  {groupStatus ? <><CheckIcon size={14} /> {groupStatus === "copied" ? "Copied" : "Shared"}</> : <><ShareIcon size={14} /> Share</>}
                </button>
              )}
            </div>
            {debtors.length > 0 && toCollect > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 6, borderRadius: 3, background: "#ffffff40", overflow: "hidden" }}>
                  <div style={{ width: `${((toCollect - left) / toCollect) * 100}%`, height: "100%", background: "#fff", borderRadius: 3, transition: "width .3s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                  <span>{left > 0 ? `${bill.currency}${left.toFixed(2)} left to collect` : "All settled"}</span>
                  <span>{paidCount} of {debtors.length} paid</span>
                </div>
              </div>
            )}
            {/* Full breakdown: every item with who had it, then shared charges */}
            {open.bill && (
              <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #ffffff40" }}>
                {bill.items?.map(item => {
                  const assigned = assignments[item.id] || [];
                  const names = people.filter(p => assigned.includes(p.id)).map(p => isUneven(assigned) ? `${p.name} ×${sharesOf(assigned, p.id)}` : p.name);
                  return lineRow(item.id, item.name, `· ${names.join(", ") || "unassigned"}`, item.amount, "#fff");
                })}
                {bill.taxes?.map(t => lineRow(`tax-${t.id}`, t.name, bill.taxSplit === "proportional" ? "· proportional" : "· everyone", t.amount, "#fff"))}
                {roundAdjust(bill) !== 0 && lineRow("round", "Round off", "", roundAdjust(bill), "#fff")}
              </div>
            )}
          </div>
        );
      })()}
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Each person's share</div>
      {supportsUpi(bill) && !payment?.upiId && people.length > 1 && (
        <div style={{ fontSize: 13, color: "var(--muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", marginBottom: 12 }}>
          Add your UPI ID so shared links get a UPI pay button.{" "}
          <button onClick={onOpenSettings} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Add UPI ID <ArrowRightIcon size={13} /></button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {totals.map((p, i) => (
          <div key={p.id} onClick={cardTap(p.id)} style={{ border: `1.5px solid ${p.color}33`, borderRadius: 14, padding: "14px 16px", background: "var(--surface)", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={p.name} color={p.color} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                {i === 0 && <div style={{ fontSize: 11, color: "var(--muted)" }}>Payer</div>}
                {/* Paid status lives under the name: a link to mark it, and the date with an undo once paid */}
                {i > 0 && !owes(p) && <div style={{ fontSize: 11, lineHeight: "16px", height: 16, color: "var(--muted)" }}>Nothing to pay</div>}
                {i > 0 && owes(p) && paid[p.id] && (
                  <div style={{ fontSize: 11, lineHeight: "16px", height: 16, color: "var(--success-text)", fontWeight: 600 }}>
                    <span title={formatDateTime(paid[p.id])}><CheckIcon size={11} /> Paid {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(paid[p.id])}</span>
                    {onTogglePaid && <> · <button onClick={() => onTogglePaid(p.id)} style={{ background: "none", border: "none", padding: 0, fontSize: 11, lineHeight: "inherit", color: "var(--subtle)", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", verticalAlign: "baseline" }}>Undo</button></>}
                  </div>
                )}
                {i > 0 && owes(p) && !paid[p.id] && onTogglePaid && (
                  <button onClick={() => onTogglePaid(p.id)} style={{ display: "block", background: "none", border: "none", padding: 0, fontSize: 11, lineHeight: "16px", height: 16, fontWeight: 600, color: "var(--accent)", cursor: "pointer", fontFamily: "inherit" }}>Mark as paid</button>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <CopyAmount value={p.total.toFixed(2)} display={`${bill.currency}${p.total.toFixed(2)}`} label={`${p.name}'s amount`} style={{ fontWeight: 800, fontSize: 20, color: p.color }} />
                <button onClick={() => toggle(p.id)} aria-expanded={!!open[p.id]} aria-label={open[p.id] ? `Hide ${p.name}'s items` : `Show ${p.name}'s items`} style={{ background: "none", border: "none", padding: 2, color: "var(--subtle)", cursor: "pointer", display: "inline-flex" }}>
                  <ChevronIcon up={open[p.id]} size={16} />
                </button>
              </div>
            </div>
            {open[p.id] && (
              <div className="fade-in" style={{ marginTop: 10, paddingTop: 6, borderTop: "1px solid var(--divider)" }}>
                {linesFor(p).map((l, k) => lineRow(k, l.label, l.note, l.amount, "var(--text-2)"))}
              </div>
            )}
            {/* Nothing left to do once they've paid; Undo lives next to the paid date */}
            {i > 0 && owes(p) && !paid[p.id] && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => sharePayment(p)} style={{
                flex: 2,
                // Outlined like Show QR, so the footer keeps the only solid button; it turns green once shared
                background: status[p.id] ? "var(--success-soft)" : "var(--surface)",
                color: status[p.id] ? "var(--success-text)" : "var(--text-2)",
                border: `1.5px solid ${status[p.id] ? "var(--success)" : "var(--border)"}`, borderRadius: 8, padding: "8px",
                fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "background .2s",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
                {status[p.id] ? <><CheckIcon size={15} /> {status[p.id] === "copied" ? "Copied to clipboard" : "Shared"}</> : <><ShareIcon /> {canPay ? "Share payment link" : "Share split details"}</>}
              </button>
              {upiRequest({ bill, person: p, people, payment }) && (
                <button onClick={() => setQrPerson(p)} aria-label={`Show UPI QR for ${p.name}`} title="Show QR to scan and pay" style={{
                  order: -1, // QR on the left, Share at the right end (thumb side)
                  flex: 1, borderRadius: 8, padding: "8px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer",
                  border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
                }}><QrIcon /> Show QR</button>
              )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
