import { NO_BRANCH_YET } from "../../../lib/branch-labels";

export function refundAmountIsWithinAvailableCredit(
  amountKobo: number,
  availableKobo: number,
): boolean {
  return amountKobo > 0 && amountKobo <= availableKobo;
}

/**
 * The parts of a refund-availability row that identify it.
 *
 * A row is one customer's credit at one branch, so the customer code alone does not
 * name it: a family holding credit at Ikeja and at Lekki has two rows, and a refund
 * raised from either must pay out that branch's credit and no other.
 */
export interface RefundCreditRow {
  customer_code: string;
  branch_id: number | null;
  branch_name: string | null;
}

/** A stable key for one customer's credit at one branch. */
export function refundCreditKey(row: RefundCreditRow): string {
  return `${row.customer_code}::${row.branch_id ?? "none"}`;
}

/**
 * Whether the rows hold credit at more than one branch, and say which.
 *
 * The branch is named on a row only then: a school with one branch, or a reader
 * whose rows all sit at one, would otherwise see the same name on every line. A
 * server that reports rows per customer rather than per branch sends no
 * `branch_name`, and its rows are not named at all, so a branched customer is
 * never labelled by the unbranched fallback.
 */
export function refundCreditSpansBranches(rows: RefundCreditRow[]): boolean {
  if (rows.some((row) => row.branch_name === undefined)) return false;
  return new Set(rows.map((row) => row.branch_id ?? null)).size > 1;
}

/** The branch a row's credit is held by, for a label. */
export function refundCreditBranchLabel(row: RefundCreditRow): string {
  return row.branch_name ?? NO_BRANCH_YET;
}

/**
 * The `branch` a refund raised from this row sends.
 *
 * A refund pays out only its own branch's credit, so a row's branch is the
 * refund's. Omitted for credit with no branch: at a school with one branch the
 * server files the refund under it; at a school with several, such credit is
 * not yet given a branch and matches no branch's refund until it is.
 */
export function refundRequestBranch(row: RefundCreditRow | null | undefined): number | undefined {
  return row?.branch_id ?? undefined;
}
