import { describe, expect, it } from "vitest";
import { batchAdjustmentLinesAreValid, refundBatchBranches } from "./batch-adjustment-validation";

describe("batchAdjustmentLinesAreValid", () => {
  it("accepts distinct targets with positive amounts within their balances", () => {
    expect(batchAdjustmentLinesAreValid([
      { target: "CUST-001", amount: 10_000, available: 20_000 },
      { target: "CUST-002", amount: 30_000, available: 30_000 },
    ])).toBe(true);
  });

  it("rejects duplicates, zero values, and amounts above the target balance", () => {
    expect(batchAdjustmentLinesAreValid([
      { target: "CUST-001", amount: 10_000, available: 20_000 },
      { target: "CUST-001", amount: 5_000, available: 20_000 },
    ])).toBe(false);
    expect(batchAdjustmentLinesAreValid([
      { target: "INV-001", amount: 0, available: 20_000 },
    ])).toBe(false);
    expect(batchAdjustmentLinesAreValid([
      { target: "INV-001", amount: 20_001, available: 20_000 },
    ])).toBe(false);
  });
});

describe("refundBatchBranches", () => {
  const ikeja = { branch_id: 10, branch_name: "Ikeja Branch" };
  const lekki = { branch_id: 20, branch_name: "Lekki Branch" };

  it("names one branch for lines that all belong to it, skipping unpicked lines", () => {
    expect(refundBatchBranches([ikeja, null, ikeja])).toEqual([{ id: 10, name: "Ikeja Branch" }]);
  });

  it("names both branches when Ikeja's and Lekki's refunds are picked together", () => {
    expect(refundBatchBranches([ikeja, lekki])).toEqual([
      { id: 10, name: "Ikeja Branch" }, { id: 20, name: "Lekki Branch" },
    ]);
  });

  it("counts credit not yet given a branch apart from a named branch", () => {
    expect(refundBatchBranches([ikeja, { branch_id: null, branch_name: null }])).toHaveLength(2);
  });
});
