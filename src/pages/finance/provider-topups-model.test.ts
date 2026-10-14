/**
 * Ngozi Eze records N2,000,000 that CodeX paid from its Zenith account into
 * Paystack. Until two other people approve it the top-up is a draft she may
 * correct and put forward; once put forward nobody changes it; if an approver
 * sends it back it is a draft again that she corrects and resumes rather than
 * submits a second time.
 */
import { describe, expect, it } from "vitest";
import {
  TOPUP_FILTERS,
  changedTopUpFields,
  topUpApprovalLine,
  topUpCanBeCorrected,
  topUpCanBePutForward,
  topUpFieldsOf,
  topUpPurpose,
  topUpWord,
} from "./provider-topups-model";

const draft = { status: "DRAFT", approval_state: "NOT_SUBMITTED", approval_returned: false } as const;
const sentBack = { status: "DRAFT", approval_state: "PENDING", approval_returned: true } as const;

describe("a top-up's words", () => {
  it("reads each status in plain words", () => {
    expect(topUpWord(draft)).toBe("Draft");
    expect(topUpWord({ status: "PENDING_APPROVAL", approval_state: "PENDING", approval_returned: false })).toBe("Waiting for approval");
    expect(topUpWord({ status: "POSTED", approval_state: "APPROVED", approval_returned: false })).toBe("Booked");
    expect(topUpWord({ status: "REJECTED", approval_state: "REJECTED", approval_returned: false })).toBe("Rejected");
  });

  it("reads a draft an approver returned as Sent back", () => {
    expect(topUpWord(sentBack)).toBe("Sent back");
  });

  it("has no word for a reader who may not read the status", () => {
    expect(topUpWord({})).toBeUndefined();
    expect(topUpApprovalLine({})).toBeNull();
  });

  it("offers the filters a person acts on, not the instant before booking", () => {
    expect(TOPUP_FILTERS.map(([value]) => value)).toEqual(["DRAFT", "PENDING_APPROVAL", "POSTED", "REJECTED"]);
  });

  it("says in one line what the screen is for", () => {
    expect(topUpPurpose("CodeX")).toBe("Record money CodeX adds to its Paystack balance from its own bank, so the daily balance check agrees.");
  });
});

describe("what may be done with a top-up", () => {
  it("corrects and puts forward a draft only", () => {
    expect(topUpCanBeCorrected(draft)).toBe(true);
    expect(topUpCanBePutForward(draft)).toBe(true);
    for (const status of ["PENDING_APPROVAL", "APPROVED", "POSTED", "REJECTED"] as const) {
      expect(topUpCanBeCorrected({ status }), status).toBe(false);
      expect(topUpCanBePutForward({ status, approval_state: "PENDING", approval_returned: false }), status).toBe(false);
    }
  });

  it("corrects a sent-back draft but resumes it instead of submitting it again", () => {
    expect(topUpCanBeCorrected(sentBack)).toBe(true);
    expect(topUpCanBePutForward(sentBack)).toBe(false);
    expect(topUpApprovalLine(sentBack)).toContain("resume");
  });

  it("offers nothing when the status is hidden", () => {
    expect(topUpCanBeCorrected({})).toBe(false);
    expect(topUpCanBePutForward({})).toBe(false);
  });
});

describe("a correction", () => {
  const before = topUpFieldsOf({
    id: 1, amount: 200_000_000, bank_account: 7, topped_up_on: "2026-10-12", provider: "PAYSTACK", reference: "TRF-1", note: "",
  });

  it("starts from the stored figures, with a field the reader cannot see held at its empty value", () => {
    expect(before).toEqual({ amount: 200_000_000, bank_account: 7, topped_up_on: "2026-10-12", provider: "PAYSTACK", reference: "TRF-1", note: "" });
    expect(topUpFieldsOf({ id: 2 })).toEqual({ amount: 0, bank_account: 0, topped_up_on: "", provider: "", reference: "", note: "" });
  });

  it("sends only what moved", () => {
    expect(changedTopUpFields(before, { ...before, amount: 250_000_000, note: "Weekly float" })).toEqual({ amount: 250_000_000, note: "Weekly float" });
    expect(changedTopUpFields(before, { ...before })).toEqual({});
  });
});
