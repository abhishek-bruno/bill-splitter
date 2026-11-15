import { useRef } from "react";
import { FooterReset, StickyFooter } from "../components/Footer.jsx";
import { SegTabs } from "../components/SegTabs.jsx";
import { ArrowLeftIcon, CheckIcon, Icon } from "../components/icons.jsx";
import { footerBackBtn } from "../components/styles.js";
import { useSwipeTabs } from "../hooks/useSwipeTabs.js";
import { formatDateTime } from "../lib/format.js";
import { historyContacts } from "../lib/savedPeople.js";
import { paidStatus, personInSplit, personSummary } from "../lib/totals.js";
import { SettleStep } from "./SettleStep.jsx";
import { TextField } from "../components/TextField.jsx";
import { filterSplits } from "../lib/historySearch.js";
import { Select } from "../components/Select.jsx";

const money = (owes) => Object.entries(owes).map(([c, n]) => `${c}${n.toFixed(2)}`).join(" + ");

// Search splits and pick a person: one compact row instead of a scrolling list of names
function HistoryFilters({ contacts, query, setQuery, person, setPerson }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <TextField size="sm" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search splits"
        aria-label="Search splits by place, person or item" style={{ flex: 1, minWidth: 0 }} />
      {contacts.length > 1 && (
        <Select size="sm" label="Show splits for" value={person || ""} onChange={v => setPerson(v || null)} highlight={!!person}
          options={[{ value: "", label: "Everyone" }, ...contacts.map(c => ({ value: c.id, label: c.name }))]}
          style={{ flex: "0 1 40%", minWidth: 0 }} />
      )}
    </div>
  );
}

function PersonSummary({ name, summary }) {
  const owing = Object.keys(summary.owes).length > 0;
  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--surface-2)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
        {owing ? <>{name} owes <span style={{ color: "var(--warn-text)" }}>{money(summary.owes)}</span></> : `${name} is all settled up`}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
        {[
          `In ${summary.splits} ${summary.splits === 1 ? "split" : "splits"}`,
          owing && `${summary.unpaidSplits} unpaid`,
          summary.paidFor > 0 && `paid the bill in ${summary.paidFor}`
        ].filter(Boolean).join(" · ")}
        {owing && ". Open a split to send a reminder."}
      </div>
    </div>
  );
}

// Long-press a split to start selecting; while selecting, taps toggle instead of opening
export function HistoryList({ history, requests = [], tab = "splits", setTab, onOpen, selected, setSelected, person = null, setPerson = () => {}, query = "", setQuery = () => {} }) {
  const selecting = selected.length > 0;
  const press = useRef(null); // { timer, x, y, fired }
  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const startPress = (id, e) => {
    clearTimeout(press.current?.timer);
    press.current = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => {
      press.current.fired = true;
      if (!selected.includes(id)) toggle(id);
      navigator.vibrate?.(15);
    }, 450) };
  };
  const cancelPress = () => clearTimeout(press.current?.timer);
  // A finger that moves (scrolling) isn't a long-press
  const movePress = (e) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.timer);
  };
  const swipe = useSwipeTabs(["splits", "requests"], tab, setTab);
  // Filtering by person (by contact id); a person no longer in any split clears the filter
  const contacts = historyContacts(history);
  const personId = contacts.some(c => c.id === person) ? person : null;
  const shown = filterSplits(history, { query, person: personId });
  const canSwipe = requests.length > 0 || tab === "requests";
  const tap = (id) => {
    if (press.current?.fired) { press.current.fired = false; return; } // the long-press already handled it
    if (selecting) toggle(id);
    else if (tab === "requests") window.location.href = `pay.html#${id}`; // the pay page shows it, as when first opened
    else onOpen(id);
  };
  const rowProps = (id) => ({
    onClick: () => tap(id),
    onPointerDown: e => startPress(id, e), onPointerUp: cancelPress, onPointerLeave: cancelPress, onPointerMove: movePress,
    onContextMenu: e => e.preventDefault(), "aria-pressed": selecting ? selected.includes(id) : undefined,
    style: {
      display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
      border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px",
      background: "var(--surface)", cursor: "pointer",
      userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none"
    }
  });
  const tick = (id) => selecting && (
    <span aria-hidden="true" style={{
      width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `2px solid ${selected.includes(id) ? "var(--accent)" : "var(--border-strong)"}`, background: selected.includes(id) ? "var(--accent)" : "transparent", color: "#fff"
    }}>{selected.includes(id) && <CheckIcon size={12} strokeWidth={3} />}</span>
  );
  // Splits / Requests switch, once there's a request to show
  const tabs = canSwipe && (
    <div style={{ marginBottom: 14 }}>
      <SegTabs options={[["splits", "My splits"], ["requests", "Requests"]]} value={tab} swipe={swipe} />
    </div>
  );
  if (tab === "requests") return (
    <div className="fill" {...(canSwipe && swipe.handlers)}>
      {tabs}
      <div key="requests" ref={swipe.contentRef} className={swipe.slide} style={{ touchAction: "pan-y" }}>
      {requests.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 14, padding: "32px 0" }}>
          Payment links you open are saved here.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {requests.map(r => (
          <button key={r.id} {...rowProps(r.id)}>
            {tick(r.id)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.payer ? "You paid the bill" : r.share != null ? `${r.who} · to ${r.payee}` : `Paid by ${r.payee}`} · {new Date(r.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {/* Every request is a whole split: once we know who the reader is (always on a personal link,
                  picked on a group link) it shows their share and whether it's paid; otherwise the bill total */}
              {(() => {
                const known = r.share != null;
                const done = r.payer || r.paid || r.paidByPayer;
                return (
                  <>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{r.c}{Number(known && !r.payer ? r.share : r.amount).toFixed(2)}</div>
                    {known && (
                      <div style={{
                        display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "2px 8px",
                        background: done ? "var(--success-soft)" : "var(--warn-soft)", color: done ? "var(--success-text)" : "var(--warn-text)"
                      }}>{r.payer ? "You paid" : done ? "Paid" : "To pay"}</div>
                    )}
                  </>
                );
              })()}
            </div>
          </button>
        ))}
      </div>
      </div>
    </div>
  );
  return (
    <div className="fill" {...(canSwipe && swipe.handlers)}>
      {tabs}
      <div key="splits" ref={swipe.contentRef} className={swipe.slide} style={{ touchAction: "pan-y" }}>
      {history.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 14, padding: "32px 0" }}>
          Splits are saved here automatically when you reach the summary.
        </div>
      )}
      {history.length > 0 && <HistoryFilters contacts={contacts} query={query} setQuery={setQuery} person={personId} setPerson={setPerson} />}
      {personId && <PersonSummary name={contacts.find(c => c.id === personId).name} summary={personSummary(history, personId)} />}
      {history.length > 0 && shown.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--subtle)", fontSize: 14, padding: "24px 0" }}>No splits match.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map(entry => {
          const { paidCount, total, settled } = paidStatus(entry);
          const theirs = personId && personInSplit(entry, personId);
          const isSel = selected.includes(entry.id);
          return (
            <button key={entry.id} onClick={() => tap(entry.id)}
              onPointerDown={e => startPress(entry.id, e)} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerMove={movePress}
              onContextMenu={e => e.preventDefault()} aria-pressed={selecting ? isSel : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%",
                // The tick circle shows selection; the row itself stays as it is
                border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px",
                background: "var(--surface)", cursor: "pointer",
                userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none"
              }}>
              {selecting && (
                <span aria-hidden="true" style={{
                  width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: `2px solid ${isSel ? "var(--accent)" : "var(--border-strong)"}`, background: isSel ? "var(--accent)" : "transparent", color: "#fff"
                }}>{isSel && <CheckIcon size={12} strokeWidth={3} />}</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.bill.restaurant}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{formatDateTime(entry.createdAt)} · {entry.people.length} people</div>
              </div>
              {theirs ? (
                // Filtered by a person: their share in this split
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>{entry.bill.currency}{(theirs.payer ? entry.bill.total : theirs.share).toFixed(2)}</div>
                  <div style={{
                    display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "2px 8px",
                    background: theirs.paid ? "var(--success-soft)" : "var(--warn-soft)", color: theirs.paid ? "var(--success-text)" : "var(--warn-text)"
                  }}>{theirs.payer ? "Paid the bill" : theirs.paid ? "Paid" : "To pay"}</div>
                </div>
              ) : (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>{entry.bill.currency}{entry.bill.total.toFixed(2)}</div>
                  <div style={{
                    display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "2px 8px",
                    background: settled ? "var(--success-soft)" : "var(--warn-soft)", color: settled ? "var(--success-text)" : "var(--warn-text)"
                  }}>{settled ? "Settled" : `${paidCount} of ${total} paid`}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

export function HistoryDetail({ entry, payment, onBack, onDelete, onEdit, onTogglePaid, onOpenSettings }) {
  return (
    <div className="fill">
      <SettleStep
        bill={entry.bill} people={entry.people} assignments={entry.assignments} payment={payment}
        savedAt={entry.createdAt} paid={entry.paid} onTogglePaid={onTogglePaid} onOpenSettings={onOpenSettings}
      />
      <StickyFooter bleed>
        <div style={{ display: "flex", gap: 8 }}>
          <FooterReset onReset={onDelete} deletes />
          {/* Same order as the settle screen: delete, Edit, then the wide button */}
          <button onClick={onEdit} style={footerBackBtn}><Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" size={16} /> Edit</button>
          <button onClick={onBack} style={{ ...footerBackBtn, flex: 1 }}><ArrowLeftIcon size={16} /> History</button>
        </div>
      </StickyFooter>
    </div>
  );
}
