// Payment message building and sharing for the summary screen: share texts, pay page links, UPI links.
import { shareLines } from "./totals.js";
import { packSplit } from "./splitLink.js";

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

const money = (currency, n) => `${currency}${n.toFixed(2)}`;

// UPI only settles in INR, so links are offered only for rupee bills
export const supportsUpi = (bill) => bill.currency === "₹";

// One "• item: share" line per item the person had, plus their part of shared charges
function itemLines({ bill, person, assignments }) {
  const c = bill.currency;
  return shareLines(bill, assignments, person).map(l => {
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

// Messaging apps only linkify http(s) links, so point to a small page that shows the person's share,
// the full split on request, and a UPI button when a UPI ID is set.
export function payPageLink(args) {
  const base = publicBase();
  if (!base) return null;
  const { bill, people, payment } = args;
  return `${new URL("pay.html", base).href}#${packSplit({ ...args, payee: payeeOf(payment, people), upiId: hasUpi(bill, payment) ? payment.upiId : "" })}`;
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
  if (page) return `${page}\n\n${greeting}\n\n${linkHint(bill, payment)}`;
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
