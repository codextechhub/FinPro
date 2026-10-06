/**
 * Editing a purchase order's terms: the form's values and the body of an edit.
 *
 * An order's lines are the approved requisition's snapshot, so an edit changes
 * its terms alone: vendor, dates, delivery address, payment terms and the
 * contract it calls off. Only what changed is sent. A contract belongs to one
 * vendor, so the form clears it when the vendor changes, and the cleared link
 * is sent as "" (the server refuses a vendor change that leaves the old
 * vendor's contract in place).
 *
 * The same body corrects a draft and an order an approver sent back.
 */

import type { PurchaseOrder } from "@/redux/services/procurement/procurement-types";

/** The form's fields. `vendor` is a vendor code; `contract` a contract id, "" for none. */
export interface PurchaseOrderFormValues {
  vendor: string;
  orderDate: string;
  expectedDate: string;
  deliveryAddress: string;
  paymentTerms: string;
  contract: string;
}

/** The PATCH body's fields. */
export interface PurchaseOrderChanges {
  vendor?: string;
  order_date?: string;
  expected_date?: string;
  delivery_address?: string;
  payment_terms?: string;
  contract?: string;
}

/** The form a saved order opens with. */
export function purchaseOrderForm(po: PurchaseOrder): PurchaseOrderFormValues {
  return {
    vendor: po.vendor_code,
    orderDate: po.order_date,
    expectedDate: po.expected_date || "",
    deliveryAddress: po.delivery_address || "",
    paymentTerms: po.payment_terms || "",
    contract: po.contract_id ? String(po.contract_id) : "",
  };
}

/** Only the terms the form changed, as the server names them. */
export function purchaseOrderChanges(po: PurchaseOrder, form: PurchaseOrderFormValues): PurchaseOrderChanges {
  const was = purchaseOrderForm(po);
  const out: PurchaseOrderChanges = {};
  if (form.vendor !== was.vendor) out.vendor = form.vendor;
  if (form.orderDate !== was.orderDate) out.order_date = form.orderDate;
  if (form.expectedDate !== was.expectedDate) out.expected_date = form.expectedDate;
  if (form.deliveryAddress.trim() !== was.deliveryAddress.trim()) out.delivery_address = form.deliveryAddress.trim();
  if (form.paymentTerms.trim() !== was.paymentTerms.trim()) out.payment_terms = form.paymentTerms.trim();
  if (form.contract !== was.contract) out.contract = form.contract;
  return out;
}
