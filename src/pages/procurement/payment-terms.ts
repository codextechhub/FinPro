/**
 * The payment terms a vendor, a contract and the procurement defaults may carry.
 *
 * One list, mirroring `vs_procurement.constants.PaymentTerms`, because the
 * backend refuses any value outside it and a save carrying one fails. "Pay at
 * once" is `NET_0`; there is no other spelling of it. The label is the
 * backend's own, so a term reads the same on every screen that shows it.
 *
 * A purchase order's terms are free text on the backend and do not use this.
 */
export const PAYMENT_TERMS = [
  ["NET_0", "Due on receipt"],
  ["NET_7", "Net 7 days"],
  ["NET_14", "Net 14 days"],
  ["NET_30", "Net 30 days"],
  ["NET_60", "Net 60 days"],
  ["NET_90", "Net 90 days"],
] as const;

export type PaymentTerm = (typeof PAYMENT_TERMS)[number][0];

const LABELS: ReadonlyMap<string, string> = new Map(PAYMENT_TERMS);

/** The reader's words for a stored term; "" when none is set. An unknown code
 *  is shown as stored rather than guessed at. */
export function paymentTermsLabel(value?: string | null): string {
  if (!value) return "";
  return LABELS.get(value) ?? value;
}
