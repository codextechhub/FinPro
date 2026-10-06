/**
 * The body of a vendor payment edit: the bills it settles, and whichever of its
 * other fields changed.
 *
 * The allocations always go, because the server rebuilds the payment's plan,
 * and its gross, from them on every edit. Every other field goes only when it
 * changed, and the server keeps the rest. The withholding figure follows the
 * server's rule for it: a figure the server did not work out itself is kept
 * when left out, so it is sent only when it differs from that; a computed one
 * is worked out again.
 *
 * The same body corrects a draft and a payment an approver sent back. A
 * returned payment keeps its branch, so the server refuses (400) a correction
 * that would settle another branch's bills.
 */

import type { VendorPayment } from "@/redux/services/procurement/procurement-types";

/** The form's fields. `bank` is a bank account id; `whtToSend` is undefined when the server works WHT out. */
export interface VendorPaymentFormValues {
  vendor: string;
  paymentDate: string;
  method: string;
  bank: string;
  reference: string;
  narration: string;
  whtCode: string;
  whtToSend: number | undefined;
  allocations: { vendor_invoice: number; amount: number }[];
}

/** The PATCH body's fields. */
export interface VendorPaymentChanges {
  vendor?: string;
  payment_date?: string;
  method?: string;
  bank_account?: number;
  reference?: string;
  narration?: string;
  wht_tax_code?: string | null;
  wht_amount?: number;
  allocations: { vendor_invoice: number; amount: number }[];
}

/** The allocations, and only the other fields the form changed from `saved`. */
export function vendorPaymentChanges(saved: VendorPayment, form: VendorPaymentFormValues): VendorPaymentChanges {
  const out: VendorPaymentChanges = { allocations: form.allocations };
  if (form.vendor !== saved.vendor_code) out.vendor = form.vendor;
  if (form.paymentDate !== saved.payment_date) out.payment_date = form.paymentDate;
  if (form.method !== saved.method) out.method = form.method;
  if (form.bank !== (saved.bank_account_id ? String(saved.bank_account_id) : "")) out.bank_account = Number(form.bank);
  if (form.reference.trim() !== (saved.reference || "").trim()) out.reference = form.reference.trim();
  if (form.narration.trim() !== (saved.narration || "").trim()) out.narration = form.narration.trim();
  if (form.whtCode !== (saved.wht_tax_code_value || "")) out.wht_tax_code = form.whtCode || null;
  const keptAsSaved = saved.wht_source !== "COMPUTED" && form.whtToSend === saved.wht_amount;
  if (form.whtToSend !== undefined && !keptAsSaved) out.wht_amount = form.whtToSend;
  return out;
}
