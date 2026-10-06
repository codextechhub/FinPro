/**
 * Mr Eze sends back Mrs Bello's order for 40 chairs asking for the framework
 * supplier's 30-day terms. She changes the payment terms alone, and only the
 * terms are sent. Moving it to another vendor drops the old vendor's contract,
 * and the cleared link is sent with it.
 */
import { describe, expect, it } from "vitest";

import type { PurchaseOrder } from "@/redux/services/procurement/procurement-types";
import { purchaseOrderChanges, purchaseOrderForm } from "./purchase-order-edit";

const SAVED = {
  id: 3, document_number: "PO-0003", status: "DRAFT", approval_state: "PENDING", approval_returned: true,
  vendor_code: "V-001", contract_id: 12, order_date: "2026-10-02", expected_date: null,
  delivery_address: "Ikeja Branch store", payment_terms: "Cash on delivery",
} as PurchaseOrder;

describe("purchaseOrderChanges", () => {
  it("sends nothing when nothing changed", () => {
    expect(purchaseOrderChanges(SAVED, purchaseOrderForm(SAVED))).toEqual({});
  });

  it("sends only the corrected payment terms", () => {
    expect(purchaseOrderChanges(SAVED, { ...purchaseOrderForm(SAVED), paymentTerms: " Net 30 " }))
      .toEqual({ payment_terms: "Net 30" });
  });

  it("sends a vendor change with the cleared contract link", () => {
    expect(purchaseOrderChanges(SAVED, { ...purchaseOrderForm(SAVED), vendor: "V-002", contract: "" }))
      .toEqual({ vendor: "V-002", contract: "" });
  });
});
