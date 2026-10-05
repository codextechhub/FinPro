import { describe, expect, it } from "vitest";

import { creditInstruction, creditNoteStage } from "./vendor-credit-note-model";

describe("creditInstruction", () => {
  it("credits the whole bill with no figure", () => {
    expect(creditInstruction("full", 0, {})).toEqual({ full: true });
  });

  it("needs a positive amount to credit by amount", () => {
    expect(creditInstruction("amount", 0, {})).toBeNull();
    expect(creditInstruction("amount", 4_000_000, {})).toEqual({ amount: 4_000_000 });
  });

  it("names only the lines given a quantity or an amount", () => {
    // 10 of 100 reams on line 7; nothing on line 8.
    expect(creditInstruction("lines", 0, {
      7: { quantity: "10", net: 0 },
      8: { quantity: "", net: 0 },
    })).toEqual({ lines: [{ invoice_line: 7, quantity: 10 }] });
  });

  it("sends a value-only credit as a net amount", () => {
    expect(creditInstruction("lines", 0, { 9: { quantity: "", net: 150_000 } }))
      .toEqual({ lines: [{ invoice_line: 9, net_amount: 150_000 }] });
  });

  it("is not ready by line until a line is named", () => {
    expect(creditInstruction("lines", 0, { 7: { quantity: "0", net: 0 } })).toBeNull();
  });
});

describe("creditNoteStage", () => {
  it("lets an unsubmitted or rejected draft be edited", () => {
    expect(creditNoteStage({ status: "DRAFT", approval_state: "NOT_SUBMITTED" })).toBe("editable");
    expect(creditNoteStage({ status: "DRAFT", approval_state: "REJECTED" })).toBe("editable");
  });

  it("holds a submitted draft for approval and posts an approved one", () => {
    expect(creditNoteStage({ status: "DRAFT", approval_state: "PENDING" })).toBe("pending");
    expect(creditNoteStage({ status: "DRAFT", approval_state: "APPROVED" })).toBe("approved");
  });

  it("treats a posted note as posted and any other as voided", () => {
    expect(creditNoteStage({ status: "POSTED", approval_state: "APPROVED" })).toBe("posted");
    expect(creditNoteStage({ status: "REVERSED", approval_state: "APPROVED" })).toBe("voided");
  });
});
