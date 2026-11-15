import { useEffect, useRef, useState } from "react";
import { FooterReset, StickyFooter } from "../components/Footer.jsx";
import { Sheet } from "../components/Sheet.jsx";
import { ArrowLeftIcon, ArrowRightIcon, CameraIcon, EyeIcon, Icon, PencilIcon, PhotoIcon, ReceiptIcon } from "../components/icons.jsx";
import { cardBtn, footerBackBtn, homeBtn, inputStyle, linkBtn } from "../components/styles.js";
import { CURRENCIES } from "../lib/constants.js";
import { loadScanPhoto, loadVisionConfig, readerLabel, storeScanPhoto } from "../lib/scanSettings.js";
import { saveSecret } from "../lib/secureStore.js";
import { ROUND_OFF_PREF, TAX_SPLIT_PREF, readPref, usePersisted, writePref } from "../lib/storage.js";
import { roundAdjust } from "../lib/totals.js";
import { isLocalProvider, parseBillImage } from "../scan/vision.js";
import { HomeHero } from "./HomeHero.jsx";
import { ScanSetupSheet } from "./ScanSetup.jsx";
import { TextField } from "../components/TextField.jsx";
import { chargesToRows, formTotals, rowsToCharges } from "../lib/billForm.js";

// Example names for empty item rows, one per row, in keeping with the "e.g. Barbeque Nation" bill name
export const ITEM_EXAMPLES = ["e.g. Non-veg buffet", "e.g. Veg buffet", "e.g. Mocktail", "e.g. Fresh lime soda", "e.g. Kulfi"];

export const blankItem = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", amount: "" });

export const toRows = (list, fallbackId) => list?.length
  ? list.map(x => ({ ...x, amount: String(x.amount) }))
  : [{ id: fallbackId, name: "", amount: "" }];

// The scanned bill photo, to compare with what was read
export function PhotoSheet({ file, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <Sheet title="Bill" onClose={onClose}>
      {url && <img src={url} alt="Scanned bill" style={{ width: "100%", borderRadius: 10, display: "block" }} />}
    </Sheet>
  );
}

export function BillStep({ initial, onDone, onReset, keyVersion, mode, setMode, onBack }) {
  // An unfinished form is saved as a draft, so a refresh doesn't lose it; a submitted bill takes priority
  const [draft, setDraft] = usePersisted("billDraft", null);
  const start = initial ? null : draft;
  const [error, setError] = useState("");
  const [restaurant, setRestaurant] = useState(initial ? (initial.restaurant === "My Bill" ? "" : initial.restaurant || "") : start?.restaurant || "");
  const [currency, setCurrency] = useState(initial?.currency || start?.currency || "₹");
  const [items, setItems] = useState(() => toRows(initial?.items || start?.items, "1"));
  const [taxes, setTaxes] = useState(() => chargesToRows(initial?.taxes || start?.taxes, "t1"));
  // "equal" | "proportional", chosen on the Assign step. A new bill starts with the last choice made on this device.
  const [taxSplit] = useState(() => initial?.taxSplit || readPref(TAX_SPLIT_PREF) || "equal");
  // Round the total to the nearest rupee; a new bill starts with the last choice made on this device
  const [roundOff, setRoundOffState] = useState(() => initial?.roundOff ?? start?.roundOff ?? readPref(ROUND_OFF_PREF) === "1");
  const setRoundOff = (on) => { setRoundOffState(on); writePref(ROUND_OFF_PREF, on ? "1" : "0"); };
  const [showPhoto, setShowPhoto] = useState(false);

  // Photo scanning
  const [apiConfig, setApiConfig] = useState(undefined); // undefined = loading, null = not set
  // Reader setup sheet: null (closed) or open; after setup the home footer offers Scan bill / Gallery
  const [keySheet, setKeySheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [scanned, setScanned] = useState(!!start?.scanned);
  const [scanCheck, setScanCheck] = useState(start?.scanCheck || null); // printed vs computed total
  const [online, setOnline] = useState(navigator.onLine);
  const cameraRef = useRef();
  const galleryRef = useRef();

  useEffect(() => {
    loadVisionConfig().then(setApiConfig).catch(() => setApiConfig(null));
  }, [keyVersion]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const saveConfig = async (cfg) => {
    await saveSecret("vision", cfg);
    setApiConfig(cfg);
    setKeySheet(null);
    setError("");
    // Changed reader on the reading screen: read the same photo again with it (no need to pick it again)
    if (mode === "upload" && lastFile) scanFile(lastFile, cfg);
  };

  const [lastFile, setLastFile] = useState(null); // kept so a failed scan can be retried without retaking the photo

  // After a refresh, bring back the scanned photo for the bill card
  useEffect(() => {
    if (!scanned || lastFile) return;
    loadScanPhoto().then(f => { if (f) { setLastFile(f); setPreview(URL.createObjectURL(f)); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A photo from the camera or gallery goes straight to the reading screen
  const scanRun = useRef(0); // bumping it makes an in-flight scan's result be ignored (Cancel)
  const handleFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) { setError("Please choose an image file."); return; }
    setPreview(URL.createObjectURL(file));
    setLastFile(file);
    storeScanPhoto(file);
    setMode("upload");
    scanFile(file);
  };

  const scanFile = async (file, config = apiConfig) => {
    const run = ++scanRun.current; // a newer scan (or Cancel) makes this one's result be ignored
    setError("");
    setLoading(true);
    try {
      const bill = await parseBillImage(file, config);
      if (run !== scanRun.current) return; // cancelled
      setRestaurant(bill.restaurant);
      if (bill.currency) setCurrency(bill.currency);
      setItems(toRows(bill.items, "1"));
      setTaxes(chargesToRows(bill.taxes, "t1"));
      setScanCheck(bill.scanCheck || null);
      if (bill.roundOff) setRoundOffState(true); // the bill shows a round-off line
      setScanned(true);
      setMode("manual");
    } catch (e) {
      if (run === scanRun.current) setError(e.message || "Could not read the bill.");
    } finally {
      if (run === scanRun.current) setLoading(false);
    }
  };
  const cancelScan = () => { scanRun.current++; setLoading(false); setError(""); goLandingRef.current?.(); };
  const goLandingRef = useRef(null);

  // Focus the name field of a newly added row once it has rendered
  const [focusRowId, setFocusRowId] = useState(null);
  useEffect(() => {
    if (!focusRowId) return;
    document.querySelector(`[data-row-name="${focusRowId}"]`)?.focus();
    setFocusRowId(null);
  }, [focusRowId]);

  const addItem = () => { const row = blankItem(); setItems(prev => [...prev, row]); setFocusRowId(row.id); };
  // Removing the last row clears it instead, so there's always one row to type into.
  const removeItem = (id) => setItems(prev => prev.length > 1 ? prev.filter(x => x.id !== id) : [blankItem()]);
  const updateItem = (id, field, val) => setItems(prev => prev.map(x => x.id === id ? { ...x, [field]: val } : x));

  const addTax = () => { const row = blankItem(); setTaxes(prev => [...prev, row]); setFocusRowId(row.id); };
  // A discount is a charge row taken off the bill: a fixed amount, or a percentage of the items (src/lib/billForm.js)
  const addDiscount = () => { const row = { ...blankItem(), name: "Discount", discount: true }; setTaxes(prev => [...prev.filter(x => x.name.trim() || String(x.amount).trim()), row]); };
  const removeTax = (id) => setTaxes(prev => prev.length > 1 ? prev.filter(x => x.id !== id) : [blankItem()]);
  const updateTax = (id, field, val) => setTaxes(prev => prev.map(x => x.id === id ? { ...x, [field]: val } : x));

  // Long-press a row to drag it: reorder it, or drop it in the other list (an item that is really a charge,
  // like a service charge the scanner read as an item, or the other way round)
  const listRefs = { item: useRef(null), tax: useRef(null) };
  const [drag, setDrag] = useState(null); // { from, id, dy, to, index, lineTop }
  const dragRef = useRef(null);

  const scrollerOf = (el) => {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement;
  };

  // Which list the finger is over (the nearest one), and where among its other rows the row would land
  const dropTarget = (y, id) => {
    let best = null, bestDist = Infinity;
    for (const k of ["item", "tax"]) {
      const el = listRefs[k].current;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (dist < bestDist) { bestDist = dist; best = { k, el }; }
    }
    const rows = [...best.el.querySelectorAll("[data-drag-row]")].filter(el => el.dataset.dragRow !== id);
    let index = rows.findIndex(el => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (index === -1) index = rows.length;
    const lineTop = !rows.length ? 0 : index < rows.length ? rows[index].offsetTop - 5 : rows[rows.length - 1].offsetTop + rows[rows.length - 1].offsetHeight + 3;
    return { to: best.k, index, lineTop };
  };

  // Long-press a row (not the field being typed in, so its own long-press for select/paste still works).
  // Moving the finger before the press completes cancels it, so the page scrolls as usual.
  const pressRow = (e, from, id) => {
    if (e.button > 0 || dragRef.current) return;
    if (e.currentTarget.contains(document.activeElement) && e.target === document.activeElement) return;
    const x0 = e.clientX, y0 = e.clientY;
    const off = () => { clearTimeout(timer); window.removeEventListener("pointermove", early); window.removeEventListener("pointerup", off); window.removeEventListener("pointercancel", off); };
    const early = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) off(); };
    const timer = setTimeout(() => { off(); beginDrag(from, id, y0); }, 400);
    window.addEventListener("pointermove", early);
    window.addEventListener("pointerup", off);
    window.addEventListener("pointercancel", off);
  };

  const beginDrag = (from, id, y) => {
    document.activeElement?.blur?.();
    window.getSelection?.()?.removeAllRanges();
    const scroller = scrollerOf(listRefs.item.current);
    const onMove = (ev) => { if (dragRef.current) dragRef.current.y = ev.clientY; };
    const onUp = () => endDrag(true);
    const onCancel = () => endDrag(false);
    // While dragging, the finger moves the row, not the page; and lifting it doesn't tap the field below
    const block = (ev) => ev.cancelable && ev.preventDefault();
    const listeners = [["pointermove", onMove], ["pointerup", onUp], ["pointercancel", onCancel], ["touchmove", block], ["touchend", block], ["contextmenu", block]];
    listeners.forEach(([t, fn]) => window.addEventListener(t, fn, { passive: false }));
    const d = { from, id, startY: y, y, scroller, startScroll: scroller.scrollTop, cleanup: () => listeners.forEach(([t, fn]) => window.removeEventListener(t, fn)) };
    dragRef.current = d;
    navigator.vibrate?.(10);
    document.body.style.userSelect = "none";
    const tick = () => {
      const cur = dragRef.current;
      if (!cur) return;
      // Scroll when held near the top, or near the footer at the bottom
      const edge = cur.y < 90 ? -1 : cur.y > window.innerHeight - 160 ? 1 : 0;
      if (edge) cur.scroller.scrollTop += edge * 8;
      const dy = cur.y - cur.startY + (cur.scroller.scrollTop - cur.startScroll);
      setDrag({ from, id, dy, ...dropTarget(cur.y, id) });
      cur.raf = requestAnimationFrame(tick);
    };
    tick();
  };
  const endDrag = (commit) => {
    const d = dragRef.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    d.cleanup();
    dragRef.current = null;
    document.body.style.userSelect = "";
    const target = commit ? dropTarget(d.y, d.id) : null;
    setDrag(null);
    if (!target) return;
    const src = d.from === "item" ? items : taxes;
    const row = src.find(r => r.id === d.id);
    if (!row) return;
    if (target.to === "item" && (row.discount || parseFloat(row.amount) < 0)) return; // a discount can't be an item
    const blank = (r) => !r.name.trim() && !String(r.amount).trim();
    if (target.to === d.from) {
      const rest = src.filter(r => r.id !== d.id);
      rest.splice(target.index, 0, row);
      (d.from === "item" ? setItems : setTaxes)(rest);
    } else {
      const moved = { id: row.id, name: row.name, amount: row.amount };
      const rest = src.filter(r => r.id !== d.id);
      (d.from === "item" ? setItems : setTaxes)(rest.length ? rest : [blankItem()]);
      (target.to === "item" ? setItems : setTaxes)(prev => {
        const list = prev.length === 1 && blank(prev[0]) ? [] : [...prev];
        list.splice(Math.min(target.index, list.length), 0, moved);
        return list;
      });
    }
  };
  // Style for a row while dragged (follows the finger) and for a list the row would move into
  const dragRowStyle = (id) => drag?.id === id ? {
    transform: `translateY(${drag.dy}px) scale(1.02)`, position: "relative", zIndex: 5,
    background: "var(--surface)", borderRadius: 10, boxShadow: "0 8px 24px #0002", opacity: 0.97
  } : null;
  const dropListStyle = (kind) => ({
    position: "relative", borderRadius: 10, transition: "background .15s, box-shadow .15s",
    ...(drag && drag.to === kind && drag.from !== kind && { background: "var(--accent-soft)", boxShadow: "0 0 0 6px var(--accent-soft)" })
  });
  const dropLine = (kind) => drag && drag.to === kind && (
    <div style={{ position: "absolute", left: 0, right: 0, top: drag.lineTop, height: 2, borderRadius: 1, background: "var(--accent)", pointerEvents: "none" }} />
  );

  const submitManual = () => {
    const validItems = items.filter(i => i.name.trim() && parseFloat(i.amount) > 0)
      .map(i => ({ ...i, name: i.name.trim(), amount: parseFloat(i.amount) }));
    if (validItems.length === 0) { setError("Add at least one item with a name and amount."); return; }
    // Discounts become negative charges (a percentage is worked out from the items)
    const validTaxes = rowsToCharges(taxes, validItems.reduce((s, i) => s + i.amount, 0));
    const raw = validItems.reduce((s, i) => s + i.amount, 0) + validTaxes.reduce((s, t) => s + t.amount, 0);
    const total = raw + roundAdjust({ items: validItems, taxes: validTaxes, roundOff });
    onDone({
      restaurant: restaurant.trim() || "My Bill",
      currency,
      items: validItems,
      taxes: validTaxes,
      // Keep a choice made on Assign since this form opened; a new bill uses the remembered one
      taxSplit: initial?.taxSplit || taxSplit,
      roundOff,
      total
    });
  };

  const formHasData = !!restaurant.trim() || [...items, ...taxes].some(x => x.name.trim() || String(x.amount).trim());
  // Keep the draft in step with the form (cleared once there's nothing in it)
  useEffect(() => {
    setDraft(formHasData || scanned ? { restaurant, currency, items, taxes, roundOff, scanned, scanCheck } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, currency, items, taxes, roundOff, scanned, scanCheck]);
  // Mode changes can come from the browser back button, so reset per-screen state here
  useEffect(() => {
    if (mode !== "upload") setError("");
    setKeySheet(null);
  }, [mode]);

  const goLanding = onBack;
  goLandingRef.current = goLanding;

  const keySheetEl = keySheet && (
    <ScanSetupSheet config={apiConfig} onSave={saveConfig} onClose={() => setKeySheet(null)} />
  );

  // The reading screen only makes sense with a photo (a reload on #/bill/scan has none): back to the start
  useEffect(() => {
    if (mode === "upload" && !lastFile) setMode(null);
  }, [mode, lastFile, setMode]);

  // One pair of hidden pickers, reachable from every screen (Scan bill, Gallery, Retake)
  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
    </>
  );

  // Landing: pick mode
  const localReader = isLocalProvider(apiConfig?.provider);
  const canScan = online || localReader; // the on-device reader works offline

  if (!mode) return (
    <div className="fill screen-in" key="home">
      {/* Intro block centers itself vertically in the space above the buttons */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 16 }}>
      <HomeHero />
      </div>
      <StickyFooter bleed>
        {/* Row 1: scan (camera / gallery) or, before setup, one setup button. Row 2: enter manually */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {apiConfig ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => cameraRef.current.click()} disabled={!canScan} style={{ ...homeBtn(true), flex: 3, opacity: canScan ? 1 : 0.5 }}><CameraIcon size={20} /> Scan bill</button>
              <button onClick={() => galleryRef.current.click()} disabled={!canScan} style={{ ...homeBtn(false), flex: 2, opacity: canScan ? 1 : 0.5 }}><PhotoIcon size={20} /> Gallery</button>
            </div>
          ) : apiConfig === null ? (
            <button onClick={() => setKeySheet("setup")} style={homeBtn(true)}><ReceiptIcon size={20} /> Set up bill scanning</button>
          ) : null}
          <button onClick={() => setMode("manual")} style={homeBtn(false)}><PencilIcon size={20} /> Enter manually</button>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 12, color: "var(--subtle)", minHeight: 18 }}>
            {apiConfig ? (
              <>
                {!canScan ? "You're offline. This reader needs internet." : <>Scans with {readerLabel(apiConfig)}</>} ·
                <button onClick={() => setKeySheet("change")} style={{ ...linkBtn, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Change</button>
              </>
            ) : apiConfig === null ? "Free On Device AI, or your own AI key" : null}
          </div>
        </div>
      </StickyFooter>
      {fileInputs}
      {keySheetEl}
    </div>
  );

  // Upload mode
  // Scan result banner (review form and, after Back, the scanner): message left, actions right
  const scanSum = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) + taxes.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  // Reading screen: the photo being read; Cancel goes home. A failed read offers ways on from the footer.
  if (mode === "upload") {
    return (
      <div className="fill screen-in" key="upload">
        {fileInputs}
        {keySheetEl}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "8px 0 16px" }}>
          {preview && (
            <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", maxWidth: "100%", boxShadow: "0 4px 20px #0002" }}>
              <img src={preview} alt="Bill" style={{ display: "block", maxHeight: "52vh", maxWidth: "100%", objectFit: "contain", opacity: loading ? 0.85 : 1 }} />
              {loading && <div className="scan-line" />}
            </div>
          )}
          {loading ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>Reading bill…</div>
              <div style={{ fontSize: 12, color: "var(--subtle)", marginTop: 2 }}>
                {readerLabel(apiConfig)} · <button onClick={() => setKeySheet("change")} style={{ ...linkBtn, display: "inline", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Change</button>
              </div>
            </div>
          ) : error && (
            // The error, and right under it which model failed with a way to change it (re-reads this photo)
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxWidth: 360, width: "100%" }}>
              <div style={{ fontSize: 14, color: "var(--danger)", background: "var(--danger-soft)", borderRadius: 10, padding: "10px 14px", textAlign: "center", width: "100%", boxSizing: "border-box" }}>{error}</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 12, color: "var(--subtle)" }}>
                Scans with {readerLabel(apiConfig)} ·
                <button onClick={() => setKeySheet("change")} style={{ ...linkBtn, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Change</button>
              </div>
            </div>
          )}
        </div>
        <style>{`.scan-line { position: absolute; left: 0; right: 0; height: 3px; background: var(--accent); box-shadow: 0 0 12px var(--accent); animation: scanmove 1.6s ease-in-out infinite alternate; }
          @keyframes scanmove { from { top: 4%; } to { top: 94%; } }`}</style>
        <StickyFooter bleed>
          {loading ? (
            <button onClick={cancelScan} style={{ ...footerBackBtn, width: "100%" }}>Cancel</button>
          ) : (
            // Couldn't read it: the same photo again, or (link below) with another model. Anything else starts from home.
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelScan} style={{ ...footerBackBtn, flex: 1 }}>Cancel</button>
              {lastFile && <button onClick={() => scanFile(lastFile)} disabled={!canScan} style={{ ...homeBtn(true), flex: 2, padding: 12 }}>Try again</button>}
            </div>
          )}
        </StickyFooter>
      </div>
    );
  }

  // Scanned bill card: photo thumbnail, whether it adds up, and Retake (camera) / Replace (pick a photo) / View
  const billCard = scanned && (() => {
    const warn = scanCheck && !scanCheck.matches;
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", border: `1px solid ${warn ? "var(--warn-border)" : "var(--border)"}`, background: warn ? "var(--warn-soft)" : "var(--surface-2)", borderRadius: 14, padding: 10, marginBottom: 16 }}>
        {preview && (
          <button onClick={() => setShowPhoto(true)} aria-label="View bill photo" style={{ flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer", borderRadius: 8, overflow: "hidden", width: 52, height: 64 }}>
            <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
          {/* Icon and text centred on one line, starting at the same edge as the buttons below */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: warn ? "var(--warn-text)" : "var(--success-text)" }}>
            {!warn && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}><path d="M20 6 9 17l-5-5" /></svg>}
            <span>{warn ? `Adds up to ${currency}${scanSum.toFixed(2)}, bill says ${currency}${scanCheck.printedTotal.toFixed(2)}`
              : scanCheck?.matches ? "Matches the bill total" : "Scanned. Check against the bill"}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button onClick={() => cameraRef.current.click()} style={cardBtn}><CameraIcon size={15} /> Retake</button>
            <button onClick={() => galleryRef.current.click()} style={cardBtn}><PhotoIcon size={15} /> Replace</button>
            {lastFile && <button onClick={() => setShowPhoto(true)} style={cardBtn}><EyeIcon size={15} /> View</button>}
          </div>
        </div>
      </div>
    );
  })();

  // Row remove button: fixed width. Without it (a lone empty row) the amount field takes its space instead,
  // so amounts always start in the same column and rows end at the same right edge as the buttons below
  const removeBtn = { width: 18, flexShrink: 0, background: "none", border: "none", color: "var(--border-strong)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 };
  const amountWidth = (hasRemove) => (hasRemove ? 116 : 116 + 8 + removeBtn.width);

  // Manual mode (also used to review scanned results)
  const manualValid = items.some(i => i.name.trim() && parseFloat(i.amount) > 0);
  return (
    <div className="fill screen-in" key="manual">
      {fileInputs}
      {billCard}
      {showPhoto && lastFile && <PhotoSheet file={lastFile} onClose={() => setShowPhoto(false)} />}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 2 }}>
          <label style={{ display: "block", fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Bill name</label>
          <div style={{ position: "relative" }}>
            <TextField value={restaurant} onChange={e => setRestaurant(e.target.value)} placeholder="e.g. Barbeque Nation" style={{ paddingRight: restaurant ? 34 : 12 }} />
            {restaurant && (
              <button onClick={() => setRestaurant("")} aria-label="Clear bill name" title="Clear" style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 24, height: 24,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "none", padding: 0, color: "var(--subtle)", cursor: "pointer"
              }}><Icon d="M18 6 6 18M6 6l12 12" size={14} /></button>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {/* "₹ INR" explains itself, so no visible label; it lines up with the restaurant input */}
          <select value={currency} onChange={e => setCurrency(e.target.value)} aria-label="Currency" style={{ ...inputStyle, cursor: "pointer" }}>
            {!CURRENCIES.some(c => c.symbol === currency) && <option value={currency}>{currency}</option>}
            {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} {c.code}</option>)}
          </select>
        </div>
      </div>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Items</div>
      <div ref={listRefs.item} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8, ...dropListStyle("item") }}>
        {dropLine("item")}
        {items.map((item, idx) => (
          <div key={item.id} data-drag-row={item.id} onPointerDown={e => pressRow(e, "item", item.id)} style={{ display: "flex", gap: 8, alignItems: "center", WebkitTouchCallout: "none", ...dragRowStyle(item.id) }}>
            <TextField
              value={item.name} onChange={e => updateItem(item.id, "name", e.target.value)}
              placeholder={ITEM_EXAMPLES[idx % ITEM_EXAMPLES.length]} data-row-name={item.id} style={{ flex: 1, minWidth: 0 }}
            />
            <div style={{ position: "relative", flex: `0 0 ${amountWidth(items.length > 1 || item.name || item.amount)}px` }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--subtle)", fontSize: 13 }}>{currency}</span>
              <TextField
                value={item.amount} onChange={e => updateItem(item.id, "amount", e.target.value)}
                placeholder="0.00" type="number" inputMode="decimal" min="0" step="0.01" style={{ paddingLeft: 24 }}
              />
            </div>
            {(items.length > 1 || item.name || item.amount)
              ? <button onClick={() => removeItem(item.id)} aria-label="Remove item" style={removeBtn}>×</button>
              : null}
          </div>
        ))}
      </div>
      <button onClick={addItem} style={{
        background: "none", border: "1.5px dashed var(--border-strong)", borderRadius: 8,
        padding: "8px 14px", color: "var(--subtle)", cursor: "pointer", fontSize: 13,
        width: "100%", marginBottom: 20
      }}>+ Add item</button>

      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Shared Charges</div>
      <div ref={listRefs.tax} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8, ...dropListStyle("tax") }}>
        {dropLine("tax")}
        {taxes.map(tax => (
          <div key={tax.id} data-drag-row={tax.id} onPointerDown={e => pressRow(e, "tax", tax.id)} style={{ display: "flex", gap: 8, alignItems: "center", WebkitTouchCallout: "none", ...dragRowStyle(tax.id) }}>
            <TextField
              value={tax.name} onChange={e => updateTax(tax.id, "name", e.target.value)}
              placeholder={tax.discount ? "e.g. Coupon, Happy hour" : "e.g. GST, Service Charge"} data-row-name={tax.id} style={{ flex: 1, minWidth: 0 }}
            />
            <div style={{ position: "relative", flex: `0 0 ${amountWidth(taxes.length > 1 || tax.name || tax.amount)}px` }}>
              {/* Tap to switch between an amount and a percentage of the items (₹ / %, and −₹ / −% for a discount);
                  one style for both, the minus sign tells them apart */}
              <button onClick={() => updateTax(tax.id, "percent", !tax.percent)}
                aria-label={`${tax.discount ? "Discount" : "Charge"} ${tax.percent ? "in percent. Switch to an amount" : "as an amount. Switch to percent"}`}
                title="Switch between amount and percent" style={{
                  position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", zIndex: 1, height: 26, minWidth: 30, padding: "0 6px",
                  border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  background: "var(--accent-soft)", color: "var(--accent)"
                }}>{tax.discount ? "−" : ""}{tax.percent ? "%" : currency}</button>
              <TextField
                value={tax.amount} onChange={e => updateTax(tax.id, "amount", e.target.value)}
                placeholder={tax.percent ? (tax.discount ? "10" : "5") : "0.00"} type="number" inputMode="decimal" step="0.01" min={tax.discount ? "0" : undefined}
                aria-label={`${tax.discount ? "Discount" : "Charge"} ${tax.percent ? "percent" : "amount"}`}
                style={{ paddingLeft: tax.discount ? 42 : 40 }}
              />
            </div>
            {(taxes.length > 1 || tax.name || tax.amount)
              ? <button onClick={() => removeTax(tax.id)} aria-label={tax.discount ? "Remove discount" : "Remove charge"} style={removeBtn}>×</button>
              : null}
          </div>
        ))}
      </div>
      {/* Charges are the common case, so that button is wider: it lines up with the name column, and
          Add discount with the amount column (116px amount + gap + remove button) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["+ Add charge", addTax, { flex: 1 }], ["− Add discount", addDiscount, { flex: `0 0 ${amountWidth(false)}px` }]].map(([label, onClick, size]) => (
          <button key={label} onClick={onClick} style={{
            ...size, background: "none", border: "1.5px dashed var(--border-strong)", borderRadius: 8,
            padding: "8px 10px", color: "var(--subtle)", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap"
          }}>{label}</button>
        ))}
      </div>

      {(() => {
        // Running total, to check against the paper bill
        const { itemsTotal: itemSum, charges: chargeSum, discounts, total: beforeRound } = formTotals(items, taxes);
        const adj = roundOff ? Math.round((Math.round(beforeRound) - beforeRound) * 100) / 100 : 0;
        const fmt = (n) => `${n < 0 ? "−" : ""}${currency}${Math.abs(n).toFixed(2)}`;
        const row = (label, value, strong) => (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 400, color: strong ? "var(--text)" : "var(--muted)", padding: "3px 0" }}>
            <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
        );
        return (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", marginBottom: 20 }}>
            {row("Items", fmt(itemSum))}
            {chargeSum !== 0 && row("Shared charges", fmt(chargeSum))}
            {discounts !== 0 && row("Discount", fmt(discounts))}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)", padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={roundOff} onChange={e => setRoundOff(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16, margin: 0 }} />
              <span style={{ flex: 1 }}>Round off</span>
              {roundOff && <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(adj)}</span>}
            </label>
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>{row("Total", fmt(beforeRound + adj), true)}</div>
          </div>
        );
      })()}

      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <StickyFooter bleed>
        <div style={{ display: "flex", gap: 8 }}>
        <FooterReset onReset={onReset} needsConfirm={formHasData} />
        <button onClick={goLanding} style={footerBackBtn}><ArrowLeftIcon size={16} /> Back</button>
        <button onClick={submitManual} disabled={!manualValid} style={{
          flex: 2, border: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: manualValid ? "var(--accent)" : "var(--border)",
          color: manualValid ? "#fff" : "var(--subtle)",
          borderRadius: 10, padding: 13, fontWeight: 700,
          cursor: manualValid ? "pointer" : "default", fontSize: 15, transition: "all .2s"
        }}>
          Add people <ArrowRightIcon size={16} />
        </button>
        </div>
      </StickyFooter>
    </div>
  );
}
