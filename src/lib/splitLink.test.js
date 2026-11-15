import { describe, it, expect } from "vitest";
import { packSplit, unpackSplit } from "./splitLink.js";
import { computeTotals, shareLines } from "./totals.js";
import fixtures from "./__fixtures__/splits.json";

// The expected link strings were produced by the version that people have already shared links from.
// If one of these fails, old links would stop working: change the format only with a new version number.
const payeeOf = (f) => f.payment?.name || f.people[0].name;
const upiOf = (f) => (f.payment?.upiId && f.bill.currency === "₹" ? f.payment.upiId : "");
const pack = (f, person) => packSplit({ bill: f.bill, people: f.people, assignments: f.assignments, person, payee: payeeOf(f), upiId: upiOf(f), paid: f.paid });
const money = (n) => Math.round(n * 100) / 100;

describe.each(fixtures)("$name", (f) => {
  it("packs to exactly the same links as before", () => {
    expect(pack(f)).toBe(f.expected.links.group);
    f.people.forEach(p => expect(pack(f, p)).toBe(f.expected.links[p.id]));
  });

  it("unpacks to the same shares the app shows", () => {
    const app = computeTotals(f.bill, f.people, f.assignments);
    f.people.forEach((p, i) => {
      const link = unpackSplit(pack(f, p));
      expect(link.me).toBe(i);
      const page = computeTotals(link.bill, link.people, link.assignments);
      expect(page.map(x => money(x.total))).toEqual(app.map(x => money(x.total)));
      // Same lines too: the pay page lists what each share is made of
      const lines = (b, a, person) => shareLines(b, a, person).map(l => [l.label, l.note, money(l.amount)]);
      expect(lines(link.bill, link.assignments, page[i])).toEqual(lines(f.bill, f.assignments, app[i]));
    });
  });

  it("carries the bill details and who has paid", () => {
    const link = unpackSplit(pack(f));
    expect(link.me).toBe(-1);
    expect(link.place).toBe(f.bill.restaurant);
    expect(link.currency).toBe(f.bill.currency);
    expect(link.payee).toBe(payeeOf(f));
    expect(link.upiId).toBe(upiOf(f));
    expect(link.bill.taxSplit).toBe(f.bill.taxSplit);
    expect(link.bill.roundOff).toBe(!!f.bill.roundOff);
    const paidNames = link.people.filter(p => link.paid[p.id]).map(p => p.name);
    expect(paidNames).toEqual(f.people.filter(p => f.paid[p.id]).map(p => p.name));
  });
});

describe("unpackSplit", () => {
  it("ignores text glued onto the end of the link", () => {
    const f = fixtures[0];
    const hash = pack(f, f.people[1]);
    expect(unpackSplit(`${hash}%0A%0AHi Ravi`).me).toBe(1);
  });

  it("rejects broken or unknown links", () => {
    expect(() => unpackSplit("notvalid")).toThrow();
    expect(() => unpackSplit(btoa("9\x1eX"))).toThrow();
  });

  it("replaces separator characters in names, so they can't break the format", () => {
    const f = { ...fixtures[2], people: [{ id: "m", name: "Mia\x1dX" }, { id: "n", name: "Noah" }] };
    expect(unpackSplit(pack(f)).people.map(p => p.name)).toEqual(["Mia X", "Noah"]);
  });
});
