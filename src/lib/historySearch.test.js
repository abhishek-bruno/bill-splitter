import { describe, it, expect } from "vitest";
import { matchesSearch, filterSplits } from "./historySearch.js";

const split = (id, restaurant, people, items = []) => ({
  id, bill: { restaurant, items: items.map((name, i) => ({ id: `i${i}`, name, amount: 100 })) },
  people: people.map(([name, contactId], i) => ({ id: `p${i}`, name, contactId }))
});
const history = [
  split("a", "Taj", [["Asha", "ca"], ["Ravi", "cr"]], ["Biryani"]),
  split("b", "Barbeque Nation", [["Asha", "ca"], ["Meera", "cm"]], ["Mocktail"]),
  split("c", "Third Wave Coffee", [["Ravi", "cr"], ["Meera", "cm"]], ["Latte"])
];
const ids = (list) => list.map(e => e.id);

describe("searching saved splits", () => {
  it("matches the bill name, people and items, ignoring case", () => {
    expect(ids(filterSplits(history, { query: "barbeque" }))).toEqual(["b"]);
    expect(ids(filterSplits(history, { query: "RAVI" }))).toEqual(["a", "c"]);
    expect(ids(filterSplits(history, { query: "latte" }))).toEqual(["c"]);
  });

  it("needs every word to match", () => {
    expect(ids(filterSplits(history, { query: "taj ravi" }))).toEqual(["a"]);
    expect(ids(filterSplits(history, { query: "taj meera" }))).toEqual([]);
  });

  it("shows everything for an empty search", () => {
    expect(matchesSearch(history[0], "   ")).toBe(true);
    expect(ids(filterSplits(history))).toEqual(["a", "b", "c"]);
  });

  it("combines with the person filter", () => {
    expect(ids(filterSplits(history, { person: "cm" }))).toEqual(["b", "c"]);
    expect(ids(filterSplits(history, { person: "cm", query: "coffee" }))).toEqual(["c"]);
  });
});
