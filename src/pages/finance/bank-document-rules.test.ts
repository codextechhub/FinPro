import { describe, expect, it } from "vitest";

import {
  bankDocumentAccountProblem, bankDocumentApprovalNote, bankDocumentReworkable, bankDocumentStatus, changedFields,
} from "./bank-document-rules";

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
    expect(bankDocumentApprovalNote(rejected)?.text).toContain("has not reached the books");
  });

  it("reads a document whose request is in flight as waiting", () => {
    const pending = { status: "PENDING_APPROVAL", approval_state: "PENDING" as const };
    expect(bankDocumentStatus(pending)).toBe("PENDING_APPROVAL");
    expect(bankDocumentApprovalNote(pending)).toMatchObject({ tone: "waiting" });
  });

  it("says nothing about a document in the books", () => {
    expect(bankDocumentApprovalNote({ status: "POSTED", approval_state: "APPROVED" })).toBeNull();
    expect(bankDocumentStatus({ status: "POSTED", approval_state: "APPROVED" })).toBe("POSTED");
    expect(bankDocumentApprovalNote({ status: "REVERSED", approval_state: "NOT_SUBMITTED" })).toBeNull();
    expect(bankDocumentApprovalNote({ status: "CANCELLED", approval_state: "REJECTED" })).toBeNull();
  });

  it("tells a draft whose request was withdrawn that it can be corrected or cancelled", () => {
    expect(bankDocumentStatus({ status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toBe("DRAFT");
    expect(bankDocumentApprovalNote({ status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toMatchObject({ tone: "returned" });
  });
});

describe("a bank document back from approval", () => {
  it("can be reworked when rejected, or when its request was withdrawn or cancelled", () => {
    expect(bankDocumentReworkable({ status: "DRAFT", approval_state: "REJECTED" })).toBe(true);
    expect(bankDocumentReworkable({ status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toBe(true);
  });

  it("cannot while its approvers hold it, or once it is final", () => {
    expect(bankDocumentReworkable({ status: "PENDING_APPROVAL", approval_state: "PENDING" })).toBe(false);
    expect(bankDocumentReworkable({ status: "DRAFT", approval_state: "PENDING" })).toBe(false);
    expect(bankDocumentReworkable({ status: "DRAFT" })).toBe(false);
    expect(bankDocumentReworkable({ status: "POSTED", approval_state: "APPROVED" })).toBe(false);
    expect(bankDocumentReworkable({ status: "CANCELLED", approval_state: "REJECTED" })).toBe(false);
    expect(bankDocumentReworkable({ status: "REVERSED", approval_state: "NOT_SUBMITTED" })).toBe(false);
  });
});

describe("a correction", () => {
  it("sends only the fields the reader changed", () => {
    const before = { bank_account: 3, amount: 500_000_000, narration: "Owner's capital", reference: "" };
    expect(changedFields(before, { ...before, amount: 450_000_000, reference: "CAP-2" })).toEqual({ amount: 450_000_000, reference: "CAP-2" });
    expect(changedFields(before, { ...before })).toEqual({});
  });
});
