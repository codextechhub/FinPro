/**
 * The one word a person reads for each state of a finance document, shared by
 * a list's status filter, its row pill and its drawer.
 *
 * A filter and a pill that each name a state their own way read as two
 * states: a bursar who picks "Awaiting approval" in the filter gets rows
 * wearing "Pending Approval", and wonders whether the filter worked. Each
 * receivables and payables list draws both from one of these maps instead.
 *
 * A document undone by Void is REVERSED on the wire and "Voided" here, after
 * the action that put it there. A screen whose action is Reverse (a vendor
 * payment) keeps "Reversed" and does not use the REVERSED entry.
 */

/** A vs_finance document's lifecycle (DocumentStatus), for a screen that voids. */
export const DOCUMENT_STATUS_WORDS: Readonly<Record<string, string>> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  POSTED: "Posted",
  REVERSED: "Voided",
};

/** A procurement document's approval overlay (approval_state). */
export const APPROVAL_STATE_WORDS: Readonly<Record<string, string>> = {
  NOT_SUBMITTED: "Not submitted",
  PENDING: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** A bill's payment progress, as its list filter and pill both say it. */
export const PAYMENT_PROGRESS_WORDS: Readonly<Record<string, string>> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partly paid",
  PAID: "Paid",
};

/**
 * The word for `status` from `words`, or undefined so the pill falls back to
 * its own label for a state the map does not name.
 */
export function statusWord(
  status: string | null | undefined,
  words: Readonly<Record<string, string>> = DOCUMENT_STATUS_WORDS,
): string | undefined {
  return status ? words[status.toUpperCase()] : undefined;
}
