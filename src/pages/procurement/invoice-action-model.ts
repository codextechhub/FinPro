/**
 * Match states the backend requires an explicit audited override to post.
 *
 * Mirrors `MATCH_BLOCKING` in `vs_procurement/constants.py`. Keep the two in step:
 * a state the server blocks but this list omits renders as a passed match with a
 * plain Post button that then fails, which is how `NON_PO_BLOCKED` was missed when
 * `allow_non_po_invoices` flipped to off by default.
 *
 * `PRICE_VARIANCE` is deliberately absent. It does not block: the GR/IR account
 * clears at the receipt basis and the difference lands in purchase price variance
 * (5160), so the bill posts on its own and needs no override.
 */
export const BLOCKING_MATCH_STATUSES = [
  "UNDER_RECEIVED",
  "OVER_BILLED",
  "NON_PO_BLOCKED",
] as const;

export const isBlockingInvoiceVariance = (matchStatus: string) =>
  (BLOCKING_MATCH_STATUSES as readonly string[]).includes(matchStatus);

/** Why this bill cannot post, in the words the person reading it needs. */
export const blockingMatchReason = (matchStatus: string): string | null => {
  if (matchStatus === "UNDER_RECEIVED") {
    return "Billed for more than has been received. Post the outstanding goods receipt, or override.";
  }
  if (matchStatus === "OVER_BILLED") {
    return "Billed beyond the ordered quantity. Amend the order or the bill, or override.";
  }
  if (matchStatus === "NON_PO_BLOCKED") {
    return "This entity does not allow bills without a purchase order. A non-PO bill has no ordered quantity, no receipt and no agreed price to check against, so approval is its only control.";
  }
  return null;
};
