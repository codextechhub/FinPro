/**
 * Where each branch stands, read under All branches.
 *
 * Each branch closes its own months and year, and the school's month reads
 * closed only once every branch has closed it. Under All branches the close
 * workbench shows the school's state, which on its own does not say who is
 * holding a month open. Bright Star's March reads Open because Lekki has not
 * closed it while Ikeja has; these rows say so, branch by branch.
 *
 * The states come with the workbench's own year and period lists
 * (`?include_branches=true` adds `branch_states` to every row), so the rows
 * cost no request of their own whatever the number of branches. Each lists the
 * branches in the reader's reach; a branch that has not closed on its own
 * stands where the school does. The rows appear only at a school with several
 * branches and only under All branches; with one branch picked the workbench
 * already shows that branch's own states.
 */

import { Building2 } from "lucide-react";

import { StatusPill } from "@/components/finance-ui";
import type { BranchCloseState } from "@/redux/services/finance/setup-types";
import { useDates } from "../../../lib/display-prefs";

/** One month, each branch's own state. */
export function BranchMonthStates({ states }: { states: BranchCloseState[] | undefined }) {
  const dates = useDates();
  if (!states || states.length < 2) return null;
  return (
    <section aria-label="Each branch's month" className="rounded-md border border-white-02 bg-white">
      <p className="border-b border-white-02 px-3 py-2 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Each branch</p>
      <ul className="divide-y divide-white-02">
        {states.map((state) => (
          <li key={state.branch} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 font-mont text-sm text-gray-01">
              <Building2 className="size-3.5 shrink-0 text-gray-05" aria-hidden />
              <span className="truncate">{state.branch_name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {state.closed_at && state.status !== "OPEN" ? (
                <span className="font-mont text-[11px] text-gray-05">{dates.day(state.closed_at, state.branch)}</span>
              ) : null}
              <StatusPill status={state.status} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One fiscal year, each branch's own state, as a row of chips. */
export function BranchYearStates({ states }: { states: BranchCloseState[] | undefined }) {
  if (!states || states.length < 2) return null;
  return (
    <div aria-label="Each branch's year" className="flex flex-wrap items-center gap-2">
      <span className="font-mont text-[11px] text-gray-05">Each branch's year:</span>
      {states.map((state) => (
        <span key={state.branch} className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-white-02 bg-white px-2 py-1 font-mont text-xs text-gray-01">
          <span className="truncate">{state.branch_name}</span>
          <StatusPill status={state.status} />
        </span>
      ))}
    </div>
  );
}
