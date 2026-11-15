// A whole split packed into the part of a payment link after "#" (browsers never send it to a server),
// and unpacked again on the pay page into the same shapes the app uses, so totals.js does the math for both.
//
// Format version 2. Plain text with control-character separators (no JSON quotes or brackets), then base64url:
//   fields  (RS \x1e): version, place, currency ("" = ₹), payee ("" = first person), upiId, recipientIdx ("-" = group),
//                      names, items, charges, paidMask, chargeSplit ("p" = in proportion to items),
//                      roundOff ("1" = total rounded to the nearest whole unit)
//   lists   (GS \x1d): one entry per name / item / charge
//   parts   (US \x1f): item = name, amount, peopleMask ("" = everyone), shares (only when split by quantity:
//                      base36 counts for the masked people in list order, joined by "."); charge = name, amount
// Masks are base36 bitmasks over the names list. Trailing empty fields are dropped.
// Links people have already shared must keep working: change the format only with a new version number.
import { sharesOf, isUneven } from "./totals.js";

const VERSION = "2";
const RS = "\x1e", GS = "\x1d", US = "\x1f";
// eslint-disable-next-line no-control-regex
const clean = (v) => String(v ?? "").replace(/[\x1d-\x1f]/g, " ");

// person omitted = group link (the page then asks who is reading it)
export function packSplit({ bill, people, assignments, person, payee, upiId = "", paid = {} }) {
  const idx = new Map(people.map((p, i) => [p.id, i]));
  const everyone = 2 ** people.length - 1;
  const mask = (ids) => ids.reduce((m, id) => (idx.has(id) ? m | (1 << idx.get(id)) : m), 0);
  const maskField = (m) => (m === everyone ? "" : m.toString(36));
  const fields = [
    VERSION,
    clean(bill.restaurant),
    bill.currency === "₹" ? "" : clean(bill.currency),
    payee === people[0]?.name ? "" : clean(payee),
    upiId,
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

// The split from a link's hash, in app shapes: { place, currency, payee, upiId, me, bill, people, assignments, paid }.
// me is the index of the person the link is for, or -1 for a group link. Throws on a broken link.
export function unpackSplit(hash) {
  // Use only the leading base64 run: pasting a multi-line message into the address bar can glue
  // whatever followed the link onto the hash
  const b64 = (decodeURIComponent(hash).match(/^[A-Za-z0-9+/_-]+/) || [""])[0].replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  const f = new TextDecoder().decode(bytes).split(RS);
  if (f[0] !== VERSION || !f[6]) throw new Error("Unsupported or incomplete payment link");

  const list = (v) => (v ? v.split(GS).map(e => e.split(US)) : []);
  const names = f[6].split(GS);
  const people = names.map((name, i) => ({ id: `p${i}`, name }));
  const everyone = 2 ** names.length - 1;
  const inMask = (m, i) => (m & (1 << i)) !== 0;

  const assignments = {};
  const items = list(f[7]).map(([name, amount, maskStr, weights], k) => {
    const id = `i${k}`;
    const m = maskStr ? parseInt(maskStr, 36) : everyone;
    const counts = weights ? weights.split(".").map(x => parseInt(x, 36) || 0) : null;
    const assigned = [];
    let rank = 0;
    people.forEach((p, i) => {
      if (!inMask(m, i)) return;
      const n = counts ? counts[rank] || 0 : 1;
      rank++;
      for (let c = 0; c < n; c++) assigned.push(p.id);
    });
    assignments[id] = assigned;
    return { id, name, amount: Number(amount) || 0 };
  });
  const taxes = list(f[8]).map(([name, amount], k) => ({ id: `t${k}`, name, amount: Number(amount) || 0 }));
  const paidMask = f[9] ? parseInt(f[9], 36) : 0;
  const paid = Object.fromEntries(people.filter((p, i) => inMask(paidMask, i)).map(p => [p.id, true]));

  return {
    place: f[1] || "",
    currency: (f[2] || "₹").slice(0, 4),
    payee: f[3] || names[0],
    upiId: f[4] || "",
    me: f[5] === "-" ? -1 : Number(f[5]) || 0,
    bill: { restaurant: f[1] || "", currency: (f[2] || "₹").slice(0, 4), items, taxes, taxSplit: f[10] === "p" ? "proportional" : "equal", roundOff: f[11] === "1" },
    people,
    assignments,
    paid
  };
}
