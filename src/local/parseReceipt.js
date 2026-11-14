// Rule-based receipt parser: turns OCR text boxes into { restaurant, currency, items, taxes } plus a
// check against the printed total. Used by the Basic on-device engine and as the fallback for Smart.
//
// Input: [{ text, poly: [[x, y] x4] }] in image pixels, in any order.

const MONEY = /(?:^|\s)(-?\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)\s*$/;
const CURRENCY_TOKENS = [[/₹|\brs\.?\b|\binr\b/i, "₹"], [/\$|\busd\b/i, "$"], [/€|\beur\b/i, "€"], [/£|\bgbp\b/i, "£"]];

// Row kinds by keyword (checked in this order)
const IS_NOISE = /(?:^|[^a-z])(tin|contact|invoice|pax|print|powered|steward|items?\s*:|gstin|gst\s*no|fssai|cin|pan\b|phone|ph\.?|mob(ile)?|tel|email|www\.|\.com|date|time|bill\s*no|invoice|inv\s*no|order\s*no|kot|table|tbl|cashier|server|steward|waiter|captain|guests?|pax|covers?|thank|visit\s*again|welcome|hsn|sac|qty|rate|amount\s*\(|particulars|description|item\s*name|dine\s*in|take\s*away|takeaway|parcel\s*no|token)(?![a-z])|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}:\d{2}|[a-z0-9]*\d{5,}[a-z0-9]*/i;
const IS_SUBTOTAL = /\b(sub\s*-?\s*total|food\s*total|item\s*total)\b/i;
const IS_TOTAL = /\b(grand\s*total|gross\s*(amount|amt|total)?|net\s*(amount|amt|total|payable)|total\s*(amount|amt|payable|due)?|amount\s*payable|bill\s*amount|to\s*pay|balance\s*due)\b|^\s*amount\s*$/i;
// Also when the edge of the paper cut off the "R" and OCR guessed the rest ("ound off", "pund off")
const IS_ROUND = /\b[a-z]{0,3}und(ing|ed)?\s*-?\s*off\b|\bround(ing|ed)?\b|\br\/o\b/i;
const IS_DISCOUNT = /\b(discount|disc\.?|less|offer|coupon|promo|savings?)\b/i;
const IS_CHARGE = /(^|[^a-z])(c\s*gst|s\s*gst|i\s*gst|u\s*gst|gst|vat|tax|cess|service\s*(charge|chg|tax)?|s\.?\s*c\.?|packing|packaging|parcel|delivery|tip|surcharge)(?![a-z])/i;
const IS_ADDRESS = /(^|[^a-z])(add(ress)?|road|rd|street|st\.|sector|market|nagar|lane|floor|near|opp|cross|main|layout|colony|plot|shop\s*no|phase|block|dist|pin)(?![a-z])|\d{6}|,.*,/i;
const IS_PAYMENT = /\b(cash|card|upi|paid|change|tender|visa|mastercard|paytm|gpay|phonepe)\b/i;

const num = (s) => parseFloat(String(s).replace(/,/g, ""));
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// The photo's tilt, from the top edges of the wider text boxes (median, so a few odd boxes don't matter)
function estimateTilt(items) {
  const angles = items.map(i => i.poly).filter(p => p && p.length >= 2 && Math.abs(p[1][0] - p[0][0]) > 40)
    .map(p => Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0])).sort((a, b) => a - b);
  return angles.length ? angles[Math.floor(angles.length / 2)] : 0;
}

function boxInfo(item, tilt = 0) {
  const cos = Math.cos(-tilt), sin = Math.sin(-tilt);
  const pts = item.poly.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  return { text: String(item.text || "").trim(), left: Math.min(...xs), right: Math.max(...xs), mid: (top + bottom) / 2, height: bottom - top };
}

// Group boxes into visual rows (name and price are usually separate boxes on the same line)
function toRows(items) {
  const tilt = estimateTilt(items);
  const boxes = items.map(i => boxInfo(i, tilt)).filter(b => b.text).sort((a, b) => a.mid - b.mid);
  if (!boxes.length) return [];
  const heights = boxes.map(b => b.height).sort((a, b) => a - b);
  const lineH = heights[Math.floor(heights.length / 2)] || 10;
  const rows = [];
  for (const b of boxes) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(b.mid - row.mid) < lineH * 0.55) {
      row.boxes.push(b);
      row.mid = (row.mid * (row.boxes.length - 1) + b.mid) / row.boxes.length;
      row.height = Math.max(row.height, b.height);
    } else rows.push({ boxes: [b], mid: b.mid, height: b.height });
  }
  return rows.map(r => {
    const boxesLR = r.boxes.sort((a, b) => a.left - b.left);
    return { text: boxesLR.map(b => b.text).join(" ").replace(/\s+/g, " ").trim(), height: r.height };
  });
}

// Receipt OCR often glues the number columns together: "2194.00388.00" is qty 2 x 194.00 = 388.00,
// "2 90180" is 2 x 90 = 180. Find a qty / rate / amount reading of the digits where qty x rate = amount.
function solveColumns(tail) {
  const str = tail.replace(/[\s,]/g, "");
  if (!/^\d[\d.]*$/.test(str) || str.length > 20) return null;
  const valid = (x) => /^\d+(\.\d{1,2})?$/.test(x) && !/^0\d/.test(x);
  for (let qi = 1; qi <= 2; qi++) {
    const qStr = str.slice(0, qi), qty = +qStr;
    if (!/^\d+$/.test(qStr) || qty < 1 || qty > 99) continue;
    for (let ri = qi + 1; ri < str.length; ri++) {
      const rStr = str.slice(qi, ri), aStr = str.slice(ri);
      if (!valid(rStr) || !valid(aStr)) continue;
      const rate = +rStr, amount = +aStr;
      if (rate > 0 && amount > 0 && Math.abs(qty * rate - amount) <= Math.max(0.05, amount * 0.005)) return { qty, rate, amount };
    }
  }
  return null;
}

// Split a row into its label and trailing amount (if any)
function splitAmount(text) {
  const t = text.replace(/[₹$€£]|\brs\.?|\binr\b/gi, " ").replace(/\s+/g, " ").trim();
  // The trailing run of numbers, which must start after a space (so "Bill No:22" or "20:41" isn't a price)
  const m = t.match(/(?:^|\s)(-?\d[\d.,\s]*\d|-?\d)\s*$/);
  if (!m) return { label: t, amount: null };
  const tail = m[1].trim();
  const tokens = tail.match(/-?\d[\d,]*(?:\.\d{1,2})?/g) || [];
  if (!tokens.length || tokens.some(x => x.replace(/[^0-9]/g, "").length > 7)) return { label: t, amount: null }; // phone or bill numbers
  // Only a row with several numbers (or a glued run of them) can hold qty / rate / amount columns
  const solved = tokens.length >= 2 ? solveColumns(tail) : null;
  const amount = solved ? solved.amount : num(tokens[tokens.length - 1]);
  return { label: t.slice(0, m.index).trim(), amount, qty: solved?.qty };
}

// "Paneer Tikka 2 180.00" -> "Paneer Tikka": drop trailing qty / rate columns and leading serial numbers
function cleanName(label) {
  let s = label.replace(/^\s*\d{1,3}(?:[.)\-:]\s*|\s+)/, "");
  s = s.replace(/(\s+(?:[x×@*]\s*)?\d[\d,]*(?:\.\d{1,2})?)+\s*$/i, "");
  s = s.replace(/[|:;_]+/g, " ").replace(/\s+/g, " ").trim();
  return /[a-z]{2}/i.test(s) && s === s.toUpperCase() ? titleCase(s) : s;
}

// OCR often glues a narrow quantity column to the price: "2  360.00" reads as "2360.00". When the items
// don't add up to the subtotal, try reading a leading 1-2 digits of each price as the quantity and keep
// the combination that matches.
function fixMergedQuantities(items, target) {
  if (target === null || !items.length) return;
  const sum = (list) => Math.round(list.reduce((s, x) => s + x, 0) * 100) / 100;
  const amounts = items.map(x => x.amount);
  if (Math.abs(sum(amounts) - target) <= 1) return;
  // Each price may be as read, or with a 1- or 2-digit quantity (1..20) peeled off the front
  const choices = items.map(x => {
    const str = x.amount.toFixed(2), out = [x.amount];
    for (const n of [1, 2]) {
      const qty = +str.slice(0, n), rest = parseFloat(str.slice(n));
      if (str.length - n >= 4 && qty >= 1 && qty <= 20 && rest >= 1) out.push(rest);
    }
    return out;
  });
  const combos = choices.reduce((n, c) => n * c.length, 1);
  if (combos > 60000) return; // too many to try; leave as read and let the total check flag it
  const pick = new Array(items.length).fill(0);
  for (let k = 0; k < combos; k++) {
    let rem = k;
    for (let i = 0; i < items.length; i++) { pick[i] = rem % choices[i].length; rem = Math.floor(rem / choices[i].length); }
    const trial = pick.map((p, i) => choices[i][p]);
    if (Math.abs(sum(trial) - target) <= 1) { trial.forEach((a, i) => { items[i].amount = a; }); return; }
  }
}

export function parseReceipt(ocrItems) {
  const rows = toRows(ocrItems);
  const allText = rows.map(r => r.text).join("\n");
  const currency = (CURRENCY_TOKENS.find(([re]) => re.test(allText)) || [null, ""])[1];

  const items = [], taxes = [];
  let subtotal = null, round = 0, discount = 0, firstItemRow = -1, pendingName = "", lastWasItem = false;
  const totals = []; // every total-like amount ("Net All Total" can be pre-tax, "Gross Amount" the final)

  rows.forEach((row, i) => {
    const { label, amount } = splitAmount(row.text);
    if (amount === null) {
      const wordy = /[a-z]{2}/i.test(row.text) && !IS_NOISE.test(row.text) && !IS_TOTAL.test(row.text) && !IS_CHARGE.test(row.text);
      // A long item name wraps onto the next line ("Kalmi Vada Dahi" / "Chaat"): add it to the item above
      if (wordy && lastWasItem && row.text.split(" ").length <= 5) {
        const last = items[items.length - 1];
        last.name = cleanName(`${last.name} ${row.text}`);
        lastWasItem = false; pendingName = "";
        return;
      }
      // Otherwise it may be the first half of the next item's name
      pendingName = wordy ? row.text : "";
      lastWasItem = false;
      return;
    }
    lastWasItem = false;
    const kindText = label || row.text;
    if (IS_PAYMENT.test(kindText) && !IS_TOTAL.test(kindText)) { pendingName = ""; return; }
    if (IS_SUBTOTAL.test(kindText)) subtotal = amount;
    else if (IS_TOTAL.test(kindText)) totals.push(amount);
    else if (IS_ROUND.test(kindText)) round += amount;
    else if (IS_DISCOUNT.test(kindText)) discount += Math.abs(amount);
    else if (IS_CHARGE.test(kindText)) {
      const name = kindText.replace(/([a-z])(\d)/gi, "$1 $2").replace(/[|:;_]+/g, " ").replace(/\s+/g, " ").trim();
      if (amount > 0) taxes.push({ name: name || "Tax", amount });
    } else if (!IS_NOISE.test(kindText)) {
      let name = cleanName(label);
      if (!name && pendingName) name = cleanName(pendingName);
      else if (pendingName && name && !/[a-z]{3}/i.test(name)) name = cleanName(`${pendingName} ${name}`);
      const looksLikeId = /^\d{5,}$/.test(String(amount)) && !/\.\d{1,2}\s*$/.test(row.text); // PIN codes etc.
      if (name && /[a-z]{2}/i.test(name) && amount > 0 && !looksLikeId) {
        if (firstItemRow < 0) firstItemRow = i;
        items.push({ name, amount });
        lastWasItem = true;
      }
    }
    pendingName = "";
  });

  // The printed total: the total-like amount that agrees with items + charges, else the largest one
  const taxSum0 = taxes.reduce((s, x) => s + x.amount, 0);
  const itemsSum0 = items.reduce((s, x) => s + x.amount, 0);
  const expected = itemsSum0 + taxSum0 - discount + round;
  let total = totals.find(t => Math.abs(t - expected) <= 1) ?? (totals.length ? Math.max(...totals) : null);
  // A total-like amount equal to the items alone is the subtotal
  if (subtotal === null) subtotal = totals.find(t => t !== total && Math.abs(t - itemsSum0) <= 1) ?? null;

  // Repair prices glued to quantities first, then drop anything still bigger than the whole bill
  fixMergedQuantities(items, subtotal ?? (total !== null ? total - taxSum0 + discount - round : null));
  if (total !== null) for (let k = items.length - 1; k >= 0; k--) if (items[k].amount > total) items.splice(k, 1);
  if (total !== null && !totals.some(t => Math.abs(t - total) < 0.01)) total = null;

  // Restaurant: the tallest text line above the first item, skipping addresses, phones and tax ids
  const headerRows = rows.slice(0, firstItemRow < 0 ? Math.min(4, rows.length) : firstItemRow)
    .filter(r => /[a-z]{3}/i.test(r.text) && !IS_NOISE.test(r.text) && !IS_ADDRESS.test(r.text) && !MONEY.test(r.text));
  const restaurant = headerRows.length ? cleanName(headerRows.reduce((a, b) => (b.height > a.height * 1.4 ? b : a)).text) : "";

  // Check the result against the printed total
  const itemsSum = items.reduce((s, x) => s + x.amount, 0);
  const taxSum = taxes.reduce((s, x) => s + x.amount, 0);
  const computed = Math.round((itemsSum + taxSum - discount + round) * 100) / 100;
  const check = total !== null ? { printedTotal: total, computedTotal: computed, matches: Math.abs(total - computed) <= 1 } : null;

  return { restaurant, currency, items, taxes, discount, round, subtotal, check };
}
export { toRows }; // for tests
