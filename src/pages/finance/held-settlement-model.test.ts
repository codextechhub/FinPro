/**
 * A held settlement's stage comes from its status and the approval of the
 * transfer behind it. Only a prepared settlement that is not already waiting
 * for, or past, approval may be put forward.
 */

import { describe, expect, it } from "vitest";

import { canSubmitHeldSettlement, heldSettlementFees, heldSettlementStage, tenantsIn } from "./held-settlement-model";

const batch = (approval_status: "PENDING" | "APPROVED" | "REJECTED" | null) =>
  ({ id: 7, reference: "HS-7", status: "DRAFT", approval_status });

describe("heldSettlementStage", () => {
  it("reads a paid or failed settlement from its status alone", () => {
    expect(heldSettlementStage({ status: "PAID", batch: batch("APPROVED") })).toBe("PAID");
    expect(heldSettlementStage({ status: "FAILED", batch: batch("APPROVED") })).toBe("FAILED");
  });

  it("follows the transfer's approval while the settlement is pending", () => {
    expect(heldSettlementStage({ status: "PENDING", batch: null })).toBe("PREPARING");
    expect(heldSettlementStage({ status: "PENDING", batch: batch(null) })).toBe("TO_SUBMIT");
    expect(heldSettlementStage({ status: "PENDING", batch: batch("PENDING") })).toBe("AWAITING_APPROVAL");
    expect(heldSettlementStage({ status: "PENDING", batch: batch("APPROVED") })).toBe("SENDING");
    expect(heldSettlementStage({ status: "PENDING", batch: batch("REJECTED") })).toBe("TO_SUBMIT");
  });
});

describe("canSubmitHeldSettlement", () => {
  it("allows a prepared settlement nobody has put forward, or one sent back", () => {
    expect(canSubmitHeldSettlement({ status: "PENDING", batch: batch(null) })).toBe(true);
    expect(canSubmitHeldSettlement({ status: "PENDING", batch: batch("REJECTED") })).toBe(true);
  });

  it("refuses one waiting for approval, approved, paid, failed or with nothing to send", () => {
    expect(canSubmitHeldSettlement({ status: "PENDING", batch: batch("PENDING") })).toBe(false);
    expect(canSubmitHeldSettlement({ status: "PENDING", batch: batch("APPROVED") })).toBe(false);
    expect(canSubmitHeldSettlement({ status: "PAID", batch: batch("APPROVED") })).toBe(false);
    expect(canSubmitHeldSettlement({ status: "FAILED", batch: batch(null) })).toBe(false);
    expect(canSubmitHeldSettlement({ status: "PENDING", batch: null })).toBe(false);
  });
});

describe("heldSettlementFees", () => {
  it("adds the provider's fees on the payments to the transfer fee the branch bears", () => {
    expect(heldSettlementFees({ fees: 1_500_000, transfer_fee: 5_000 })).toBe(1_505_000);
  });
});

describe("tenantsIn", () => {
  it("lists each school once, by name", () => {
    expect(tenantsIn([
      { tenant: "lagoon-view", tenant_name: "Lagoon View Academy" },
      { tenant: "holy-cross", tenant_name: "Holy Cross College" },
      { tenant: "lagoon-view", tenant_name: "Lagoon View Academy" },
    ])).toEqual([
      { slug: "holy-cross", name: "Holy Cross College" },
      { slug: "lagoon-view", name: "Lagoon View Academy" },
    ]);
  });
});
