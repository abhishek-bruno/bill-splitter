// Payment message building and sharing for the summary screen.

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

const money = (currency, n) => `${currency}${n.toFixed(2)}`;

// UPI only settles in INR, so links are offered only for rupee bills
export const supportsUpi = (bill) => bill.currency === "₹";

function upiParams({ upiId, payeeName, amount, note }) {
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, am: amount.toFixed(2), cu: "INR" });
  if (note) params.set("tn", note.slice(0, 50));
  return params.toString();
}

export const upiLink = (opts) => `upi://pay?${upiParams(opts)}`;

// Messaging apps only linkify http(s) links, so point to a small page that opens the UPI app.
// Only usable once the app is served over https (a localhost link means nothing to the recipient).
export function payPageLink(opts) {
  if (location.protocol !== "https:") return null;
  return `${new URL("pay.html", document.baseURI).href}?${upiParams(opts)}`;
}

// One "• item: share" line per item the person had, plus their part of shared charges
function itemLines({ bill, person, assignments }) {
  const c = bill.currency;
  const lines = [];
  bill.items.forEach(item => {
    const assigned = assignments[item.id] || [];
    if (!assigned.includes(person.id)) return;
    const share = item.amount / assigned.length;
    const split = assigned.length > 1 ? ` (${money(c, item.amount)} split ${assigned.length} ways)` : "";
    lines.push(`• ${item.name}: ${money(c, share)}${split}`);
  });
  if (person.shared > 0) {
    const names = bill.taxes.map(t => t.name).join(", ");
    lines.push(`• Shared charges (${names}): ${money(c, person.shared)}`);
  }
  return lines;
}

// UPI links for one person's amount, or [] when UPI isn't set up or the bill isn't in rupees
function payLinks({ bill, person, people, payment }) {
  if (!payment?.upiId || !supportsUpi(bill)) return [];
  const opts = {
    upiId: payment.upiId,
    payeeName: payment.name || people[0]?.name || "Payee",
    amount: Math.round(person.total * 100) / 100,
    note: `${bill.restaurant} bill`
  };
  const page = payPageLink(opts);
  // In a group message one tappable link per person is enough; fall back to upi:// before deploying
  return page ? [page] : [upiLink(opts)];
}

export function buildShareText({ bill, person, assignments, people, payment }) {
  const c = bill.currency;
  const lines = [`Hi ${person.name}, here's your share of the bill at ${bill.restaurant}:`, ""];
  lines.push(...itemLines({ bill, person, assignments }));
  lines.push("", `*Total: ${money(c, person.total)}*`);

  if (payment?.upiId && supportsUpi(bill)) {
    const opts = {
      upiId: payment.upiId,
      payeeName: payment.name || people[0]?.name || "Payee",
      amount: Math.round(person.total * 100) / 100,
      note: `${bill.restaurant} bill`
    };
    const page = payPageLink(opts);
    lines.push("", `Pay by UPI to ${payment.upiId}:`);
    if (page) lines.push(page);
    lines.push(upiLink(opts));
  }
  return lines.join("\n");
}

// Whole split in one message for a group chat; totals are people with .total/.shared computed
export function buildGroupShareText({ bill, totals, assignments, payment, paid = {} }) {
  const c = bill.currency;
  const [payer, ...debtors] = totals;
  const lines = [
    `*${bill.restaurant}* bill split`,
    `Total ${money(c, bill.total)}, paid by ${payer.name}`,
  ];

  debtors.forEach(person => {
    lines.push("", `*${person.name}: ${money(c, person.total)}*${paid[person.id] ? " ✓ paid" : ""}`);
    lines.push(...itemLines({ bill, person, assignments }));
    if (!paid[person.id]) {
      const links = payLinks({ bill, person, people: totals, payment });
      if (links.length) lines.push(`Pay: ${links[0]}`);
    }
  });

  lines.push("", `${payer.name}'s own share: ${money(c, payer.total)}`);
  if (payment?.upiId && supportsUpi(bill)) lines.push(`UPI: ${payment.upiId}`);
  return lines.join("\n");
}

function isMobile() {
  if (navigator.userAgentData) return navigator.userAgentData.mobile;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

async function copyText(text) {
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
