/**
 * Where a payroll run stands with its approval route, and what may be done to
 * it next.
 *
 * A run is prepared as a draft, sent for approval, approved, posted and then
 * paid, each its own act. While it is a draft its `status` carries the
 * approval (PENDING_APPROVAL with the approvers, APPROVED once they agree), and
 * `run_status` stays DRAFT until it is posted. The person who prepared a run
 * and the person who sent it never approve it.
 *
 * - `draft`: not sent, or its last request ended (withdrawn, or rejected);
 *   it is sent for approval and may be corrected by whoever may raise runs.
 * - `with-approvers`: nobody may change it until they decide or send it back.
 * - `returned`: an approver handed it back to whoever sent it, who corrects
 *   its period label and narration and resumes it (returned-correction.ts).
 * - `approved`: ready to be posted.
 * - `settled`: posted, paid or cancelled, past approval.
 *
 * A run posted before payroll approvals existed has no approval at all
 * (`NOT_SUBMITTED` once posted). It can still be paid from the bank, but never
 * through the provider; {@link postedWithoutApproval} marks it.
 *
 * A reader whose role may not read the approval status gets runs without
 * `approval_state`; the document's own `status` still tells draft, with
 * approvers and approved apart, and only a run sent back cannot be told from
 * one with its approvers.
 */

import type { PayrollRun } from "@/redux/services/finance/ops-types";
import { isPartlyPaid } from "./payroll-shares";

type RunFacts = Pick<PayrollRun, "run_status" | "status" | "approval_state" | "approval_returned">;

export type RunApprovalPhase = "draft" | "with-approvers" | "returned" | "approved" | "settled";

/** The phase of a run's approval, from what the server sent. */
export function runApprovalPhase(run: RunFacts): RunApprovalPhase {
  if (run.run_status !== "DRAFT") return "settled";
  if (run.status === "APPROVED" || run.approval_state === "APPROVED") return "approved";
  const pending = run.approval_state === "PENDING" || run.status === "PENDING_APPROVAL";
  if (run.approval_returned === true) return "returned";
  // A server from before `approval_returned` returns a sent-back run as a pending draft.
  if (run.approval_returned == null && run.status === "DRAFT" && run.approval_state === "PENDING") return "returned";
  return pending ? "with-approvers" : "draft";
}

/** Whether the last request on a draft ended with an approver's rejection. */
export function wasRejected(run: Pick<RunFacts, "approval_state">): boolean {
  return run.approval_state === "REJECTED";
}

/**
 * Whether a posted run was posted before approvals existed, or without any:
 * the server knows it is not approved, and says so when asked to pay it through
 * the provider. Unknown (false) for a reader who cannot read the approval status.
 */
export function postedWithoutApproval(run: Pick<RunFacts, "run_status" | "approval_state">): boolean {
  return run.run_status === "POSTED" && run.approval_state === "NOT_SUBMITTED";
}

/** What may be offered on a run, before the reader's keys are asked. */
export interface RunOffers {
  /** Send the draft for approval. */
  submit: boolean;
  /** Post an approved run. */
  post: boolean;
  /** Correct the period label and narration of a draft. */
  edit: boolean;
}

/**
 * The actions a run's approval phase allows. `isSender` is true when the reader
 * sent a returned run for approval: only they may correct and resume it, even
 * holding the key to raise runs.
 */
export function runOffers(run: RunFacts, isSender: boolean): RunOffers {
  const phase = runApprovalPhase(run);
  return {
    submit: phase === "draft",
    post: phase === "approved",
    edit: phase === "draft" || (phase === "returned" && isSender),
  };
}

/**
 * The status token a run's pill wears: its approval while a draft, else its own.
 * A reader whose role may not read the approval status (`approval_state` absent)
 * sees a draft as a draft, so the pill never gives away what the switch hides.
 */
export function runStatusKey(run: RunFacts & Pick<PayrollRun, "branch_shares">): string {
  if (run.approval_state === undefined && run.run_status === "DRAFT") return "DRAFT";
  switch (runApprovalPhase(run)) {
    case "with-approvers": return "PENDING_APPROVAL";
    case "returned": return "SENT_BACK";
    case "approved": return "APPROVED";
    default: return isPartlyPaid(run) ? "PART_PAID" : run.run_status;
  }
}

/** The note a draft shows under its figures, by phase; null where the run needs none. */
export function approvalNote(phase: RunApprovalPhase, rejected: boolean): string | null {
  if (phase === "with-approvers") return "With the approvers. Nobody can change it until they decide or send it back.";
  if (phase === "approved") return "Approved. Post it to book the payroll, then pay it.";
  if (phase === "draft" && rejected) return "An approver rejected the last request. Correct the run if it needs it and send it for approval again.";
  if (phase === "draft") return "A second person approves each run before it is posted. The person who prepared it cannot.";
  return null;
}
