// Who owes what. The one place shares are worked out: the app's screens, the share messages and the
// pay page (which unpacks a link into the same shapes, see splitLink.js) all use these functions.
//
// Shapes:
//   bill        { items: [{ id, name, amount }], taxes: [{ id, name, amount }], taxSplit: "equal" | "proportional", roundOff }
//   people      [{ id, name }], the first person paid the bill
//   assignments { [itemId]: [personId, ...] }, a person listed once per share: [a, a, b] means a had 2 of 3

// How many shares of an item a person had (usually 0 or 1)
export const sharesOf = (assigned, id) => assigned.filter(x => x === id).length;

// Split by quantity: someone is listed more than once
export const isUneven = (assigned) => new Set(assigned).size !== assigned.length;

// Round-off: with bill.roundOff on, the total goes to the nearest whole unit and the difference is shared
// like the other charges. Raw total = items + shared charges.
export function roundAdjust(bill) {
  if (!bill?.roundOff) return 0;
  const raw = (bill.items || []).reduce((s, x) => s + x.amount, 0) + (bill.taxes || []).reduce((s, x) => s + x.amount, 0);
  return Math.round((Math.round(raw) - raw) * 100) / 100;
}

// "CGST, SGST, Round off": the names of everything in the shared pool
export const chargeNames = (bill) => [...(bill.taxes || []).map(t => t.name), ...(roundAdjust(bill) ? ["Round off"] : [])].join(", ");

// Each person with itemTotal (their items), shared (their part of the charges) and total.
// Items are divided by shares; the shared pool (charges + round-off) equally, or in proportion to items.
export function computeTotals(bill, people, assignments) {
  const taxTotal = (bill.taxes?.reduce((s, t) => s + t.amount, 0) || 0) + roundAdjust(bill);
  const withItems = people.map(p => {
    let itemTotal = 0;
    bill.items?.forEach(item => {
      const assigned = assignments[item.id] || [];
      const n = sharesOf(assigned, p.id);
      if (n) itemTotal += item.amount * n / assigned.length;
    });
    return { ...p, itemTotal };
  });
  const itemsSum = withItems.reduce((s, p) => s + p.itemTotal, 0);
  const byItems = bill.taxSplit === "proportional" && itemsSum > 0;
  return withItems.map(p => {
    const shared = byItems ? taxTotal * p.itemTotal / itemsSum : taxTotal / (people.length || 1);
    return { ...p, shared, total: p.itemTotal + shared };
  });
}

// What one person's share is made of: a line per item they had, then their part of the shared charges.
// person needs .shared (from computeTotals). note is "×2" when they had more than one of a split-by-quantity item.
export function shareLines(bill, assignments, person) {
  const lines = [];
  (bill.items || []).forEach(item => {
    const assigned = assignments[item.id] || [];
    const n = sharesOf(assigned, person.id);
    if (!n) return;
    const uneven = isUneven(assigned);
    lines.push({
      label: item.name, note: uneven && n > 1 ? `×${n}` : "", amount: item.amount * n / assigned.length,
      total: item.amount, ways: new Set(assigned).size, uneven, shares: n, of: assigned.length
    });
  });
  if (Math.abs(person.shared) >= 0.005) {
    lines.push({ label: `Shared charges (${chargeNames(bill)})`, note: "", amount: person.shared, ways: 1 });
  }
  return lines;
}

// Paid status of a saved split. The first person paid the bill; only people who owe something count.
export function paidStatus(entry) {
  const debtors = computeTotals(entry.bill, entry.people, entry.assignments).slice(1).filter(p => p.total >= 0.005);
  const paidCount = debtors.filter(p => entry.paid?.[p.id]).length;
  return { paidCount, total: debtors.length, settled: debtors.length > 0 && paidCount === debtors.length };
}
