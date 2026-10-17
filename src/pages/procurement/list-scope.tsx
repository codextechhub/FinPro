/**
 * The branch and the stretch of time a Procurement document list shows, as one
 * scope the list, its summary figures, its export and its filter bar share.
 *
 * The shared hook in `finance-ui/list-scope` holds the rule; Procurement passes
 * its own branch argument, because its server spells "not yet given a branch"
 * as `none`.
 */

import type { ReactNode } from "react";

import { procurementBranchArg, type ListBranchView } from "@/components/finance-ui/list-branch";
import { useListScope } from "@/components/finance-ui/list-scope";
import type { ProcListScope } from "@/redux/services/procurement/procurement-api";

/**
 * The list's scope, and the pickers that change it. `onChange` runs before
 * either pick moves, so a list can go back to its first page.
 */
export function useProcurementListScope(entity: string | null | undefined, onChange: () => void): {
  scope: ProcListScope;
  filters: ReactNode;
  branchView: ListBranchView;
} {
  return useListScope(entity, onChange, procurementBranchArg);
}
