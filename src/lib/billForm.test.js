import { describe, it, expect } from "vitest";
import { chargeAmount, rowsToCharges, chargesToRows, formTotals } from "./billForm.js";

const items = [{ amount: "1600" }, { amount: "700" }, { amount: "" }];

describe("discount rows", () => {
  it("takes a fixed discount off as a negative amount", () => {
    expect(chargeAmount({ name: "Discount", amount: "200", discount: true }, 2300)).toBe(-200);
  });

  it("works out a percentage of the items total", () => {
    expect(chargeAmount({ name: "Discount", amount: "10", discount: true, percent: true }, 2300)).toBe(-230);
    expect(chargeAmount({ name: "", amount: "12.5", discount: true, percent: true }, 999)).toBe(-124.88);
  });

  it("never takes off more than 100%", () => {
    expect(chargeAmount({ amount: "150", discount: true, percent: true }, 500)).toBe(-500);
  });

  it("treats a typed minus on a discount the same as without", () => {
    expect(chargeAmount({ amount: "-50", discount: true }, 500)).toBe(-50);
  });

  it("works out a percentage charge from the items total", () => {
    expect(chargeAmount({ name: "Service charge", amount: "10", percent: true }, 2300)).toBe(230);
    expect(chargeAmount({ name: "GST", amount: "2.5", percent: true }, 765)).toBe(19.13);
  });

  it("keeps ordinary charges as typed, including an old-style negative one", () => {
    expect(chargeAmount({ amount: "76" }, 2300)).toBe(76);
    expect(chargeAmount({ amount: "-10" }, 2300)).toBe(-10);
    expect(chargeAmount({ amount: "" }, 2300)).toBe(0);
  });
});

describe("rowsToCharges", () => {
  it("names discounts, keeps the rate in the name, and drops empty rows", () => {
    const rows = [
      { id: "t1", name: "CGST", amount: "76" },
      { id: "d1", name: "", amount: "10", discount: true, percent: true },
      { id: "d2", name: "Coupon", amount: "50", discount: true },
      { id: "t2", name: "", amount: "" },
      { id: "d3", name: "Discount", amount: "", discount: true }
    ];
    expect(rowsToCharges(rows, 2300)).toEqual([
      { id: "t1", name: "CGST", amount: 76 },
      { id: "d1", name: "Discount 10%", amount: -230 },
      { id: "d2", name: "Coupon", amount: -50 }
    ]);
  });

  it("keeps the rate in a percentage charge's name", () => {
    expect(rowsToCharges([{ id: "s", name: "Service charge", amount: "10", percent: true }], 2300)).toEqual([{ id: "s", name: "Service charge 10%", amount: 230 }]);
  });

  it("doesn't repeat a rate the name already has", () => {
    expect(rowsToCharges([{ id: "d", name: "Happy hour 20%", amount: "20", discount: true, percent: true }], 100)[0].name).toBe("Happy hour 20%");
  });
});

describe("chargesToRows", () => {
  it("turns negative charges back into discount rows", () => {
    expect(chargesToRows([{ id: "t", name: "GST", amount: 19.12 }, { id: "d", name: "Discount", amount: -102.5 }], "t1")).toEqual([
      { id: "t", name: "GST", amount: "19.12" },
      { id: "d", name: "Discount", amount: "102.5", discount: true }
    ]);
  });

  it("starts with one empty row when there are no charges", () => {
    expect(chargesToRows([], "t1")).toEqual([{ id: "t1", name: "", amount: "" }]);
  });
});

describe("formTotals", () => {
  it("shows charges and discounts separately", () => {
    const rows = [{ name: "GST", amount: "115" }, { name: "Discount", amount: "10", discount: true, percent: true }];
    expect(formTotals(items, rows)).toEqual({ itemsTotal: 2300, charges: 115, discounts: -230, total: 2185 });
  });
});
