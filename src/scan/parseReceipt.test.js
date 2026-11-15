import { describe, it, expect } from "vitest";
import { parseReceipt } from "./parseReceipt.js";
import r1 from "./__fixtures__/r1.ocr.json";
import r2 from "./__fixtures__/r2.ocr.json";

// OCR output for made-up receipts, one text box per line (x 20 to 320, 24 px apart)
const ocr = (...lines) => lines.map((text, i) => ({ text, poly: [[20, 40 + i * 24], [320, 40 + i * 24], [320, 58 + i * 24], [20, 58 + i * 24]] }));
const summary = (r) => ({
  items: r.items.map(i => [i.name, i.amount]),
  taxes: r.taxes.map(t => [t.name, t.amount]),
  round: r.round, discount: r.discount, total: r.check?.printedTotal ?? null, matches: r.check?.matches ?? null
});

describe("parseReceipt on scanned test receipts", () => {
  it("reads Spice Garden: items, GST, service charge and total", () => {
    expect(summary(parseReceipt(r1.items))).toEqual({
      items: [["Paneer Tikka", 360], ["Butter Chicken (Half)", 280], ["Garlic Naan", 120], ["Veg Biryani", 240], ["Sweet Lime Soda", 160]],
      taxes: [["CGST 2.5%", 29], ["SGST 2.5%", 29], ["Service Charge 5%", 58]],
      round: 0, discount: 0, total: 1276, matches: true
    });
  });

  it("reads a bill with a wrapped item name, a discount and round-off", () => {
    const r = parseReceipt(r2.items);
    expect(r.items.map(i => i.amount)).toEqual([280, 120, 420, 140, 65]);
    expect(r.items[1].name).toBe("Ghee Roast Dosa Special South Indian");
    expect(r.discount).toBe(102.5);
    expect(r.round).toBe(0.38);
    expect(r.check).toEqual({ printedTotal: 969, computedTotal: 969, matches: true });
  });
});

describe("parseReceipt rules", () => {
  it("splits glued quantity, rate and amount columns", () => {
    const r = parseReceipt(ocr("Flame Kitchen", "1.Ghee Rice 2 90180", "2.Beef Fry 1 100100", "3.Milk Peda 1 10 10", "Grand Total: Rs 290.00"));
    expect(summary(r).items).toEqual([["Ghee Rice", 180], ["Beef Fry", 100], ["Milk Peda", 10]]);
    expect(r.check.matches).toBe(true);
    expect(r.restaurant).toBe("Flame Kitchen");
  });

  it("reads a price glued to its label, like Grand Total4770.00", () => {
    const r = parseReceipt(ocr("Cafe", "Dosa 2 100.00 200.00", "Grand Total200.00"));
    expect(r.check).toEqual({ printedTotal: 200, computedTotal: 200, matches: true });
  });

  it("recognises a cut-off Gross Amount line as the total", () => {
    const r = parseReceipt(ocr("Kadavu", "Meals 1 210 210", "Net All Total 210", "GST @2.5% 5.25", "ross Amount Two Hundred R 215.25"));
    expect(r.check).toEqual({ printedTotal: 215.25, computedTotal: 215.25, matches: true });
  });

  it("keeps round-off and discounts apart from items", () => {
    const r = parseReceipt(ocr("Shop", "Tea 1 50 50", "Coffee 1 80 80", "Discount 10.00", "Round off -0.50", "Total 119.50"));
    expect(summary(r)).toMatchObject({ items: [["Tea", 50], ["Coffee", 80]], discount: 10, round: -0.5, total: 119.5, matches: true });
  });

  it("skips phone numbers, dates and bill numbers", () => {
    const r = parseReceipt(ocr("Shop", "Ph: 9876543210", "Bill No: 1042", "Date: 14/11/26 20:41", "Juice 1 60 60", "Total 60"));
    expect(summary(r).items).toEqual([["Juice", 60]]);
  });
});
