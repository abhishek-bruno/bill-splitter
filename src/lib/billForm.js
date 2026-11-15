// The bill form's charge rows, and turning them into the bill's charges.
//
// A form row is { id, name, amount: string }. percent: true means the amount is a percentage of the items
// total (a charge like "Service charge 10%", or a discount). A discount row has discount: true and its amount
// is entered as a positive number. In the bill, a discount is a negative charge (so it's shared like the
// other charges).

const round2 = (n) => Math.round(n * 100) / 100;

// What a charge row adds to the bill: a charge as typed (or that percentage of the items), a discount as a
// negative amount (a percentage discount at most 100%)
export function chargeAmount(row, itemsTotal) {
  const n = parseFloat(row.amount);
  if (!Number.isFinite(n)) return 0;
  if (!row.discount) return row.percent ? round2(itemsTotal * n / 100) : n;
  const off = row.percent ? itemsTotal * Math.min(Math.abs(n), 100) / 100 : Math.abs(n);
  return -round2(off);
}

// The bill's charges from the form rows: named, non-zero, discounts negative.
// A percentage keeps its rate in the name ("Service charge 10%", "Discount 10%") so it shows on messages
// and the pay page.
export function rowsToCharges(rows, itemsTotal) {
  return rows
    .map(row => {
      const amount = chargeAmount(row, itemsTotal);
      const pct = row.percent ? ` ${parseFloat(row.amount)}%` : "";
      const name = (row.name.trim() || (row.discount ? "Discount" : "")) + (pct && !row.name.includes("%") ? pct : "");
      return { id: row.id, name, amount };
    })
    .filter(c => c.name && c.amount !== 0);
}

// Form rows from the bill's charges: a negative charge becomes a discount row (shown as a positive amount)
export function chargesToRows(charges, fallbackId) {
  if (!charges?.length) return [{ id: fallbackId, name: "", amount: "" }];
  return charges.map(c => (c.amount < 0
    ? { id: c.id, name: c.name, amount: String(-c.amount), discount: true }
    : { ...c, amount: String(c.amount) }));
}

// Totals for the panel under the form: items, charges, discounts and the sum before round-off
export function formTotals(items, chargeRows) {
  const itemsTotal = round2(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0));
  let charges = 0, discounts = 0;
  chargeRows.forEach(row => {
    const a = chargeAmount(row, itemsTotal);
    if (row.discount) discounts += a; else charges += a;
  });
  return { itemsTotal, charges: round2(charges), discounts: round2(discounts), total: round2(itemsTotal + charges + discounts) };
}
