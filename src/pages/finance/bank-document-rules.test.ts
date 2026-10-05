import { describe, expect, it } from "vitest";

import { bankDocumentAccountProblem, bankDocumentApprovalNote, bankDocumentStatus } from "./bank-document-rules";

describe("bankDocumentAccountProblem", () => {
  it("refuses an account with no branch at a school with several", () => {
    expect(bankDocumentAccountProblem({ name: "UBA shared", branch_id: null }, true))
      .toBe("UBA shared has not been given a branch, so no money can move through it. Give it its branch first.");
  });

  it("accepts a branch's account, and any account at a one-branch school", () => {
    expect(bankDocumentAccountProblem({ name: "Ikeja current", branch_id: 1 }, true)).toBeNull();
    expect(bankDocumentAccountProblem({ name: "Main", branch_id: null }, false)).toBeNull();
    expect(bankDocumentAccountProblem(undefined, true)).toBeNull();
  });
});

describe("a bank document's approval", () => {
  it("reads a rejected draft as rejected, not as waiting", () => {
    const rejected = { status: "DRAFT", approval_state: "REJECTED" as const };
    expect(bankDocumentStatus(rejected)).toBe("REJECTED");
    expect(bankDocumentApprovalNote(rejected)).toMatchObject({ tone: "rejected" });
    expect(bankDocumentApprovalNote(rejected)?.text).toContain("never reached the books");
  });

  it("reads a document whose request is in flight as waiting", () => {
    const pending = { status: "PENDING_APPROVAL", approval_state: "PENDING" as const };
    expect(bankDocumentStatus(pending)).toBe("PENDING_APPROVAL");
    expect(bankDocumentApprovalNote(pending)).toMatchObject({ tone: "waiting" });
  });

  it("says nothing about a document in the books, or a draft never sent for approval", () => {
    expect(bankDocumentApprovalNote({ status: "POSTED", approval_state: "APPROVED" })).toBeNull();
    expect(bankDocumentStatus({ status: "POSTED", approval_state: "APPROVED" })).toBe("POSTED");
    expect(bankDocumentApprovalNote({ status: "REVERSED", approval_state: "NOT_SUBMITTED" })).toBeNull();
    expect(bankDocumentApprovalNote({ status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toBeNull();
    expect(bankDocumentStatus({ status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toBe("DRAFT");
  });
});
