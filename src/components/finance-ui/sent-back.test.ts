/**
 * Mrs Bello's credit note for Tunde, sent back by the bursar, is a draft whose
 * request still waits; once she withdraws it, it is an ordinary draft.
 */
import { describe, expect, it } from "vitest";
import { sentBackForChanges } from "./sent-back";

describe("sentBackForChanges", () => {
  it("is true of a draft whose latest request still waits", () => {
    expect(sentBackForChanges({ status: "DRAFT", approval_state: "PENDING" })).toBe(true);
  });

  it("is false of a draft never sent, withdrawn, or rejected", () => {
    expect(sentBackForChanges({ status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toBe(false);
    expect(sentBackForChanges({ status: "DRAFT", approval_state: "REJECTED" })).toBe(false);
  });

  it("is false of a document still with its approvers, and of one whose read shape does not say", () => {
    expect(sentBackForChanges({ status: "PENDING_APPROVAL", approval_state: "PENDING" })).toBe(false);
    expect(sentBackForChanges({ status: "DRAFT" })).toBe(false);
  });
});
