import { describe, expect, it, vi } from "vitest";

vi.mock("@/routes/routes-path", () => ({
  routesPath: {
    PROTECTED: {
      FINANCE: { BANKING: "/finance/banking" },
      PROCUREMENT: {
        VENDOR_INVOICES: "/procurement/vendor-invoices",
        VENDOR_PAYMENTS: "/procurement/vendor-payments",
        GOODS_RECEIPTS: "/procurement/goods-receipts",
      },
    },
  },
}));

import { P } from "../../../permissions";
import { DOCUMENT_CORRECTIONS, documentScreenLink, isCorrectableDocument } from "./document-correction";

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
    expect(isCorrectableDocument("PETTY_CASH_RETURN")).toBe(false);
  });
});
