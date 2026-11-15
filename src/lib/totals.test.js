import { describe, it, expect } from "vitest";
import { computeTotals, shareLines, roundAdjust, paidStatus, sharesOf, isUneven, chargeNames } from "./totals.js";

const people = [{ id: "a", name: "Asha" }, { id: "b", name: "Ravi" }, { id: "c", name: "Meera" }];
const bill = (extra = {}) => ({
  items: [{ id: "i1", name: "Buffet", amount: 1600 }, { id: "i2", name: "Mocktail", amount: 500 }, { id: "i3", name: "Kulfi", amount: 240 }],
  taxes: [{ id: "t1", name: "CGST", amount: 76 }, { id: "t2", name: "SGST", amount: 76 }],
  taxSplit: "equal", roundOff: false, ...extra
});
const byName = (totals) => Object.fromEntries(totals.map(p => [p.name, Math.round(p.total * 100) / 100]));
const sum = (totals) => Math.round(totals.reduce((s, p) => s + p.total, 0) * 100) / 100;

describe("shares", () => {
  it("counts a person once per share", () => {
    expect(sharesOf(["a", "a", "b"], "a")).toBe(2);
    expect(sharesOf(["a", "b"], "c")).toBe(0);
    expect(isUneven(["a", "a", "b"])).toBe(true);
    expect(isUneven(["a", "b"])).toBe(false);
  });
});

describe("computeTotals", () => {
  it("splits items among the people on them and charges equally", () => {
    const t = computeTotals(bill(), people, { i1: ["a", "b"], i2: ["b", "c"], i3: ["a", "b", "c"] });
    expect(byName(t)).toEqual({ Asha: 930.67, Ravi: 1180.67, Meera: 380.67 });
    expect(sum(t)).toBe(2492);
  });

  it("splits by quantity: Meera had 2 of 3 mocktails", () => {
    const t = computeTotals(bill(), people, { i1: ["a", "b"], i2: ["b", "c", "c"], i3: ["a", "b", "c"] });
    expect(t.find(p => p.name === "Ravi").itemTotal).toBeCloseTo(800 + 500 / 3 + 80);
    expect(t.find(p => p.name === "Meera").itemTotal).toBeCloseTo(1000 / 3 + 80);
    expect(sum(t)).toBe(2492);
  });

  it("shares charges in proportion to items when asked", () => {
    const t = computeTotals(bill({ taxSplit: "proportional" }), people, { i1: ["a"], i2: ["b"], i3: ["c"] });
    const items = 1600 + 500 + 240;
    expect(t[0].shared).toBeCloseTo(152 * 1600 / items);
    expect(t[2].shared).toBeCloseTo(152 * 240 / items);
    expect(sum(t)).toBe(2492);
  });

  it("falls back to equal charges when nobody has items", () => {
    const t = computeTotals(bill({ taxSplit: "proportional" }), people, {});
    t.forEach(p => expect(p.shared).toBeCloseTo(152 / 3));
  });

  it("treats a discount as a negative charge", () => {
    const b = bill({ taxes: [{ id: "d", name: "Discount", amount: -90 }] });
    const t = computeTotals(b, people, { i1: ["a", "b", "c"], i2: ["a", "b", "c"], i3: ["a", "b", "c"] });
    t.forEach(p => expect(p.total).toBeCloseTo((2340 - 90) / 3));
  });

  it("leaves an item nobody had out of everyone's share", () => {
    const t = computeTotals(bill({ taxes: [] }), people, { i1: ["a"], i2: [], i3: [] });
    expect(byName(t)).toEqual({ Asha: 1600, Ravi: 0, Meera: 0 });
  });
});

describe("round off", () => {
  it("rounds the whole bill to the nearest unit and shares the difference", () => {
    const b = { items: [{ id: "x", name: "Meals", amount: 765 }], taxes: [{ id: "g", name: "GST", amount: 38.24 }], roundOff: true };
    expect(roundAdjust(b)).toBe(-0.24);
    expect(roundAdjust({ ...b, roundOff: false })).toBe(0);
    expect(chargeNames(b)).toBe("GST, Round off");
    const t = computeTotals(b, people, { x: ["a", "b", "c"] });
    expect(sum(t)).toBe(803);
  });
});

describe("shareLines", () => {
  it("lists a person's items, notes quantities, and adds their part of the charges", () => {
    const assignments = { i1: ["a", "b"], i2: ["b", "c", "c"], i3: ["a", "b", "c"] };
    const meera = computeTotals(bill(), people, assignments).find(p => p.id === "c");
    const lines = shareLines(bill(), assignments, meera);
    expect(lines.map(l => [l.label, l.note, Math.round(l.amount * 100) / 100])).toEqual([
      ["Mocktail", "×2", 333.33],
      ["Kulfi", "", 80],
      ["Shared charges (CGST, SGST)", "", 50.67]
    ]);
  });

  it("skips the charges line when a person's part rounds to nothing", () => {
    const b = bill({ taxes: [] });
    const asha = computeTotals(b, people, { i1: ["a"] })[0];
    expect(shareLines(b, { i1: ["a"] }, asha).map(l => l.label)).toEqual(["Buffet"]);
  });
});

describe("paidStatus", () => {
  const entry = (paid) => ({ bill: bill(), people, assignments: { i1: ["a", "b"], i2: ["c"] }, paid });
  it("counts only people who owe something, not the payer", () => {
    expect(paidStatus(entry({}))).toEqual({ paidCount: 0, total: 2, settled: false });
    expect(paidStatus(entry({ b: 1 }))).toEqual({ paidCount: 1, total: 2, settled: false });
    expect(paidStatus(entry({ b: 1, c: 1 }))).toEqual({ paidCount: 2, total: 2, settled: true });
  });
});
