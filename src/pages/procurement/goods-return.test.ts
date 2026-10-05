import { describe, expect, it } from "vitest";

import { returnLines, returnableQuantity, returnedGoodsText } from "./goods-return";

describe("returnableQuantity", () => {
  it("is what was accepted less what already went back", () => {
    expect(returnableQuantity({ accepted_qty: "100", returned_qty: "20" })).toBe(80);
    expect(returnableQuantity({ accepted_qty: "100" })).toBe(100);
    expect(returnableQuantity({ accepted_qty: "5", returned_qty: "5" })).toBe(0);
  });
});

describe("returnLines", () => {
  it("sends only the lines given a quantity", () => {
    expect(returnLines([{ id: 1 }, { id: 2 }], { 1: "20", 2: "" })).toEqual([{ grn_line: 1, quantity: 20 }]);
  });
});

describe("returnedGoodsText", () => {
  it("names each line sent back with its quantity", () => {
    expect(returnedGoodsText([
      { description: "Office chair", quantity: "2.000" },
      { description: "Desk", quantity: "1.000" },
    ], (value) => String(Number(value)))).toBe("Office chair (2), Desk (1)");
  });

  it("is empty for a return with no lines", () => {
    expect(returnedGoodsText([])).toBe("");
  });
});
