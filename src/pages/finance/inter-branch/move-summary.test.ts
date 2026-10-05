/**
 * Tunde moves from Ikeja to Lekki. What moved, and what Lekki then owes Ikeja,
 * read from the move's response the way the old branch's journal books it.
 */

import { describe, expect, it } from "vitest";

import { counted, isMovedBill, moveDebtSentence, moveSummary, movedDebt, movedItemAmount, movedItemLabel } from "./move-summary";

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

describe("a past move read from the register", () => {
  const term = { kind: "INVOICE" as const, document_number: "INV-0041", invoice_id: 41, note_id: null, payment_id: null, amount: 40_000_000, deferred_amount: 38_000_000 };
  const credit = { kind: "RECEIPT_CREDIT" as const, document_number: "RCT-0012", invoice_id: null, note_id: null, payment_id: 12, amount: 1_000_000, deferred_amount: 0 };

  it("names each document it carried and what it carried", () => {
    expect(movedItemLabel(term)).toBe("Invoice INV-0041");
    expect(movedItemLabel(credit)).toBe("Credit from a receipt RCT-0012");
    expect(movedItemAmount(term, naira)).toBe("N400,000 owed, N380,000 of it not yet earned");
    expect(movedItemAmount({ ...term, deferred_amount: 0 }, naira)).toBe("N400,000 owed");
    expect(movedItemAmount(credit, naira)).toBe("N10,000 credit");
    expect(isMovedBill(term)).toBe(true);
    expect(isMovedBill(credit)).toBe(false);
  });

  it("reads who owes whom from the server's net_owed, signed for the debt sentence", () => {
    const ikeja = { id: 1, name: "Ikeja" };
    const lekki = { id: 2, name: "Lekki" };
    expect(movedDebt({ to_branch_id: 2, net_owed: { amount: 1_000_000, owed_by: lekki, owed_to: ikeja } })).toBe(1_000_000);
    expect(movedDebt({ to_branch_id: 2, net_owed: { amount: 500_000, owed_by: ikeja, owed_to: lekki } })).toBe(-500_000);
    expect(movedDebt({ to_branch_id: 2, net_owed: { amount: 0, owed_by: null, owed_to: null } })).toBe(0);
    expect(movedDebt({ to_branch_id: 2, net_owed: null })).toBeNull();
    expect(moveDebtSentence(1_000_000, "Ikeja", "Lekki", naira)).toMatch(/^Lekki owes Ikeja N10,000/);
  });
});
