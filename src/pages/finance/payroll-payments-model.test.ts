/**
 * Bright Star pays January's payroll through Paystack. Ikeja holds enough and
 * its staff are paid; Lekki holds less than its batch needs and waits. Tunde
 * has no checked bank account, so he is not sent anything and is paid from
 * Lekki's bank by hand.
 */
import { describe, expect, it } from "vitest";
import {
  batchWord, failedLines, hasLinesToSend, payStateWord, progressSentence, recordSelection, recordableLines, someLinesGone,
} from "./payroll-payments-model";

const line = (over: Record<string, unknown>) => ({
  id: 1, line_no: 1, employee_id: 5, employee_name: "Aisha Bello", net_amount: 25_000_000,
  branch_id: 1, branch_name: "Ikeja", pay_state: "", pay_state_label: "", ...over,
}) as never;

describe("the words a line wears", () => {
  it("reads each state in plain words", () => {
    expect(payStateWord("").label).toBe("Not sent yet");
    expect(payStateWord("NEEDS_BANK_DETAILS").label).toBe("Needs bank details");
    expect(payStateWord("WAITING_FOR_FUNDS").label).toBe("Waiting for funds");
    expect(payStateWord("SENT").label).toBe("Sent");
    expect(payStateWord("PAID").label).toBe("Paid");
    expect(payStateWord("FAILED").label).toBe("Failed");
  });

  it("falls back to the server's own label for a state it does not know", () => {
    expect(payStateWord("REVERSED" as never, "Reversed").label).toBe("Reversed");
  });

  it("words a branch's batch", () => {
    expect(batchWord("PARTIALLY_COMPLETED")).toBe("Partly completed");
    expect(batchWord("SOMETHING_NEW")).toBe("something new");
    expect(batchWord(undefined)).toBe("");
  });
});

describe("which lines can be acted on", () => {
  const lines = [
    line({ id: 1, pay_state: "PAID" }), line({ id: 2, pay_state: "FAILED" }), line({ id: 3, pay_state: "NEEDS_BANK_DETAILS" }),
    line({ id: 4, pay_state: "SENT" }), line({ id: 5, pay_state: "WAITING_FOR_FUNDS" }), line({ id: 6, pay_state: "" }),
  ];

  it("retries only the failed lines", () => {
    expect(failedLines(lines).map((l) => l.id)).toEqual([2]);
  });

  it("records from the bank only lines never sent, needing bank details or failed", () => {
    expect(recordableLines(lines).map((l) => l.id)).toEqual([2, 3, 6]);
  });

  it("offers nothing to record where the status cannot be read", () => {
    const hidden = [line({ id: 9, pay_state: undefined })];
    expect(recordableLines(hidden)).toEqual([]);
  });

  it("has lines to send while any was never sent or needs bank details", () => {
    expect(hasLinesToSend({ lines } as never)).toBe(true);
    expect(hasLinesToSend({ lines: [line({ pay_state: "PAID" }), line({ id: 2, pay_state: "SENT" })] } as never)).toBe(false);
  });

  it("does not block a role that cannot read the status from paying", () => {
    expect(hasLinesToSend({ lines: [line({ pay_state: undefined })] } as never)).toBe(true);
    expect(hasLinesToSend(undefined)).toBe(true);
    expect(hasLinesToSend({ lines: [] } as never)).toBe(true);
  });

  it("knows when some lines have already gone", () => {
    expect(someLinesGone(lines)).toBe(true);
    expect(someLinesGone([line({ pay_state: "" }), line({ id: 2, pay_state: "NEEDS_BANK_DETAILS" })])).toBe(false);
  });
});

describe("recording lines as paid from the bank", () => {
  const lines = [
    line({ id: 1, branch_id: 1, branch_name: "Ikeja" }), line({ id: 2, branch_id: 2, branch_name: "Lekki" }),
    line({ id: 3, branch_id: 2, branch_name: "Lekki" }), line({ id: 4, branch_id: null, branch_name: null }),
  ];

  it("needs at least one line", () => {
    expect(recordSelection(lines, new Set())).toEqual({ ok: false, branchId: null, reason: null });
  });

  it("takes one branch's lines together", () => {
    expect(recordSelection(lines, new Set([2, 3]))).toEqual({ ok: true, branchId: 2, reason: null });
  });

  it("refuses two branches at once, and says to go branch by branch", () => {
    const result = recordSelection(lines, new Set([1, 2]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Record one branch's staff at a time, from that branch's bank account.");
  });

  it("refuses staff who have no branch yet", () => {
    expect(recordSelection(lines, new Set([4])).ok).toBe(false);
  });
});

describe("the progress sentence", () => {
  const counts = (over: Record<string, number>) => ({ not_sent: 0, needs_bank_details: 0, waiting_for_funds: 0, sent: 0, paid: 0, failed: 0, ...over });

  it("counts paid out of all, then what is left", () => {
    expect(progressSentence({ lines: [], counts: counts({ paid: 12, failed: 2, waiting_for_funds: 1 }) })).toBe("12 of 15 paid. 2 failed, 1 waiting for funds.");
  });

  it("stops after the paid count when everything is paid", () => {
    expect(progressSentence({ lines: [], counts: counts({ paid: 15 }) })).toBe("15 of 15 paid.");
  });

  it("says nothing for a reader who may not read the status", () => {
    expect(progressSentence({ lines: [], counts: undefined })).toBeNull();
    expect(progressSentence({ lines: [], counts: counts({}) })).toBeNull();
  });
});
