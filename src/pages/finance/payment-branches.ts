/**
 * The Branch column on the payments lists (collections, virtual accounts, held
 * settlements).
 *
 * Every online payment record names the branch its money belongs to: a
 * collection its invoice's branch, a virtual account the branch whose
 * collection account it settles into. At a school with one branch that column
 * would repeat the same name on every row, so it is absent; at a school with
 * several it is shown, the way the audit trail shows it. The payments rows carry
 * only the branch id, so the name comes from the host's branch list.
 *
 * A row with no branch is one raised before payment records carried a branch
 * and still waiting for one, which only a whole-school reader sees: it reads
 * "No branch yet", never "School-wide".
 */

import { useMemo } from "react";

import { useReaderBranchLens } from "@/components/finance-ui/raising-branch";
import { useBranches, type HostBranch } from "../../host";
import { NO_BRANCH_YET } from "../../lib/branch-labels";

/** A branch's name from the host's list; an id the list does not hold reads as a plain number. */
export function branchNameOf(branches: readonly HostBranch[], id: number | null | undefined): string {
  if (id === null || id === undefined) return NO_BRANCH_YET;
  return branches.find((b) => Number(b.id) === Number(id))?.name ?? `Branch ${id}`;
}

export interface PaymentBranchColumn {
  /** The school runs more than one branch, so the column is shown. */
  show: boolean;
  name: (id: number | null | undefined) => string;
}

/** Whether to show the Branch column, and how to name a row's branch. */
export function usePaymentBranchColumn(): PaymentBranchColumn {
  const lens = useReaderBranchLens();
  const { data } = useBranches();
  return useMemo(() => {
    const branches = data?.length ? data : lens.choices;
    return { show: lens.applies, name: (id) => branchNameOf(branches, id) };
  }, [data, lens.applies, lens.choices]);
}
