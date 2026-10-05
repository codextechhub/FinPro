import { describe, expect, it, vi } from "vitest";

vi.mock("@/routes/routes-path", () => ({
  routesPath: {
    PROTECTED: {
      FINANCE: { BANKING: "/finance/banking", EXPENSES: "/finance/expenses" },
      PROCUREMENT: {
        VENDOR_INVOICES: "/procurement/vendor-invoices",
        VENDOR_PAYMENTS: "/procurement/vendor-payments",
        GOODS_RECEIPTS: "/procurement/goods-receipts",
      },
    },
  },
}));

import { P } from "../../../permissions";
import {
  DOCUMENT_CORRECTIONS, documentScreenLink, isCorrectableDocument, sourceDocumentGuidance,
} from "./document-correction";

describe("the journal screen's corrections for supplier and bank documents", () => {
  it("voids a bill through its own route and permission, never a raw reverse", () => {
    const bill = DOCUMENT_CORRECTIONS.VENDOR_INVOICE;
    expect(bill.undo?.path(12)).toBe("procurement/vendor-invoices/12/void/");
    expect(bill.undo?.permission).toBe(P.PROC_VOID_VENDOR_INVOICE);
    expect(bill.elsewhere).toContain("credit note");
  });

  it("sends a goods receipt to its screen, where goods are returned", () => {
    expect(DOCUMENT_CORRECTIONS.GOODS_RECEIVED_NOTE.undo).toBeUndefined();
    expect(documentScreenLink("GOODS_RECEIVED_NOTE", 4)).toBe("/procurement/goods-receipts?document=4");
  });

  it("opens a credit note and a bank document in their section", () => {
    expect(documentScreenLink("VENDOR_CREDIT_NOTE", 9)).toBe("/procurement/vendor-invoices?view=credit-notes&document=9");
    expect(documentScreenLink("BANK_TRANSFER", 3)).toBe("/finance/banking?bank_document=transfer&document=3");
  });

  it("knows only the kinds it can handle", () => {
    expect(isCorrectableDocument("BANK_TRANSACTION")).toBe(true);
    expect(isCorrectableDocument("INVOICE")).toBe(false);
    expect(isCorrectableDocument("PETTY_CASH_RETURN")).toBe(true);
    expect(isCorrectableDocument("HELD_RECEIPT")).toBe(false);
  });

  it("opens a petty cash return on the petty cash page and voids it through its own route", () => {
    const ret = DOCUMENT_CORRECTIONS.PETTY_CASH_RETURN;
    expect(documentScreenLink("PETTY_CASH_RETURN", 6)).toBe("/finance/expenses/petty-cash?document=6");
    expect(ret.undo?.path(6)).toBe("finance/petty-cash-returns/6/void/");
    expect(ret.undo?.permission).toBe(P.FIN_REVERSE_PETTY_CASH);
  });
});

describe("a goods return's journal", () => {
  const RV = {
    kind: "SOURCE_DOCUMENT_ACTION" as const,
    document_type: "GoodsReturn",
    document_id: 3,
    document_number: "RV-0003",
    receipt: { document_type: "GOODS_RECEIVED_NOTE", document_id: 12, document_number: "GRN-0012" },
    correction: "RECEIVE_AGAIN",
    correction_message: "A goods return is not voided. If the goods on RV-0003 did not go back, or have come back, receive them again against the order of goods receipt GRN-0012.",
  };

  it("says to receive again and opens the receipt the goods came off", () => {
    expect(sourceDocumentGuidance(RV)).toEqual({
      message: RV.correction_message,
      link: "/procurement/goods-receipts?document=12",
      label: "Open goods receipt GRN-0012",
    });
  });

  it("words the correction itself when the server sends no message", () => {
    expect(sourceDocumentGuidance({ ...RV, correction_message: undefined })?.message).toContain("GRN-0012");
  });

  it("says nothing for any other journal", () => {
    expect(sourceDocumentGuidance(undefined)).toBeNull();
    expect(sourceDocumentGuidance({ kind: "REVERSE_JOURNAL" })).toBeNull();
    expect(sourceDocumentGuidance({ kind: "SOURCE_DOCUMENT_ACTION", document_type: "FiscalYear", document_number: "FY2026" })).toBeNull();
    expect(sourceDocumentGuidance({ ...RV, receipt: undefined })).toBeNull();
  });
});
