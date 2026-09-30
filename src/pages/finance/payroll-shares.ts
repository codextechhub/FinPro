/**
 * The pieces of a payroll run that follow from its branches.
 *
 * One run pays all staff, and at a school with several branches it posts one
 * journal per branch, each branch's share paid from that branch's own bank
 * account (`branch_shares`). The run reads PAID only once every share is paid,
 * and cannot be voided while any share is. A server without shares sends none,
 * and every rule here then answers as it did for a run with one journal.
 */

import type { PayrollRun, PayrollRunBranchShare } from "@/redux/services/finance/ops-types";

/**
 * Whether the reader holds only their own branches' part of a run that covers
 * the whole school.
 *
 * A bursar bound to Lekki opens the school's central January run through
 * Lekki's share: the server sends Lekki's staff, Lekki's share and totals
 * summed from them, and nothing of any other branch. Posting, paying and
 * voiding act on every branch at once, so they stay with somebody who covers
 * the whole school. The server says so with `partial_view`; a central run in
 * front of a branch-bound reader is read the same way, so the answer does not
 * depend on the server's version.
 */
export function isBranchPartOfWholeSchoolRun(
  run: Pick<PayrollRun, "branch_id" | "partial_view">,
  wholeSchool: boolean,
): boolean {
  return run.partial_view === true || (run.branch_id == null && !wholeSchool);
}

/** The run's branch shares; empty for a run posted as one journal. */
export function sharesOf(run: Pick<PayrollRun, "branch_shares">): PayrollRunBranchShare[] {
  return run.branch_shares ?? [];
}

/** The shares still waiting to be paid. */
export function unpaidShares(run: Pick<PayrollRun, "branch_shares">): PayrollRunBranchShare[] {
  return sharesOf(run).filter((share) => share.status === "POSTED");
}

/** A posted run some of whose branches are paid and some are not. */
export function isPartlyPaid(run: Pick<PayrollRun, "run_status" | "branch_shares">): boolean {
  const shares = sharesOf(run);
  return run.run_status === "POSTED" && shares.some((share) => share.status === "PAID")
    && shares.some((share) => share.status === "POSTED");
}

/**
 * Whether the run may still be cancelled or voided: before it is paid, and
 * never once any branch's share is paid, since each paid share's money has left
 * that branch's account.
 */
export function mayCancelRun(run: Pick<PayrollRun, "run_status" | "branch_shares">): boolean {
  if (run.run_status !== "DRAFT" && run.run_status !== "POSTED") return false;
  return !sharesOf(run).some((share) => share.status === "PAID");
}

/**
 * The branch a run posted as one journal is paid from, for narrowing its bank
 * picker: the run's own branch, else the one branch all its lines are booked
 * to. Undefined when that is not known (a server whose lines carry no branch),
 * which leaves the picker un-narrowed.
 */
export function singleJournalBranch(run: Pick<PayrollRun, "branch_id" | "lines">): number | undefined {
  if (run.branch_id != null) return run.branch_id;
  const ids = new Set(run.lines.map((line) => line.branch_id));
  if (ids.size !== 1) return undefined;
  const [only] = ids;
  return only ?? undefined;
}

/**
 * The staff a post was refused for, when the server refused it because they
 * have no branch (400 PAYROLL_BRANCH_UNASSIGNED), else null. The message comes
 * too, since it names the run and says what to do.
 */
export function unassignedStaffRefusal(error: unknown): { message: string; employees: string[] } | null {
  const data = (error as { data?: { message?: unknown; error?: { code?: unknown; detail?: unknown } } } | null)?.data;
  if (data?.error?.code !== "PAYROLL_BRANCH_UNASSIGNED") return null;
  const detail = data.error.detail as { employees?: unknown } | undefined;
  const employees = Array.isArray(detail?.employees)
    ? detail.employees.filter((name): name is string => typeof name === "string")
    : [];
  return {
    message: typeof data.message === "string" ? data.message : "Some staff on this payroll run have no branch.",
    employees,
  };
}
