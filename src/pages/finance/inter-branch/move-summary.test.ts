/**
 * Tunde moves from Ikeja to Lekki. What moved, and what Lekki then owes Ikeja,
 * read from the move's response the way the old branch's journal books it.
 */

import { describe, expect, it } from "vitest";

import { counted, moveDebtSentence, moveSummary } from "./move-summary";

const naira = (kobo: number) => `N${(kobo / 100).toLocaleString("en-NG")}`;

describe("a receivable move's summary", () => {
  it("adds the credit back to show the open bills, and nets the debt", () => {
    // N400,000 owed, N10,000 credit, N380,000 not yet earned.
    const summary = moveSummary({
      transfer_id: 31, amount: 39_000_000, invoice_count: 1, invoice_ids: [7], debit_note_count: 0,
      credit_count: 1, credit_amount: 1_000_000, deferred_amount: 38_000_000,
    });
    expect(summary).toEqual({
      owed: 40_000_000, invoiceCount: 1, debitNoteCount: 0, credit: 1_000_000, creditCount: 1,
      deferred: 38_000_000, debt: 1_000_000,
    });
    expect(moveDebtSentence(summary.debt, "Ikeja", "Lekki", naira))
      .toBe("Lekki owes Ikeja N10,000: the bills Lekki now collects, less the credit and unearned fees it took over.");
  });

  it("turns the debt round when the customer was in credit", () => {
    const summary = moveSummary({
      transfer_id: 32, amount: -500_000, invoice_count: 0, invoice_ids: [], debit_note_count: 0,
      credit_count: 1, credit_amount: 500_000, deferred_amount: 0,
    });
    expect(summary.owed).toBe(0);
    expect(moveDebtSentence(summary.debt, "Ikeja", "Lekki", naira))
      .toBe("Ikeja owes Lekki N5,000: the credit and unearned fees Lekki took over came to more than the bills it now collects.");
  });

  it("says when nothing is owed", () => {
    expect(moveDebtSentence(0, "Ikeja", "Lekki", naira)).toBe("Nothing is owed between the branches.");
  });

  it("counts with the right noun", () => {
    expect(counted(1, "invoice", "invoices")).toBe("1 invoice");
    expect(counted(3, "invoice", "invoices")).toBe("3 invoices");
  });
});
