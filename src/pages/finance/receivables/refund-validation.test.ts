import { describe, expect, it } from "vitest";

import {
  refundAmountIsWithinAvailableCredit,
  refundCreditBranchLabel,
  refundCreditKey,
  refundCreditSpansBranches,
  refundRequestBranch,
  type RefundCreditRow,
} from "./refund-validation";

describe("refundAmountIsWithinAvailableCredit", () => {
  it("accepts a partial or exact refund and rejects zero or an over-refund", () => {
    expect(refundAmountIsWithinAvailableCredit(1, 50_000)).toBe(true);
    expect(refundAmountIsWithinAvailableCredit(50_000, 50_000)).toBe(true);
    expect(refundAmountIsWithinAvailableCredit(0, 50_000)).toBe(false);
    expect(refundAmountIsWithinAvailableCredit(50_001, 50_000)).toBe(false);
  });
});

describe("refund credit rows", () => {
  const ikeja = { customer_code: "OKAFOR", branch_id: 1, branch_name: "Ikeja Branch" };
  const lekki = { customer_code: "OKAFOR", branch_id: 2, branch_name: "Lekki Branch" };
  const unbranched = { customer_code: "OKAFOR", branch_id: null, branch_name: null };

  it("keys one customer's credit at each branch apart", () => {
    const keys = [ikeja, lekki, unbranched].map(refundCreditKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("names the branch only when the rows span more than one", () => {
    expect(refundCreditSpansBranches([ikeja])).toBe(false);
    expect(refundCreditSpansBranches([ikeja, lekki])).toBe(true);
    expect(refundCreditBranchLabel(lekki)).toBe("Lekki Branch");
    expect(refundCreditBranchLabel(unbranched)).toBe("School-wide");
  });

  it("sends the row's branch with the refund, and none for unbranched credit", () => {
    expect(refundRequestBranch(lekki)).toBe(2);
    expect(refundRequestBranch(unbranched)).toBeUndefined();
    expect(refundRequestBranch(null)).toBeUndefined();
  });

  it("names no branch when the server reports rows per customer", () => {
    const rows = [
      { customer_code: "OKAFOR", branch_id: 1 },
      { customer_code: "BELLO", branch_id: 2 },
    ] as unknown as RefundCreditRow[];
    expect(refundCreditSpansBranches(rows)).toBe(false);
  });
});
