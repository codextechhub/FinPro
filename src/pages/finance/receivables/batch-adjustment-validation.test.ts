import { describe, expect, it } from "vitest";
import { batchAdjustmentLinesAreValid } from "./batch-adjustment-validation";

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
