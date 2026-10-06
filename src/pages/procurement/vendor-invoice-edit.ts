/**
 * The body of a vendor bill edit: only what the form changed.
 *
 * A bill's lines are sent whole whenever any of them changed, since the server
 * rewrites them from the body; unchanged lines are left out, and the server
 * keeps them. Attaching another purchase order always changes the lines,
 * because they are refilled from that order. A cleared due date is sent as
 * null.
 *
 * The same body corrects a draft and a bill an approver sent back. Either way
 * the server clears the bill's match, and a returned bill is priced and
 * matched again when its request is resumed.
 */

import type { VendorInvoice } from "@/redux/services/procurement/procurement-types";

/** The form's fields. `vendor` is a vendor code; `lines` are as the bill routes take them. */
export interface VendorInvoiceFormValues {
  vendor: string;
  purchaseOrder: number | null;
  invoiceDate: string;
  dueDate: string;
  reference: string;
  narration: string;
  lines: readonly unknown[];
}

/** The PATCH body's fields. */
export interface VendorInvoiceChanges {
  vendor?: string;
  purchase_order?: number | null;
  invoice_date?: string;
  due_date?: string | null;
  vendor_reference?: string;
  narration?: string;
  lines?: Record<string, unknown>[];
}

/**
 * Only what the form changed from `saved`. `savedLines` are the lines the form
 * opened with, in the same shape as `form.lines`.
 */
export function vendorInvoiceChanges(
  saved: VendorInvoice,
  form: VendorInvoiceFormValues,
  savedLines: readonly unknown[],
): VendorInvoiceChanges {
  const out: VendorInvoiceChanges = {};
  if (form.vendor !== saved.vendor_code) out.vendor = form.vendor;
  if (form.purchaseOrder !== (saved.purchase_order_id ?? null)) out.purchase_order = form.purchaseOrder;
  if (form.invoiceDate !== (saved.invoice_date || "")) out.invoice_date = form.invoiceDate;
  if (form.dueDate !== (saved.due_date || "")) out.due_date = form.dueDate || null;
  if (form.reference.trim() !== (saved.vendor_reference || "").trim()) out.vendor_reference = form.reference.trim();
  if (form.narration.trim() !== (saved.narration || "").trim()) out.narration = form.narration.trim();
  if (JSON.stringify(form.lines) !== JSON.stringify(savedLines)) out.lines = form.lines as Record<string, unknown>[];
  return out;
}
