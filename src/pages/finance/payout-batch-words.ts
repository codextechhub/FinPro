/**
 * The words a payout batch wears, shared by the batch list's filter, its row
 * pill, its drawer and the procurement payouts screen.
 *
 * The server sends each batch's `display_status`, the word its list files it
 * under: a batch with its approvers reads PENDING_APPROVAL although it is
 * stored as a DRAFT, so it reads "Awaiting approval", not "Draft". A batch an
 * approver sent back keeps display_status DRAFT with `approval_returned` true
 * and reads "Sent back"; no other word lists it, and the filter asks the list
 * for it as `?approval=returned`.
 */

import { DOCUMENT_STATUS_WORDS } from "@/components/finance-ui/status-words";
import { SENT_BACK_FILTER, SENT_BACK_STATUS, SENT_BACK_WORD, isSentBack } from "@/components/finance-ui/returned-correction";
import type { PayoutBatchSummary } from "@/redux/services/payments/payments-types";

/** Each `display_status` the batch list takes, in plain words. */
export const PAYOUT_BATCH_WORDS: Readonly<Record<string, string>> = {
  DRAFT: DOCUMENT_STATUS_WORDS.DRAFT,
  PENDING_APPROVAL: DOCUMENT_STATUS_WORDS.PENDING_APPROVAL,
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partly completed",
  FAILED: "Failed",
};

/** The batch list's status filter as [value, label]: each word, then Sent back. */
export const PAYOUT_BATCH_FILTERS: readonly (readonly [string, string])[] = [
  ...Object.entries(PAYOUT_BATCH_WORDS),
  [SENT_BACK_FILTER, SENT_BACK_WORD],
];

type BatchFacts = Pick<PayoutBatchSummary, "status" | "display_status" | "approval_state" | "approval_returned">;

/**
 * The status token a batch's pill shows: SENT_BACK for one an approver sent
 * back, else the server's `display_status`. A server from before it is read
 * from the stored status, a DRAFT with its approvers reading PENDING_APPROVAL.
 *
 * Sent back is read from `approval_returned` alone. A batch stays a DRAFT
 * while it is with its approvers, so "a DRAFT whose approval is pending",
 * which marks a finance document sent back, would misread every batch
 * waiting on an approver.
 */
export function payoutBatchStatus(batch: BatchFacts): string {
  if (isSentBack(batch)) return SENT_BACK_STATUS;
  if (batch.display_status) return batch.display_status;
  if (batch.status === "DRAFT" && batch.approval_state === "PENDING") return "PENDING_APPROVAL";
  return batch.status;
}

/** The word a batch's pill reads. */
export function payoutBatchWord(batch: BatchFacts): string {
  const status = payoutBatchStatus(batch);
  if (status === SENT_BACK_STATUS) return SENT_BACK_WORD;
  return PAYOUT_BATCH_WORDS[status] ?? status;
}
