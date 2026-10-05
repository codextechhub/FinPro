import { describe, expect, it } from "vitest";

import { billCorrection } from "./bill-correction";

const bill = { status: "POSTED", total: 25_000_000, amount_paid: 0, amount_credited: 0, document_number: "VI-0007" };

describe("billCorrection", () => {
  it("voids a posted bill nothing has been paid or credited on", () => {
    expect(billCorrection(bill)).toEqual({ posted: true, creditable: true, voidable: true, voidRefusal: null });
  });

  it("refuses to void a part-paid bill and points to a credit note", () => {
    const result = billCorrection({ ...bill, amount_paid: 10_000_000 });
    expect(result.voidable).toBe(false);
    expect(result.creditable).toBe(true);
    expect(result.voidRefusal).toContain("credit note");
  });

  it("refuses to void a bill a credit note settled part of", () => {
    expect(billCorrection({ ...bill, amount_credited: 4_000_000 }).voidable).toBe(false);
  });

  it("offers nothing on a draft, and no credit on a bill credited in full", () => {
    expect(billCorrection({ ...bill, status: "DRAFT" })).toMatchObject({ posted: false, creditable: false, voidable: false });
    expect(billCorrection({ ...bill, amount_credited: 25_000_000 }).creditable).toBe(false);
  });
});
