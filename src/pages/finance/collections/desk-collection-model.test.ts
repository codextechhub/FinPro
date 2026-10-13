/**
 * Collecting at the desk: when polling stops, what the screen says, what is sent.
 *
 * Mrs Adeyemi, at Lekki's desk, starts a N45,000 checkout for Tunde's term
 * fees. The parent scans the code, pays, and the screen turns to Paid; if
 * nobody pays for ten minutes the screen stops asking and offers to check again.
 */
import { describe, expect, it } from "vitest";

import {
  DESK_POLL_LIMIT_MS,
  deskAmountError,
  deskCollectionBody,
  deskEmailError,
  deskIsFinal,
  deskNeedsDepositAccount,
  deskOutcome,
  deskShouldPoll,
  deskTimedOut,
  originWord,
} from "./desk-collection-model";

describe("the desk outcome", () => {
  it("reads paid, not paid, refunded and waiting from the collection status", () => {
    expect(deskOutcome("SUCCEEDED")).toBe("paid");
    expect(deskOutcome("FAILED")).toBe("not_paid");
    expect(deskOutcome("ABANDONED")).toBe("not_paid");
    expect(deskOutcome("REFUNDED")).toBe("refunded");
    expect(deskOutcome("PENDING")).toBe("waiting");
    expect(deskOutcome("PROCESSING")).toBe("waiting");
    expect(deskOutcome(undefined)).toBe("waiting");
  });

  it("is final for every answer but waiting", () => {
    expect(deskIsFinal("SUCCEEDED")).toBe(true);
    expect(deskIsFinal("ABANDONED")).toBe(true);
    expect(deskIsFinal("PENDING")).toBe(false);
  });
});

describe("when polling stops", () => {
  const start = 1_000_000;

  it("keeps asking a waiting collection inside ten minutes", () => {
    expect(deskShouldPoll("PENDING", start, start + 3000)).toBe(true);
    expect(deskShouldPoll("PROCESSING", start, start + DESK_POLL_LIMIT_MS - 1)).toBe(true);
  });

  it("stops at ten minutes and says it timed out", () => {
    expect(deskShouldPoll("PENDING", start, start + DESK_POLL_LIMIT_MS)).toBe(false);
    expect(deskTimedOut("PENDING", start, start + DESK_POLL_LIMIT_MS)).toBe(true);
  });

  it("stops on a final answer, which is never a timeout", () => {
    expect(deskShouldPoll("SUCCEEDED", start, start + 3000)).toBe(false);
    expect(deskTimedOut("SUCCEEDED", start, start + DESK_POLL_LIMIT_MS * 2)).toBe(false);
  });
});

describe("the form's checks", () => {
  it("accepts a blank or well formed email", () => {
    expect(deskEmailError("")).toBeNull();
    expect(deskEmailError(" parent@example.com ")).toBeNull();
    expect(deskEmailError("parent@")).not.toBeNull();
  });

  it("caps an invoice collection at its balance and wants some amount", () => {
    expect(deskAmountError(0, 4_500_000)).not.toBeNull();
    expect(deskAmountError(4_500_001, 4_500_000)).not.toBeNull();
    expect(deskAmountError(4_500_000, 4_500_000)).toBeNull();
    expect(deskAmountError(1, null)).toBeNull();
  });

  it("asks for a bank account only for a shared family without an invoice at a school with several branches", () => {
    expect(deskNeedsDepositAccount({ invoiceId: null, customerBranchId: null, multiBranch: true })).toBe(true);
    expect(deskNeedsDepositAccount({ invoiceId: 9, customerBranchId: null, multiBranch: true })).toBe(false);
    expect(deskNeedsDepositAccount({ invoiceId: null, customerBranchId: 2, multiBranch: true })).toBe(false);
    expect(deskNeedsDepositAccount({ invoiceId: null, customerBranchId: null, multiBranch: false })).toBe(false);
    expect(deskNeedsDepositAccount({ invoiceId: null, customerBranchId: undefined, multiBranch: true })).toBe(false);
  });
});

describe("the request body", () => {
  it("tags the collection DESK and names the invoice", () => {
    expect(deskCollectionBody({
      entity: "BSS", amountKobo: 4_500_000, email: " mum@example.com ", customerCode: "C-1",
      invoiceId: 9, depositAccount: "", narration: "Term 3",
    })).toEqual({
      entity: "BSS", amount: 4_500_000, customer: "C-1", invoice: 9, payer_email: "mum@example.com",
      narration: "Term 3", origin: "DESK",
    });
  });

  it("omits what is blank and carries the deposit account of a customer collection", () => {
    expect(deskCollectionBody({
      entity: "BSS", amountKobo: 100, email: "", customerCode: "C-2", invoiceId: null, depositAccount: "1010",
    })).toEqual({ entity: "BSS", amount: 100, customer: "C-2", deposit_account: "1010", origin: "DESK" });
  });
});

describe("the origin word", () => {
  it("separates the desk from everything else", () => {
    expect(originWord("DESK")).toBe("Desk");
    expect(originWord("STANDARD")).toBe("Online");
    expect(originWord(undefined)).toBe("Online");
  });
});
