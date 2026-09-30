/**
 * What a transaction with no branch is called where branches are named.
 *
 * Every transaction names a branch, so a blank one is not "School-wide": it is
 * a row raised before transactions carried a branch, still waiting for one.
 * Only a whole-school reader sees such rows, and they are hers to place, so the
 * label says what is missing rather than implying the row belongs to everyone.
 * Shared records and configuration (customers, vendors, fee structures, a
 * budget for the whole school) keep "School-wide", because there a blank branch
 * does mean every branch.
 */
export const NO_BRANCH_YET = "No branch yet";
