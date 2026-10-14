/**
 * How a top-up of the platform's provider balance reads and what may be done
 * with it, for the Paystack Top-ups screen.
 *
 * The platform pays money from its own bank into its provider balance. Until
 * two other platform people approve it the top-up books nothing, so the screen
 * speaks in the steps a person takes: record it (a draft), put it forward, and
 * wait for the two approvers. An approver can send it back; it is then a draft
 * again that its sender corrects and resumes from their approvals, which the
 * server shows as a DRAFT whose approval is still PENDING with
 * `approval_returned` true.
 *
 * Every business field is a Field Access switch, so a row may arrive without
 * its status: the helpers here answer "unknown" (no action offered) rather
 * than guess.
 */

import { SENT_BACK_STATUS, SENT_BACK_WORD, isSentBack } from "@/components/finance-ui/returned-correction";
import type { ProviderTopUp, ProviderTopUpStatus } from "@/redux/services/payments/payments-types";

/** What the screen is for, in one line. */
export function topUpPurpose(product: string): string {
  return `Record money ${product} adds to its Paystack balance from its own bank, so the daily balance check agrees.`;
}

/** Each status in the words a person reads. */
export const TOPUP_STATUS_WORDS: Readonly<Record<ProviderTopUpStatus, string>> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Waiting for approval",
  APPROVED: "Approved, booking",
  POSTED: "Booked",
  REJECTED: "Rejected",
};

/** The status filter's choices as [value, label]. Approved is the instant before booking and is not offered. */
export const TOPUP_FILTERS: readonly (readonly [ProviderTopUpStatus, string])[] = [
  ["DRAFT", TOPUP_STATUS_WORDS.DRAFT],
  ["PENDING_APPROVAL", TOPUP_STATUS_WORDS.PENDING_APPROVAL],
  ["POSTED", TOPUP_STATUS_WORDS.POSTED],
  ["REJECTED", TOPUP_STATUS_WORDS.REJECTED],
];

type Standing = Pick<ProviderTopUp, "status" | "approval_state" | "approval_returned">;

/** The status token a top-up's pill wears: Sent back for a draft an approver returned, else its status. */
export function topUpStatus(row: Standing): string | undefined {
  return isSentBack(row) ? SENT_BACK_STATUS : row.status;
}

/** The word a top-up's pill reads, or undefined when its reader may not read the status. */
export function topUpWord(row: Standing): string | undefined {
  const status = topUpStatus(row);
  if (status === SENT_BACK_STATUS) return SENT_BACK_WORD;
  return status ? TOPUP_STATUS_WORDS[status as ProviderTopUpStatus] ?? status : undefined;
}

/** The top-up can still be corrected: only a draft can, and the server refuses (409) anything else. */
export function topUpCanBeCorrected(row: Pick<ProviderTopUp, "status">): boolean {
  return row.status === "DRAFT";
}

/** The top-up can be put forward now: a draft nobody has sent back (a sent-back one is resumed, not submitted). */
export function topUpCanBePutForward(row: Standing): boolean {
  return row.status === "DRAFT" && !isSentBack(row);
}

/** Where the approval stands, as one sentence for the drawer. */
export function topUpApprovalLine(row: Standing): string | null {
  if (isSentBack(row)) return "An approver sent it back. Correct it, then resume it from your approvals.";
  switch (row.status) {
    case "DRAFT": return "Not put forward yet. Two other people must approve it before it is booked.";
    case "PENDING_APPROVAL": return "Waiting for two approvers. Nothing is booked until the second one approves.";
    case "APPROVED": return "Approved. It is being booked.";
    case "POSTED": return "Approved and booked.";
    case "REJECTED": return "Rejected. Nothing was booked.";
    default: return null;
  }
}

/** The body keys that follow the name of the response field that carries their switch. */
export const TOPUP_BODY_FOLLOWS = { bank_account: "bank_account_name" } as const;

/** The form's fields as the server holds them, for a correction to start from. */
export function topUpFieldsOf(row: ProviderTopUp) {
  return {
    amount: row.amount ?? 0,
    bank_account: row.bank_account ?? 0,
    topped_up_on: row.topped_up_on ?? "",
    provider: row.provider ?? "",
    reference: row.reference ?? "",
    note: row.note ?? "",
  };
}

/** The fields a correction changes, and only those, so the server's audit names what moved. */
export function changedTopUpFields<T extends Record<string, string | number>>(before: T, after: T): Partial<T> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => value !== before[key])) as Partial<T>;
}
