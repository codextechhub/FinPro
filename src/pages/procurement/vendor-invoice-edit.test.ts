/**
 * Mr Eze sends back Mrs Bello's ₦90,000 bill from Ade Stationers asking for the
 * supplier's own invoice number. She types it in, and only the reference is
 * sent: the lines she did not touch stay as they are on the server. Billing 10
 * reams instead of 20 sends the lines, and clearing the due date sends null.
 */
import { describe, expect, it } from "vitest";

import type { VendorInvoice } from "@/redux/services/procurement/procurement-types";
import { vendorInvoiceChanges, type VendorInvoiceFormValues } from "./vendor-invoice-edit";

const SAVED = {
  id: 14, document_number: "VI-0014", status: "DRAFT", approval_state: "PENDING", approval_returned: true,
  vendor_code: "V-001", purchase_order_id: 3, invoice_date: "2026-10-03", due_date: "2026-11-02",
  vendor_reference: "TBC", narration: "",
} as VendorInvoice;
const LINES = [{ po_line: 51, description: "A4 paper", expense_account: "5100", quantity: 20, unit_price: 450_000, line_no: 1 }];
const form = (over: Partial<VendorInvoiceFormValues> = {}): VendorInvoiceFormValues => ({
  vendor: "V-001", purchaseOrder: 3, invoiceDate: "2026-10-03", dueDate: "2026-11-02", reference: "TBC", narration: "",
  lines: LINES, ...over,
});

describe("vendorInvoiceChanges", () => {
  it("sends nothing when nothing changed", () => {
    expect(vendorInvoiceChanges(SAVED, form(), LINES)).toEqual({});
  });

  it("sends only the corrected supplier invoice number", () => {
    expect(vendorInvoiceChanges(SAVED, form({ reference: " ADE-7781 " }), LINES)).toEqual({ vendor_reference: "ADE-7781" });
  });

  it("sends the lines when one changed, and a cleared due date as null", () => {
    const lines = [{ ...LINES[0], quantity: 10 }];
    expect(vendorInvoiceChanges(SAVED, form({ lines, dueDate: "" }), LINES)).toEqual({ lines, due_date: null });
  });
});
