import { describe, expect, it, vi } from "vitest";

vi.mock("@/routes/routes-path", () => ({
  routesPath: {
    PROTECTED: {
      FINANCE: {
        LEDGER: "/finance/ledger", RECEIVABLES: "/finance/receivables", EXPENSES: "/finance/expenses",
        PAYMENTS: "/finance/payments", BANKING: "/finance/banking",
      },
      PROCUREMENT: {
        REQUISITIONS: "/procurement/requisitions", PURCHASE_ORDERS: "/procurement/purchase-orders",
        VENDOR_INVOICES: "/procurement/vendor-invoices", VENDOR_PAYMENTS: "/procurement/vendor-payments",
      },
    },
  },
}));

import type { WorkflowInstanceDetail } from "@/redux/services/dashboard/workflow-types";
import { sourceDocumentLink } from "./source-document-link";

const instance = (document_type: string, extra: Record<string, unknown> = {}) =>
  ({ document_type, document_object_id: 41, source_document_link: "", document_summary: null, ...extra }) as unknown as WorkflowInstanceDetail;

describe("sourceDocumentLink", () => {
  it("opens a vendor credit note in the credit notes view of Vendor Invoices", () => {
    expect(sourceDocumentLink(instance("procurement.vendor_credit_note", {
      source_document_link: "/procurement/vendor-credit-notes?document=41&entity=BSS",
    }))).toBe("/procurement/vendor-invoices?view=credit-notes&document=41");
  });

  it("opens a bank transaction and a transfer in the bank documents of Bank Accounts", () => {
    expect(sourceDocumentLink(instance("finance.bank_transaction"))).toBe("/finance/banking?bank_document=transaction&document=41");
    expect(sourceDocumentLink(instance("finance.bank_transfer"))).toBe("/finance/banking?bank_document=transfer&document=41");
  });

  it("keeps a document with no section on its screen", () => {
    expect(sourceDocumentLink(instance("procurement.vendor_invoice"))).toBe("/procurement/vendor-invoices?document=41");
  });
});
