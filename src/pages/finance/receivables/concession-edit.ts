/**
 * Correcting a draft concession: what the edit form may change, and the body
 * it sends.
 *
 * A concession discounts one invoice of one customer, so the customer, the
 * invoice and the branch are fixed; a correction changes its kind, date,
 * amount, allowance account, reason and reference. Only the fields that
 * changed are sent, so a reader who fixes a typo in the reason does not also
 * rewrite the amount a colleague set a moment ago.
 *
 * A draft is corrected whether it was never sent or came back from approval
 * (rejected, or its request withdrawn or cancelled). One an approver sent back
 * is still with its approvers, and the server refuses it (422) like one
 * waiting for approval or posted.
 */

import type { Concession } from "@/redux/services/finance/ar-types";

/** The edit form's fields. `allowance` is an account code, "" for the default. */
export interface ConcessionForm {
  kind: string;
  date: string;
  amount: number;
  allowance: string;
  reason: string;
  reference: string;
}

/** The PATCH body's fields. */
export interface ConcessionChanges {
  kind?: string;
  concession_date?: string;
  amount?: number;
  allowance_account?: string | null;
  reason?: string;
  reference?: string;
}

/** The form a saved concession opens with. */
export function concessionForm(c: Concession): ConcessionForm {
  return {
    kind: c.kind,
    date: c.concession_date,
    amount: c.amount,
    allowance: c.allowance_account ?? "",
    reason: c.reason ?? "",
    reference: c.reference ?? "",
  };
}

/** Only the fields the form changed, as the server names them. */
export function concessionChanges(saved: Concession, form: ConcessionForm): ConcessionChanges {
  const was = concessionForm(saved);
  const out: ConcessionChanges = {};
  if (form.kind !== was.kind) out.kind = form.kind;
  if (form.date !== was.date) out.concession_date = form.date;
  if (form.amount !== was.amount) out.amount = form.amount;
  if (form.allowance !== was.allowance) out.allowance_account = form.allowance || null;
  if (form.reason.trim() !== was.reason.trim()) out.reason = form.reason.trim();
  if (form.reference.trim() !== was.reference.trim()) out.reference = form.reference.trim();
  return out;
}

/** Why the form cannot be saved yet, or null. */
export function concessionFormProblem(form: ConcessionForm): string | null {
  if (!form.date) return "Choose the date.";
  if (form.amount <= 0) return "Enter an amount above zero.";
  if (!form.reason.trim()) return "Say what the concession is for.";
  return null;
}
