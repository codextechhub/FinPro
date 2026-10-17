/**
 * The branch and the stretch of time a Procurement document list shows, as one
 * scope the list, its summary figures and its filter bar share.
 *
 * Both picks live in the page address, so the list and the figures above it
 * always answer for the same documents, and a link carries both. See
 * `list-branch` and `list-period` for the rules of each.
 */

import { useMemo, type ReactNode } from "react";

import { ListBranchSelect, procurementBranchArg, useListBranch, type ListBranchView } from "@/components/finance-ui/list-branch";
import { ListPeriodSelect, listPeriodArg, useListPeriod } from "@/components/finance-ui/list-period";
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
  const list = useListBranch();
  const period = useListPeriod();
  const branch = procurementBranchArg(list.view).branch;
  const scope = useMemo(() => ({ branch, ...listPeriodArg(period.view) }), [branch, period.view]);
  const filters = (
    <>
      <ListBranchSelect view={list.view} onChange={(next) => { onChange(); list.choose(next); }} className="w-full sm:w-48" />
      <ListPeriodSelect
        entity={entity}
        view={period.view}
        onYear={(next) => { onChange(); period.chooseYear(next); }}
        onRange={(from, to) => { onChange(); period.chooseRange(from, to); }}
      />
    </>
  );
  return { scope, filters, branchView: list.view };
}
