/**
 * The branch and the stretch of time a Finance document list shows, as one
 * scope the list, its summary figures, its export and its filter bar share.
 *
 * The shared hook in `finance-ui/list-scope` holds the rule; Finance passes its
 * own branch argument, because its server spells "not yet given a branch" as
 * `unassigned`. In the school app the branch follows the sidebar's switcher and
 * the bar offers only the Year picker; in the console the bar offers both.
 */

import type { ReactNode } from "react";

import { listBranchArg, type ListBranchView } from "@/components/finance-ui/list-branch";
import { useListScope, type ListScopeOptions } from "@/components/finance-ui/list-scope";
import type { FinanceListScope } from "@/redux/services/finance/api-types";

/**
 * The list's scope, and the pickers that change it. `onChange` runs before
 * either pick moves, so a list can go back to its first page. Pass
 * `periodReadable: false` where the reader may not read the list's document
 * date; see `finance-ui/list-scope`.
 */
export function useFinanceListScope(entity: string | null | undefined, onChange: () => void, options?: ListScopeOptions): {
  scope: FinanceListScope;
  filters: ReactNode;
  branchView: ListBranchView;
} {
  return useListScope(entity, onChange, listBranchArg, options);
}
