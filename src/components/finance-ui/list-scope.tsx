/**
 * The branch and the stretch of time a document list shows, as one scope that
 * the list, the figures above it, its Export button and its filter bar share.
 *
 * Both picks live in the page address, so the rows, the figures and the file an
 * export produces always answer for the same documents, and a link carries
 * both. Mrs Bello picks Ikeja and FY 2015 on the invoice list: the list shows
 * Ikeja's 2015 invoices, the totals above it count only those, and Export hands
 * her the same invoices in a file. See `list-branch` and `list-period` for the
 * rules of each pick.
 *
 * Finance and Procurement read the same two picks but spell "not yet given a
 * branch" differently (`unassigned` and `none`), so each engine passes its own
 * branch argument builder: `useFinanceListScope` and `useProcurementListScope`
 * are this hook with `listBranchArg` and `procurementBranchArg`.
 *
 * A list whose document date the reader may not read (Field Access hides it)
 * offers no Year picker and sends no period, because a period is a filter on
 * that date and the server refuses it with 403 `field_read_denied`. A year left
 * in the page address is ignored then. The screen says so with
 * `periodReadable: false`, read from the same Field Access hook that removes
 * the date column; a read-only date is still readable. The branch works either
 * way.
 */

import { useMemo, type ReactNode } from "react";

import { ListBranchSelect, useListBranch, type ListBranchView } from "./list-branch";
import { ListPeriodSelect, listPeriodArg, useListPeriod, type ListPeriodView } from "./list-period";

/** The period part of a list's query: a year by its label, or the ends of a range. */
export type ListPeriodArg = ReturnType<typeof listPeriodArg>;

/** How a list's scope is read. */
export interface ListScopeOptions {
  /** The reader may read the list's own document date. Absent is read as true. */
  periodReadable?: boolean;
}

const ALL_YEARS: ListPeriodView = { kind: "all" };

/**
 * The scope as query arguments: the branch only when one is picked, and the
 * period only when one is. Every value is a scalar, so the same object serves
 * an RTK query and an export's `params`.
 */
export function listScopeArg<B extends number | string>(branch: B | undefined, period: ListPeriodView): { branch?: B } & ListPeriodArg {
  return { ...(branch === undefined ? {} : { branch }), ...listPeriodArg(period) };
}

/**
 * The list's scope, and the pickers that change it. `onChange` runs before
 * either pick moves, so a list can go back to its first page.
 */
export function useListScope<B extends number | string>(
  entity: string | null | undefined,
  onChange: () => void,
  branchArg: (view: ListBranchView) => { branch?: B },
  { periodReadable = true }: ListScopeOptions = {},
): {
  scope: { branch?: B } & ListPeriodArg;
  filters: ReactNode;
  branchView: ListBranchView;
} {
  const list = useListBranch();
  const period = useListPeriod();
  const branch = branchArg(list.view).branch;
  const periodView: ListPeriodView = periodReadable ? period.view : ALL_YEARS;
  const scope = useMemo(() => listScopeArg(branch, periodView), [branch, periodView]);
  const filters = (
    <>
      <ListBranchSelect view={list.view} onChange={(next) => { onChange(); list.choose(next); }} className="w-full sm:w-48" />
      {periodReadable ? (
        <ListPeriodSelect
          entity={entity}
          view={period.view}
          onYear={(next) => { onChange(); period.chooseYear(next); }}
          onRange={(from, to) => { onChange(); period.chooseRange(from, to); }}
        />
      ) : null}
    </>
  );
  return { scope, filters, branchView: list.view };
}
