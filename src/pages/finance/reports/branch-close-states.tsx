/**
 * Where each branch stands, read under All branches.
 *
 * Each branch closes its own months and year, and the school's month reads
 * closed only once every branch has closed it. Under All branches the close
 * workbench shows the school's state, which on its own does not say who is
 * holding a month open. Bright Star's March reads Open because Lekki has not
 * closed it while Ikeja has; these rows say so, branch by branch.
 *
 * Each row reads that branch's own calendar for the year, the same request the
 * workbench makes when the branch is picked, so switching to the branch
 * afterwards is served from the cache. The rows appear only at a school with
 * several branches and only under All branches; with one branch picked the
 * workbench already shows that branch's own states.
 */

import { Building2 } from "lucide-react";

import { StatusPill } from "@/components/finance-ui";
import { useGetFiscalYearPeriodsQuery } from "@/redux/services/finance/setup-api";
import { useGetFiscalYearsQuery } from "@/redux/services/finance/ops-api";
import { toArray } from "@/redux/services/finance/api-types";
import type { CalendarBranchOption } from "./calendar-branch";

type IncludeArchived = { include_archived?: "true" };

function BranchMonthRow({ entity, year, periodId, branch, archived }: {
  entity: string;
  year: number;
  periodId: number;
  branch: CalendarBranchOption;
  archived: IncludeArchived;
}) {
  const { data, isLoading, isError } = useGetFiscalYearPeriodsQuery({ entity, year, branch: branch.id, ...archived });
  const period = (Array.isArray(data?.data) ? data.data : []).find((row) => row.id === periodId);
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 font-mont text-sm text-gray-01">
        <Building2 className="size-3.5 shrink-0 text-gray-05" aria-hidden />
        <span className="truncate">{branch.name}</span>
      </span>
      {isLoading ? (
        <span className="font-mont text-xs text-gray-05">Loading…</span>
      ) : isError || !period ? (
        <span className="font-mont text-xs text-gray-05">Not available</span>
      ) : (
        <StatusPill status={period.status} />
      )}
    </li>
  );
}

/** One month, each branch's own state. */
export function BranchMonthStates({ entity, year, periodId, branches, archived = {} }: {
  entity: string;
  year: number;
  periodId: number;
  branches: CalendarBranchOption[];
  archived?: IncludeArchived;
}) {
  if (branches.length < 2) return null;
  return (
    <section aria-label="Each branch's month" className="rounded-md border border-white-02 bg-white">
      <p className="border-b border-white-02 px-3 py-2 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Each branch</p>
      <ul className="divide-y divide-white-02">
        {branches.map((branch) => (
          <BranchMonthRow key={branch.id} entity={entity} year={year} periodId={periodId} branch={branch} archived={archived} />
        ))}
      </ul>
    </section>
  );
}

function BranchYearChip({ entity, yearId, branch, archived }: {
  entity: string;
  yearId: number;
  branch: CalendarBranchOption;
  archived: IncludeArchived;
}) {
  const { data, isLoading } = useGetFiscalYearsQuery({ entity, branch: branch.id, ...archived });
  const year = toArray(data?.data).find((row) => row.id === yearId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-white-02 bg-white px-2 py-1 font-mont text-xs text-gray-01">
      <span className="truncate">{branch.name}</span>
      {isLoading ? <span className="text-gray-05">…</span> : year ? <StatusPill status={year.status} /> : <span className="text-gray-05">-</span>}
    </span>
  );
}

/** One fiscal year, each branch's own state, as a row of chips. */
export function BranchYearStates({ entity, yearId, branches, archived = {} }: {
  entity: string;
  yearId: number;
  branches: CalendarBranchOption[];
  archived?: IncludeArchived;
}) {
  if (branches.length < 2) return null;
  return (
    <div aria-label="Each branch's year" className="flex flex-wrap items-center gap-2">
      <span className="font-mont text-[11px] text-gray-05">Each branch's year:</span>
      {branches.map((branch) => (
        <BranchYearChip key={branch.id} entity={entity} yearId={yearId} branch={branch} archived={archived} />
      ))}
    </div>
  );
}
