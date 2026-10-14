/**
 * Paying a payroll run through the payment provider, in plain words.
 *
 * A school that pays staff through Paystack sends each member of staff's net
 * pay from the money held for their branch, one batch per branch. A line is
 * not sent, needs bank details (the staff member has no checked account),
 * waits for funds (the branch holds less than its batch needs), is sent, paid
 * or failed. A failed line can be sent again; a line that cannot be paid
 * through the provider can be recorded as paid from the branch's own bank,
 * one branch at a time.
 *
 * The status, the reason and the money behind it are Field Access switches of
 * the run's lines: a line without `pay_state` is a line whose status the reader
 * may not read, and nothing here guesses it.
 */

import type {
  PayrollLinePayState,
  PayrollPaymentLine,
  PayrollPayments,
} from "@/redux/services/finance/payroll-paystack-types";

/** What each line state reads, with the tone of its pill. */
export const PAY_STATE_WORDS: Readonly<Record<string, { label: string; tone: string }>> = {
  "": { label: "Not sent yet", tone: "bg-gray-03/60 text-gray-05" },
  NEEDS_BANK_DETAILS: { label: "Needs bank details", tone: "bg-amber-50 text-amber-800" },
  WAITING_FOR_FUNDS: { label: "Waiting for funds", tone: "bg-amber-50 text-amber-800" },
  SENT: { label: "Sent", tone: "bg-blue-50 text-blue-700" },
  PAID: { label: "Paid", tone: "bg-green-01/10 text-green-01" },
  FAILED: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
};

/** The word and tone for a line's state; a state the screen does not know reads as sent on its own label. */
export function payStateWord(state: PayrollLinePayState | undefined, label?: string): { label: string; tone: string } {
  const known = PAY_STATE_WORDS[state ?? ""];
  return known ?? { label: label || "In progress", tone: "bg-blue-50 text-blue-700" };
}

/** A line in a state a payment through the provider can still be made for. */
const SENDABLE: readonly string[] = ["", "NEEDS_BANK_DETAILS"];
/** A line the bursar can record as paid from the branch's bank. */
const RECORDABLE: readonly string[] = ["", "NEEDS_BANK_DETAILS", "FAILED"];

/** Whether the line's status is readable at all. */
const hasState = (line: PayrollPaymentLine) => line.pay_state !== undefined;

/** The lines whose last transfer failed. */
export function failedLines(lines: readonly PayrollPaymentLine[]): PayrollPaymentLine[] {
  return lines.filter((line) => line.pay_state === "FAILED");
}

/** The lines that can be recorded as paid from the bank. */
export function recordableLines(lines: readonly PayrollPaymentLine[]): PayrollPaymentLine[] {
  return lines.filter((line) => hasState(line) && RECORDABLE.includes(line.pay_state ?? ""));
}

/**
 * Whether paying the run is still to do: some line was never sent or is waiting
 * for bank details. True while the statuses cannot be read, so a role that may
 * pay but not read the status is not blocked from paying.
 */
export function hasLinesToSend(payments: Pick<PayrollPayments, "lines"> | undefined): boolean {
  if (!payments) return true;
  if (!payments.lines.length) return true;
  return payments.lines.some((line) => !hasState(line) || SENDABLE.includes(line.pay_state ?? ""));
}

/** Whether any line has already gone to the provider or been settled, so the Pay button reads "the rest". */
export function someLinesGone(lines: readonly PayrollPaymentLine[]): boolean {
  return lines.some((line) => ["WAITING_FOR_FUNDS", "SENT", "PAID", "FAILED"].includes(line.pay_state ?? ""));
}

export interface RecordSelection {
  ok: boolean;
  /** The one branch the chosen lines belong to; null when none are chosen or they span several. */
  branchId: number | null;
  /** Why the lines cannot be recorded together, in plain words. */
  reason: string | null;
}

/** Whether the chosen lines can be recorded as paid together: at least one, and one branch's. */
export function recordSelection(lines: readonly PayrollPaymentLine[], chosen: ReadonlySet<number>): RecordSelection {
  const picked = lines.filter((line) => chosen.has(line.id));
  if (!picked.length) return { ok: false, branchId: null, reason: null };
  const branches = new Set(picked.map((line) => line.branch_id));
  if (branches.size > 1) return { ok: false, branchId: null, reason: "Record one branch's staff at a time, from that branch's bank account." };
  const [only] = branches;
  if (only == null) return { ok: false, branchId: null, reason: "These staff have no branch yet." };
  return { ok: true, branchId: only, reason: null };
}

/** The counts as one sentence a tired bursar can read: "12 of 15 paid. 2 failed, 1 waiting for funds." */
export function progressSentence(payments: Pick<PayrollPayments, "counts" | "lines">): string | null {
  const counts = payments.counts;
  if (!counts) return null;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!total) return null;
  const rest = [
    counts.sent ? `${counts.sent} sent` : "",
    counts.failed ? `${counts.failed} failed` : "",
    counts.waiting_for_funds ? `${counts.waiting_for_funds} waiting for funds` : "",
    counts.needs_bank_details ? `${counts.needs_bank_details} need bank details` : "",
    counts.not_sent ? `${counts.not_sent} not sent yet` : "",
  ].filter(Boolean);
  const head = `${counts.paid} of ${total} paid.`;
  return rest.length ? `${head} ${rest.join(", ")}.` : head;
}

/** What a branch's batch reads, from the batch status the server sends. */
export function batchWord(status: string | undefined): string {
  switch (status) {
    case "COMPLETED": return "Completed";
    case "PARTIALLY_COMPLETED": return "Partly completed";
    case "PROCESSING": return "Processing";
    case "FAILED": return "Failed";
    case "DRAFT": return "Preparing";
    default: return status ? status.toLowerCase().replace(/_/g, " ") : "";
  }
}
