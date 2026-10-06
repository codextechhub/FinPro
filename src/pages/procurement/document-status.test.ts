/**
 * Every payables and purchasing status tab is named with the word its rows'
 * pills show. Mr Okafor picks the bills tab for bills waiting on an approver
 * and the rows under it wear the same "Awaiting approval"; the orders under
 * "Partly received" wear "Partly received", not "Partial".
 */
import { describe, expect, it } from "vitest";

import { statusLabel } from "@/components/finance-ui/status-pill";
import {
  PURCHASE_ORDER_TABS, VENDOR_CREDIT_NOTE_TABS, VENDOR_INVOICE_TABS, approvalStateWord, purchaseOrderWord,
  vendorCreditNoteWord, vendorInvoiceWord,
  purchaseOrderPill,
} from "./document-status";

/** What a pill reads for `status`, given the screen's word for it. */
const pill = (status: string, word: (s: string) => string | undefined) => word(status) ?? statusLabel(status);

describe("payables and purchasing status words", () => {
  it("name each vendor bill tab as its rows' pills read", () => {
    for (const [label, code] of VENDOR_INVOICE_TABS) if (code) expect(pill(code, vendorInvoiceWord)).toBe(label);
    expect(VENDOR_INVOICE_TABS.map(([label]) => label)).toEqual(
      ["All", "Draft", "Awaiting approval", "Approved", "Posted", "Overdue", "Disputed", "Partly paid", "Paid"],
    );
  });

  it("name each vendor credit note tab as its rows' pills read, a voided note included", () => {
    for (const { value, label } of VENDOR_CREDIT_NOTE_TABS) if (value) expect(pill(value, vendorCreditNoteWord)).toBe(label);
    expect(pill("REVERSED", vendorCreditNoteWord)).toBe("Voided");
  });

  it("name each purchase order tab as its rows' pills read", () => {
    for (const { value, label } of PURCHASE_ORDER_TABS) if (value) expect(pill(value, purchaseOrderWord)).toBe(label);
  });

  it("say a document's approval overlay is awaiting approval as its status does", () => {
    expect(approvalStateWord("PENDING")).toBe(vendorInvoiceWord("PENDING_APPROVAL"));
  });
});

describe("purchaseOrderPill", () => {
  // Mrs Bello's order for 40 chairs, as its row and drawer read it.
  it("reads Pending Approval on a draft order its approvers have", () => {
    const pill = purchaseOrderPill({ display_status: "DRAFT", approval_state: "PENDING", approval_returned: false });
    expect(pill.status).toBe("PENDING_APPROVAL");
    expect(pill.label ?? statusLabel(pill.status!)).toBe("Pending Approval");
  });

  it("reads Sent back once an approver hands it back, and Draft before it is sent", () => {
    expect(purchaseOrderPill({ display_status: "DRAFT", approval_state: "PENDING", approval_returned: true }))
      .toEqual({ status: "SENT_BACK", label: "Sent back" });
    const draft = purchaseOrderPill({ display_status: "DRAFT", approval_state: "NOT_SUBMITTED", approval_returned: false });
    expect(draft.status).toBe("DRAFT");
  });
});
