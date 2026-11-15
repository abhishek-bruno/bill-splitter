import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal.jsx";
import { FooterReset, StickyFooter } from "./components/Footer.jsx";
import { HeaderIcon } from "./components/HeaderIcon.jsx";
import { StepBar } from "./components/StepBar.jsx";
import { ArrowLeftIcon, ArrowRightIcon, Icon } from "./components/icons.jsx";
import { footerBackBtn } from "./components/styles.js";
import { useTheme } from "./hooks/useTheme.js";
import { newSplitId } from "./lib/format.js";
import { REQUESTS_KEY } from "./lib/requests.js";
import { parseRoute, routeFor } from "./lib/routes.js";
import { clearScanPhoto } from "./lib/scanSettings.js";
import { HISTORY_KEY, STORAGE_KEY, TAX_SPLIT_PREF, clearBillDraft, usePersisted, useStoredState, writePref } from "./lib/storage.js";
import { BillStep } from "./screens/BillStep.jsx";
import { HistoryDetail, HistoryList } from "./screens/History.jsx";
import { PeopleStep } from "./screens/PeopleStep.jsx";
import { SettingsPage } from "./screens/Settings.jsx";
import { SettleStep } from "./screens/SettleStep.jsx";
import { SplitStep } from "./screens/SplitStep.jsx";
import InstallBanner from "./components/InstallPrompt.jsx";

export default function App() {
  const [step, setStep] = usePersisted("step", 0);
  const [bill, setBill] = usePersisted("bill", null);
  const [people, setPeople] = usePersisted("people", []);
  const [assignments, setAssignments] = usePersisted("assignments", {});
  const [savedNames, setSavedNames] = usePersisted("savedNames", []);
  const [payment, setPayment] = usePersisted("payment", null);
  const [theme, setTheme] = usePersisted("theme", "system");
  useTheme(theme);
  // What is actually showing, so the header toggle can flip it even while following the system
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  const [splitId, setSplitId] = usePersisted("splitId", null);
  const [history, setHistory] = useStoredState(HISTORY_KEY, []);
  const [requests, setRequests] = useStoredState(REQUESTS_KEY, []);
  // History has two lists: splits made here and requests received; the pay page links to ?tab=requests
  const [historyTab, setHistoryTabRaw] = useState(() => {
    const q = new URLSearchParams(location.search);
    if (!q.has("tab")) return "splits";
    const tab = q.get("tab") === "requests" ? "requests" : "splits";
    q.delete("tab");
    window.history.replaceState(window.history.state, "", location.pathname + (q.toString() ? `?${q}` : "") + location.hash);
    return tab;
  });
  const initialRoute = useRef(parseRoute(location.hash)).current;
  const [view, setView] = useState(initialRoute.view); // "split" | "settings" | "history"
  const [settingsFocus, setSettingsFocus] = useState(null); // section id to scroll to when Settings opens
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState([]); // ids picked by long-press on the History list
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  useEffect(() => {
    if (!selectedHistory.length) return;
    const onKey = (e) => e.key === "Escape" && setSelectedHistory([]);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedHistory.length]);
  const setHistoryTab = (t) => { setSelectedHistory([]); setHistoryTabRaw(t); };
  const deleteSelectedHistory = () => {
    if (historyTab === "requests") { setRequests(prev => prev.filter(r => !selectedHistory.includes(r.id))); setSelectedHistory([]); return; }
    setHistory(prev => prev.filter(e => !selectedHistory.includes(e.id)));
    if (selectedHistory.includes(splitId)) resetSplit(); // otherwise the open summary would re-save it
    setSelectedHistory([]);
  };
  const [openEntryId, setOpenEntryId] = useState(initialRoute.openEntryId ?? null);
  // Leaving the list (or opening a split) ends selection
  useEffect(() => { if (view !== "history" || openEntryId) setSelectedHistory([]); }, [view, openEntryId]);
  const [billMode, setBillMode] = useState( // null | "upload" | "manual"
    initialRoute.billMode !== undefined ? initialRoute.billMode : (bill ? "manual" : null)
  );
  const [keyVersion, setKeyVersion] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [resetCount, setResetCount] = useState(0);

  const resetSplit = () => {
    clearBillDraft();
    setStep(0); setBill(null); setPeople([]); setAssignments({}); setSplitId(null); setBillMode(null);
    setResetCount(n => n + 1); // remount BillStep so its draft form is cleared too
  };

  const eraseAll = () => {
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(HISTORY_KEY); localStorage.removeItem(REQUESTS_KEY); } catch { /* storage unavailable */ }
    setRequests([]);
    clearScanPhoto();
    setSavedNames([]);
    setPayment(null);
    setHistory([]);
    resetSplit();
  };

  // Auto-save: reaching the summary records the split in history; later edits update the same entry
  useEffect(() => {
    if (step !== 3 || !bill) return;
    if (!splitId) { setSplitId(newSplitId()); return; }
    setHistory(prev => {
      const existing = prev.find(e => e.id === splitId);
      if (!existing) return [{ id: splitId, createdAt: Date.now(), bill, people, assignments, paid: {} }, ...prev];
      if (JSON.stringify([existing.bill, existing.people, existing.assignments]) === JSON.stringify([bill, people, assignments])) return prev;
      return prev.map(e => e.id === splitId ? { ...e, bill, people, assignments, updatedAt: Date.now() } : e);
    });
  }, [step, bill, people, assignments, splitId, setHistory, setSplitId]);

  const togglePaid = (entryId, personId) => setHistory(prev => prev.map(e => {
    if (e.id !== entryId) return e;
    const paid = { ...e.paid };
    if (paid[personId]) delete paid[personId]; else paid[personId] = Date.now();
    return { ...e, paid };
  }));

  // Summary footer: delete the saved split and start fresh
  const deleteCurrentSplit = () => {
    if (splitId) setHistory(prev => prev.filter(e => e.id !== splitId));
    resetSplit();
  };

  // Edit a saved split: load it into the steps at Assign. It keeps its id, so auto-save updates the same
  // History entry (paid status included). An unsaved split in progress is replaced only after asking.
  const [pendingEdit, setPendingEdit] = useState(null);
  const loadForEdit = (entry) => {
    setBill(entry.bill); setPeople(entry.people); setAssignments(entry.assignments); setSplitId(entry.id);
    setBillMode("manual"); setResetCount(n => n + 1); // remount the bill form with this bill
    setOpenEntryId(null); setView("split"); setStep(2);
  };
  const editEntry = (entry) => {
    const unsaved = bill && splitId !== entry.id && !history.some(e => e.id === splitId);
    if (unsaved) setPendingEdit(entry); else loadForEdit(entry);
  };

  const deleteEntry = (entryId) => {
    setHistory(prev => prev.filter(e => e.id !== entryId));
    if (entryId === splitId) resetSplit(); // otherwise the open summary would re-save it
    goBack(() => setOpenEntryId(null));
  };

  // Furthest step the current data allows, so stale or hand-typed routes can't open an empty screen
  const clampStep = (s) => {
    if (!bill) return 0;
    if (s >= 2 && people.length < 2) return 1;
    if (s >= 3 && !bill.items.every(item => (assignments[item.id] || []).length > 0)) return 2;
    return s;
  };

  // Keep the URL in sync with the screen: user navigation pushes a history entry; the first
  // render and corrections after a back/forward (e.g. a clamped step) replace instead
  const firstRoute = useRef(true);
  const replaceNext = useRef(false);
  useEffect(() => {
    const target = routeFor({ view, openEntryId, step, billMode });
    if (location.hash === target) { firstRoute.current = false; replaceNext.current = false; return; }
    const depth = window.history.state?.depth ?? 0; // `history` in this component is the saved-splits list
    if (firstRoute.current || replaceNext.current) window.history.replaceState({ depth }, "", target);
    else window.history.pushState({ depth: depth + 1 }, "", target);
    firstRoute.current = false;
    replaceNext.current = false;
  }, [view, openEntryId, step, billMode]);

  useEffect(() => {
    const onPop = () => {
      const r = parseRoute(location.hash);
      const next = {
        view: r.view,
        openEntryId: r.view === "history" && r.openEntryId && history.some(e => e.id === r.openEntryId) ? r.openEntryId : null,
        step: r.view === "split" ? clampStep(r.step ?? step) : step,
        billMode
      };
      if (r.view === "split" && next.step === 0) next.billMode = r.billMode ?? null;
      setView(next.view); setOpenEntryId(next.openEntryId); setStep(next.step); setBillMode(next.billMode);
      // Stale entries (e.g. #/summary after starting a new split) show a different screen; fix the URL in place
      const target = routeFor(next);
      if (location.hash !== target) window.history.replaceState(window.history.state, "", target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  // In-app back buttons walk the same browser history; with nothing to go back to
  // (fresh load or reload), apply the fallback screen in place
  const goBack = (fallback) => {
    if ((window.history.state?.depth ?? 0) > 0) window.history.back();
    else { replaceNext.current = true; fallback(); }
  };

  // The step indicator shows while building the split; the settle screen (step 3) is the result, so it's hidden there
  const showSteps = view === "split" && step < 3 && !(step === 0 && !billMode); // not on the home page

  // Footer Back always goes to the previous step (not just the last screen visited), replacing the
  // current history entry so browser Back doesn't bounce forward again. People goes back to editing the bill.
  const prevStep = () => {
    replaceNext.current = true;
    if (step === 1) setBillMode("manual");
    setStep(step - 1);
  };

  const currentEntry = history.find(e => e.id === splitId);
  const openEntry = history.find(e => e.id === openEntryId);

  // If the bill changes (edited after going back), drop assignments for items that no longer exist
  useEffect(() => {
    if (!bill) return;
    const ids = new Set(bill.items.map(i => i.id));
    setAssignments(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => ids.has(k))));
  }, [bill, setAssignments]);

  // Drop removed people from assignments
  useEffect(() => {
    const ids = new Set(people.map(p => p.id));
    setAssignments(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.filter(id => ids.has(id))])));
  }, [people, setAssignments]);

  const canNext = () => {
    if (step === 1) return people.length >= 2;
    if (step === 2) return bill?.items?.every(item => (assignments[item.id] || []).length > 0);
    return false;
  };

  return (
    <div className="app-shell" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div className="app-card">
        <div className="sticky-header" style={{
          padding: "calc(14px + env(safe-area-inset-top)) 24px 12px",
          borderBottom: `1px solid ${scrolled ? "var(--divider)" : "transparent"}`
        }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--text)", marginBottom: showSteps ? 14 : 0, display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
            {/* History and Settings show their own name here instead of the app name */}
            <img src="pizza.svg" alt="" width="28" height="28" style={{ flexShrink: 0 }} /> {view === "history" ? (selectedHistory.length ? `${selectedHistory.length} selected` : "History") : view === "settings" ? "Settings" : "SplitEasy"}
            {/* Delete sits by the title, well away from × on the right */}
            {selectedHistory.length > 0 ? (
              <HeaderIcon label="Delete selected" onClick={() => setConfirmDeleteSelected(true)}>
                <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
              </HeaderIcon>
            ) : view === "history" && !openEntryId && (historyTab === "requests" ? requests : history).length > 0 && (
              <HeaderIcon label="Clear all history" onClick={() => setConfirmClearHistory(true)}>
                <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
              </HeaderIcon>
            )}
            {view === "split" && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                <HeaderIcon label={isDark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(isDark ? "light" : "dark")}>
                  {isDark
                    ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>
                    : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
                </HeaderIcon>
                <HeaderIcon label="History" onClick={() => { setOpenEntryId(null); setView("history"); }}>
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </HeaderIcon>
                <HeaderIcon label="Settings" onClick={() => setView("settings")}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </HeaderIcon>
              </div>
            )}
            {/* History and Settings: an × in the title bar, same as Close in the footer
                (from a saved split it leaves History altogether) */}
            {view !== "split" && (
              <div style={{ marginLeft: "auto", display: "flex" }}>
                <HeaderIcon label={selectedHistory.length ? "Cancel selection" : `Close ${view === "history" ? "History" : "Settings"}`} onClick={() => {
                  if (selectedHistory.length) { setSelectedHistory([]); return; }
                  if (view === "history" && openEntryId) { replaceNext.current = true; setOpenEntryId(null); setView("split"); }
                  else goBack(() => setView("split"));
                }}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </HeaderIcon>
              </div>
            )}
          </div>
          {pendingEdit && (
            <ConfirmModal
              title="Replace current split?"
              message="Are you sure? The split you haven't finished will be cleared."
              confirmLabel="Replace"
              onCancel={() => setPendingEdit(null)}
              onConfirm={() => { const e = pendingEdit; setPendingEdit(null); loadForEdit(e); }}
            />
          )}
          {confirmDeleteSelected && (
            <ConfirmModal
              title={`Delete ${selectedHistory.length} ${historyTab === "requests" ? "request" : "split"}${selectedHistory.length === 1 ? "" : "s"}?`}
              message="Are you sure? They will be removed from History."
              confirmLabel="Delete"
              onCancel={() => setConfirmDeleteSelected(false)}
              onConfirm={() => { setConfirmDeleteSelected(false); deleteSelectedHistory(); }}
            />
          )}
          {confirmClearHistory && (
            <ConfirmModal
              title={historyTab === "requests" ? "Clear all requests?" : "Clear all history?"}
              message={historyTab === "requests"
                ? `Are you sure? All ${requests.length} saved ${requests.length === 1 ? "request" : "requests"} will be deleted.`
                : `Are you sure? All ${history.length} saved ${history.length === 1 ? "split" : "splits"} will be deleted.`}
              confirmLabel="Clear"
              onCancel={() => setConfirmClearHistory(false)}
              onConfirm={() => { setConfirmClearHistory(false); if (historyTab === "requests") setRequests([]); else { setHistory([]); setSplitId(null); } }}
            />
          )}
          {showSteps && <StepBar current={step} onJump={i => { if (i === 0) setBillMode("manual"); setStep(i); }} />}
          {/* home page only: floats just below the header */}
          {view === "split" && step === 0 && !billMode && <InstallBanner toast />}
        </div>

        {view === "history" && (
          <div className="fill screen-in" key={openEntry ? openEntry.id : "list"} style={{ padding: "16px 24px 24px" }}>
            {openEntry ? (
              <HistoryDetail
                entry={openEntry} payment={payment}
                onBack={() => goBack(() => setOpenEntryId(null))}
                onDelete={() => deleteEntry(openEntry.id)}
                onEdit={() => editEntry(openEntry)}
                onTogglePaid={personId => togglePaid(openEntry.id, personId)}
                onOpenSettings={() => setView("settings")}
              />
            ) : (
              <HistoryList history={history} requests={requests} tab={historyTab} setTab={setHistoryTab}
                onOpen={setOpenEntryId}
                selected={selectedHistory} setSelected={setSelectedHistory} />
            )}
          </div>
        )}

        {view === "settings" && (
          <div className="fill screen-in" style={{ padding: "16px 24px 24px" }}>
            <SettingsPage
              focus={settingsFocus}
              onFocused={() => setSettingsFocus(null)}
              onKeyChanged={() => setKeyVersion(v => v + 1)}
              onEraseAll={eraseAll}
              savedNames={savedNames}
              setSavedNames={setSavedNames}
              payment={payment}
              setPayment={setPayment}
              theme={theme}
              setTheme={setTheme}
            />
          </div>
        )}

        {/* Hidden rather than unmounted while other views are open, so an in-progress bill form isn't lost */}
        <div className="fill screen-in" style={view === "split" ? undefined : { display: "none" }}>
        <div className="fill screen-in" key={`step-${step}`} style={{ padding: "16px 24px 24px" }}>
          {step === 0 && <BillStep
            key={resetCount} initial={bill} keyVersion={keyVersion} onReset={resetSplit}
            mode={billMode} setMode={setBillMode} onBack={() => { replaceNext.current = true; setBillMode(null); }}
            onDone={parsed => { setBill(parsed); setStep(1); }} />}
          {step === 1 && <PeopleStep people={people} setPeople={setPeople} bill={bill} savedNames={savedNames} setSavedNames={setSavedNames}
            onManageSaved={() => { setSettingsFocus("saved-people"); setView("settings"); }} />}
          {step === 2 && <SplitStep bill={bill} people={people} assignments={assignments} setAssignments={setAssignments}
            onTaxSplit={v => { setBill(b => ({ ...b, taxSplit: v })); writePref(TAX_SPLIT_PREF, v); }} />}
          {step === 3 && <SettleStep
            bill={bill} people={people} assignments={assignments} payment={payment}
            onOpenSettings={() => setView("settings")}
            savedAt={currentEntry?.createdAt} paid={currentEntry?.paid}
            onTogglePaid={currentEntry ? personId => togglePaid(currentEntry.id, personId) : undefined}
          />}
        </div>

        {step >= 1 && step < 3 && (
          <StickyFooter>
            <div style={{ display: "flex", gap: 8 }}>
            <FooterReset onReset={resetSplit} />
            <button onClick={prevStep} style={footerBackBtn}><ArrowLeftIcon size={16} /> Back</button>
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} style={{
              flex: 2, border: "none",
              background: canNext() ? "var(--accent)" : "var(--border)",
              color: canNext() ? "#fff" : "var(--subtle)",
              borderRadius: 10, padding: 12, fontWeight: 700,
              cursor: canNext() ? "pointer" : "default", fontSize: 15, transition: "all .2s", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
            }}>
              {step === 2 ? "Settle up" : "Split items"} <ArrowRightIcon size={16} />
            </button>
            </div>
          </StickyFooter>
        )}

        {step === 3 && (
          <StickyFooter>
            <div style={{ display: "flex", gap: 8 }}>
            <FooterReset onReset={currentEntry ? deleteCurrentSplit : resetSplit} deletes={!!currentEntry} />
            {/* The settle screen is the result: Edit goes back into the steps (Assign, with the step indicator) */}
            <button onClick={prevStep} style={footerBackBtn}><Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" size={16} /> Edit</button>
            <button onClick={resetSplit} style={{
              flex: 2, border: "none", background: "var(--accent)",
              borderRadius: 10, padding: 12, fontWeight: 700, cursor: "pointer", fontSize: 15, color: "#fff"
            }}>Start New Split</button>
            </div>
          </StickyFooter>
        )}
        </div>
      </div>
    </div>
  );
}
