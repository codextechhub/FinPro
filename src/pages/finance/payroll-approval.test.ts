/**
 * A payroll run's approval, in Bright Star's words. Mrs Bello prepares January's
 * run and sends it for approval, Mr Eze approves it, and she posts it. February's
 * run is sent back by Mr Eze: Mrs Bello, who sent it, corrects its period label
 * and resumes it, while her colleague Mrs Adeyemi, who also raises runs, can do
 * neither. A run posted before approvals existed is told apart so it is never
 * offered for payment through Paystack.
 */
import { describe, expect, it } from "vitest";
import {
  approvalNote, postedWithoutApproval, runApprovalPhase, runOffers, runStatusKey, wasRejected,
} from "./payroll-approval";

const run = (over: Record<string, unknown> = {}) => ({
  run_status: "DRAFT", status: "DRAFT", approval_state: "NOT_SUBMITTED", approval_returned: false, branch_shares: [], ...over,
}) as never;

describe("the phase of a run's approval", () => {
  it("is a draft until it is sent", () => {
    expect(runApprovalPhase(run())).toBe("draft");
    expect(runOffers(run(), false)).toEqual({ submit: true, post: false, edit: true });
  });

  it("is with the approvers once sent, and nobody may change or post it", () => {
    const sent = run({ status: "PENDING_APPROVAL", approval_state: "PENDING" });
    expect(runApprovalPhase(sent)).toBe("with-approvers");
    expect(runOffers(sent, true)).toEqual({ submit: false, post: false, edit: false });
  });

  it("is sent back when an approver handed it to its sender, who alone may correct it", () => {
    const back = run({ approval_state: "PENDING", approval_returned: true });
    expect(runApprovalPhase(back)).toBe("returned");
    expect(runOffers(back, true)).toEqual({ submit: false, post: false, edit: true });
    expect(runOffers(back, false)).toEqual({ submit: false, post: false, edit: false });
  });

  it("reads a pending draft from a server before approval_returned as sent back", () => {
    const old = run({ approval_state: "PENDING", approval_returned: undefined });
    expect(runApprovalPhase(old)).toBe("returned");
  });

  it("is approved, and may be posted, once the approvers agree", () => {
    const approved = run({ status: "APPROVED", approval_state: "APPROVED" });
    expect(runApprovalPhase(approved)).toBe("approved");
    expect(runOffers(approved, false)).toEqual({ submit: false, post: true, edit: false });
  });

  it("still tells approved from awaiting when the reader may not read the approval status", () => {
    expect(runApprovalPhase(run({ status: "APPROVED", approval_state: undefined, approval_returned: undefined }))).toBe("approved");
    expect(runApprovalPhase(run({ status: "PENDING_APPROVAL", approval_state: undefined, approval_returned: undefined }))).toBe("with-approvers");
    expect(runApprovalPhase(run({ approval_state: undefined, approval_returned: undefined }))).toBe("draft");
  });

  it("is settled once posted, paid or cancelled", () => {
    for (const run_status of ["POSTED", "PAID", "CANCELLED"]) {
      expect(runApprovalPhase(run({ run_status, status: "POSTED", approval_state: "APPROVED" }))).toBe("settled");
      expect(runOffers(run({ run_status, approval_state: "APPROVED" }), true)).toEqual({ submit: false, post: false, edit: false });
    }
  });

  it("offers a rejected draft to be sent again", () => {
    const rejected = run({ approval_state: "REJECTED" });
    expect(wasRejected(rejected)).toBe(true);
    expect(runOffers(rejected, false).submit).toBe(true);
    expect(approvalNote("draft", true)).toContain("rejected");
  });
});

describe("a run posted before approvals existed", () => {
  it("is marked, so it is never offered for payment through Paystack", () => {
    expect(postedWithoutApproval({ run_status: "POSTED", approval_state: "NOT_SUBMITTED" })).toBe(true);
    expect(postedWithoutApproval({ run_status: "POSTED", approval_state: "APPROVED" })).toBe(false);
    expect(postedWithoutApproval({ run_status: "POSTED", approval_state: undefined })).toBe(false);
    expect(postedWithoutApproval({ run_status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toBe(false);
  });
});

describe("the pill and the note", () => {
  it("shows the approval while a draft and the run's own state afterwards", () => {
    expect(runStatusKey(run())).toBe("DRAFT");
    expect(runStatusKey(run({ status: "PENDING_APPROVAL", approval_state: "PENDING" }))).toBe("PENDING_APPROVAL");
    expect(runStatusKey(run({ approval_state: "PENDING", approval_returned: true }))).toBe("SENT_BACK");
    expect(runStatusKey(run({ status: "APPROVED", approval_state: "APPROVED" }))).toBe("APPROVED");
    expect(runStatusKey(run({ run_status: "POSTED", approval_state: "APPROVED" }))).toBe("POSTED");
    expect(runStatusKey(run({
      run_status: "POSTED", approval_state: "APPROVED",
      branch_shares: [{ status: "PAID" }, { status: "POSTED" }],
    }))).toBe("PART_PAID");
  });

  it("keeps a draft a draft for a reader who may not read the approval status", () => {
    expect(runStatusKey(run({ status: "PENDING_APPROVAL", approval_state: undefined, approval_returned: undefined }))).toBe("DRAFT");
    expect(runStatusKey(run({ run_status: "POSTED", approval_state: undefined, approval_returned: undefined }))).toBe("POSTED");
  });

  it("says nothing for a run past approval", () => {
    expect(approvalNote("settled", false)).toBeNull();
    expect(approvalNote("returned", false)).toBeNull();
  });
});
