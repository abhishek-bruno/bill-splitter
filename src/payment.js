// Payment message building and sharing for the summary screen.

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

const money = (currency, n) => `${currency}${n.toFixed(2)}`;

// UPI only settles in INR, so links are offered only for rupee bills
export const supportsUpi = (bill) => bill.currency === "₹";

// Round-off: with bill.roundOff on, the total goes to the nearest whole unit and the difference is shared
// like the other charges. Raw total = items + shared charges.
export function roundAdjust(bill) {
  if (!bill?.roundOff) return 0;
  const raw = (bill.items || []).reduce((s, x) => s + x.amount, 0) + (bill.taxes || []).reduce((s, x) => s + x.amount, 0);
  return Math.round((Math.round(raw) - raw) * 100) / 100;
}
const chargeNames = (bill) => [...(bill.taxes || []).map(t => t.name), ...(roundAdjust(bill) ? ["Round off"] : [])].join(", ");

// An item's assignment lists a person once per share: [a, a, a, b] means a had 3 of 4 shares.
// Plain lists with no repeats are the usual even split.
export const sharesOf = (assigned, id) => assigned.filter(x => x === id).length;
export const isUneven = (assigned) => new Set(assigned).size !== assigned.length;

// What one person owes, line by line: their share of each item plus their part of shared charges
function shareLines({ bill, person, assignments }) {
  const lines = [];
  bill.items.forEach(item => {
    const assigned = assignments[item.id] || [];
    const n = sharesOf(assigned, person.id);
    if (!n) return;
    lines.push({
      label: item.name, amount: item.amount * n / assigned.length, total: item.amount,
      ways: new Set(assigned).size, uneven: isUneven(assigned), shares: n, of: assigned.length
    });
  });
  if (Math.abs(person.shared) >= 0.005) {
    lines.push({ label: `Shared charges (${chargeNames(bill)})`, amount: person.shared, ways: 1 });
  }
  return lines;
}

// One "• item: share" line per item the person had, plus their part of shared charges
function itemLines(args) {
  const c = args.bill.currency;
  return shareLines(args).map(l => {
    const split = l.uneven ? ` (${l.shares} of ${l.of} shares of ${money(c, l.total)})`
      : l.ways > 1 ? ` (${money(c, l.total)} split ${l.ways} ways)` : "";
    return `• ${l.label}: ${money(c, l.amount)}${split}`;
  });
}

const payeeOf = (payment, people) => payment?.name || people[0]?.name || "Payee";
const hasUpi = (bill, payment) => Boolean(payment?.upiId) && supportsUpi(bill);

// Payment request for one person's share (for a scan-to-pay QR), or null when UPI isn't set up or the bill isn't in rupees
export function upiRequest({ bill, person, people, payment }) {
  if (!hasUpi(bill, payment)) return null;
  return {
    upiId: payment.upiId,
    payeeName: payeeOf(payment, people),
    amount: Math.round(person.total * 100) / 100,
    note: `${bill.restaurant} bill`
  };
}

// Standard UPI payment URI; any UPI app (Google Pay, PhonePe, Paytm…) reads it from a QR code
export function upiLink({ upiId, payeeName, amount, note }) {
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, am: amount.toFixed(2), cu: "INR" });
  if (note) params.set("tn", note.slice(0, 50));
  return `upi://pay?${params}`;
}

// Where pay.html lives for recipients: VITE_PUBLIC_URL (see .env), else this page when served over https.
// A localhost link means nothing to the recipient, so without either there is no link.
const publicBase = () => import.meta.env.VITE_PUBLIC_URL || (location.protocol === "https:" ? document.baseURI : null);

// The whole split packed as small as possible for the URL hash (never sent to the server).
// Plain text with control-character separators (no JSON quotes or brackets), then base64url:
//   fields  (RS \x1e): version, place, currency ("" = ₹), payee ("" = first person), upiId, recipientIdx ("-" = group),
//                      names, items, charges, paidMask, chargeSplit ("p" = in proportion to items),
//                      roundOff ("1" = total rounded to the nearest whole unit)
//   lists   (GS \x1d): one entry per name / item / charge
//   parts   (US \x1f): item = name, amount, peopleMask ("" = everyone), shares (only when uneven: base36
//                      counts for the masked people in list order, joined by "."); charge = name, amount
// Masks are base36 bitmasks over the names list. Trailing empty fields are dropped.
// pay.html decodes this and recomputes every share the same way computeTotals does.
const RS = "\x1e", GS = "\x1d", US = "\x1f";
const clean = (v) => String(v ?? "").replace(/[\x1d-\x1f]/g, " ");

function packSplit({ bill, person, assignments, people, payment, paid = {} }) {
  // person omitted = group link: the page shows the whole split instead of one person's share
  const idx = new Map(people.map((p, i) => [p.id, i]));
  const everyone = 2 ** people.length - 1;
  const mask = (ids) => ids.reduce((m, id) => (idx.has(id) ? m | (1 << idx.get(id)) : m), 0);
  const maskField = (m) => (m === everyone ? "" : m.toString(36));
  const payee = payeeOf(payment, people);
  const fields = [
    "2",
    clean(bill.restaurant),
    bill.currency === "₹" ? "" : clean(bill.currency),
    payee === people[0]?.name ? "" : clean(payee),
    hasUpi(bill, payment) ? payment.upiId : "",
    person ? String(idx.get(person.id) ?? 0) : "-",
    people.map(p => clean(p.name)).join(GS),
    bill.items.map(i => {
      const assigned = assignments[i.id] || [];
      const parts = [clean(i.name), i.amount, maskField(mask(assigned))];
      if (isUneven(assigned)) parts.push(people.filter(p => assigned.includes(p.id)).map(p => sharesOf(assigned, p.id).toString(36)).join("."));
      return parts.join(US);
    }).join(GS),
    (bill.taxes || []).map(t => [clean(t.name), t.amount].join(US)).join(GS),
    (mask(Object.keys(paid).filter(id => paid[id])) || "").toString(36),
    bill.taxSplit === "proportional" ? "p" : "",
    bill.roundOff ? "1" : ""
  ];
  while (fields.length && fields[fields.length - 1] === "") fields.pop();
  const bytes = new TextEncoder().encode(fields.join(RS));
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Messaging apps only linkify http(s) links, so point to a small page that shows the person's share,
// the full split on request, and a UPI button when a UPI ID is set.
export function payPageLink(args) {
  const base = publicBase();
  if (!base) return null;
  return `${new URL("pay.html", base).href}#${packSplit(args)}`;
}

// The pay page has a UPI button when a UPI ID is set, so say so instead of printing the ID
const linkHint = (bill, payment) => (hasUpi(bill, payment) ? "Open the link to pay by UPI or see the full bill." : "Open the link to see the full bill.");

// One person's share: a greeting with their amount and a link to pay or see the full bill.
// Without a link (no public URL) the items and UPI ID go in the text instead.
export function buildShareText({ bill, person, assignments, people, payment, paid }) {
  const c = bill.currency;
  const page = payPageLink({ bill, person, assignments, people, payment, paid });
  const greeting = `Hi ${person.name}, your share of the ${bill.restaurant} bill is *${money(c, person.total)}*.`;
  // Link first: chat apps show it as a preview card (and WhatsApp then hides the long URL)
  if (page) return `${page}\n\n${greeting}\n${linkHint(bill, payment)}`;
  const lines = [greeting, "", ...itemLines({ bill, person, assignments }), ""];
  if (hasUpi(bill, payment)) lines.push(`UPI: ${payment.upiId}`);
  return lines.join("\n").trim();
}

// Whole split in one message for a group chat; totals are people with .total/.shared computed.
// Same voice as the personal message: greeting, each person's share, then one link to the full split.
export function buildGroupShareText({ bill, totals, assignments, payment, paid = {} }) {
  const c = bill.currency;
  const [payer, ...debtors] = totals;
  const page = payPageLink({ bill, assignments, people: totals, payment, paid });
  const lines = page ? [page, ""] : [];
  lines.push(`Hi all, here are the shares of the ${bill.restaurant} bill (${money(c, bill.total)}, paid by ${payer.name}):`, "");

  debtors.forEach(p => {
    lines.push(paid[p.id] ? `${p.name}: ${money(c, p.total)} ✓ paid` : `${p.name}: *${money(c, p.total)}*`);
    if (!page) lines.push(...itemLines({ bill, person: p, assignments }));
  });

  if (page) lines.push("", linkHint(bill, payment));
  else if (hasUpi(bill, payment)) lines.push("", `UPI: ${payment.upiId}`);
  return lines.join("\n").trim();
}

function isMobile() {
  if (navigator.userAgentData) return navigator.userAgentData.mobile;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs a secure context; fall back for plain-http testing on a LAN
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// Opens the share sheet on phones; copies to the clipboard on desktop.
// Resolves to "shared", "copied" or "cancelled".
export async function shareOrCopy(text) {
  if (isMobile() && navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }
  await copyText(text);
  return "copied";
}
