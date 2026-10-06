/**
 * Fiscal-period close workbench. It presents one bounded fiscal year at a time
 * and makes every available close action explicit.
 *
 * The calendar is kept per branch; `calendar-branch.ts` says whose calendar the
 * workbench reads and which branch each action sends.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Lock,
  Plus,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  ConfirmActionModal,
  DetailDrawer,
  FormField,
  FormModal,
  InfoHint,
  RaisingBranchField,
  ReasonField,
  StatCard,
  StatusPill,
  hasReason,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { ShowArchivedToggle, includeArchivedArg, useShowArchived } from "@/components/finance-ui/archived-years";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { checklistLabel, checklistSeverity, closeOutcomeMessage, failedBlockers, forceCanClose } from "./close-checklist";
import { P } from "../../../permissions";
import {
  useCloseFiscalYearMutation,
  useClosePeriodMutation,
  useGetFiscalYearPeriodsQuery,
  useGetPeriodChecklistQuery,
  useLockPeriodMutation,
  useReopenFiscalYearMutation,
  useReopenPeriodMutation,
  useStartFiscalYearMutation,
} from "@/redux/services/finance/setup-api";
import { useGetFiscalYearsQuery } from "@/redux/services/finance/ops-api";
import {
  useArchiveFiscalYearMutation,
  useGetRecordRetentionSettingsQuery,
  useUnarchiveFiscalYearMutation,
} from "@/redux/services/finance/records-api";
import { toArray } from "@/redux/services/finance/api-types";
import type { BranchCloseState, FiscalPeriod, ChecklistItem } from "@/redux/services/finance/setup-types";
import { routesPath } from "@/routes/routes-path";
import {
  archiveReadiness,
  periodActionLabel,
  summarizePeriods,
  yearCloseState,
  type ArchiveReadiness,
  type YearCloseState,
} from "./periods-model";
import { BranchMonthStates, BranchYearStates } from "./branch-close-states";
import {
  actionBranch,
  actionBranchReady,
  calendarBranchFor,
  calendarBranchName,
  useCalendarBranch,
  type CalendarBranch,
} from "./calendar-branch";
import { useWholeSchoolAccess } from "@/components/finance-ui/whole-school-access";
import { useDates } from "../../../lib/display-prefs";
import { isForbidden } from "../../../lib/api-errors";

/**
 * Subtitle for the screen this file renders. Both routes that reach the
 * workbench (finance setup and finance reports) put it under their page title,
 * so it lives with the screen rather than being written out twice.
 */
export const PERIODS_DESCRIPTION = "Review one fiscal year at a time. Restrict each posting window, finish the year-end close, then apply permanent locks.";

const selectCls = "h-9 w-full rounded-md border border-white-02 bg-white px-2 font-mont text-sm text-black-01 focus:border-primary focus:outline-none";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
/** `SOFT_CLOSED` reads "Soft closed": a server code in sentence case. */
const humanize = (value: string) => {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The calendar of a school with one branch: no branch is read, asked or sent. */
const ONE_BRANCH_CALENDAR: CalendarBranch = calendarBranchFor(
  { applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false },
  null,
);

/**
 * " for Ikeja" where the school runs several branches and the branch is known,
 * nothing otherwise, so a title reads the same at a school with one branch.
 */
function forBranch(calendar: CalendarBranch, branch: number | undefined): string {
  return calendar.applies && branch != null ? ` for ${calendarBranchName(calendar, branch)}` : "";
}

/**
 * The branch question inside a confirm dialog, asked only under All branches at
 * a school with several (see `calendar-branch.ts`). It offers the branches the
 * reader may act for and starts on none.
 */
function CalendarBranchQuestion({ calendar, value, onChange, hint }: {
  calendar: CalendarBranch;
  value: string;
  onChange: (branch: string) => void;
  hint: string;
}) {
  if (!calendar.mustAsk) return null;
  return (
    <RaisingBranchField
      raising={{ ask: true, choices: calendar.choices, pinned: null, initial: "", isLoading: calendar.isLoading }}
      value={value}
      onChange={onChange}
      hint={hint}
    />
  );
}

/**
 * A year-end act awaiting its confirm. Closing and re-opening name the branch
 * whose year moves; archiving and unarchiving put the school's whole year away
 * or bring it back, so they name no branch and always ask why.
 */
type YearAction = { kind: "close" | "reopen" | "archive" | "unarchive"; id: number; year: number };

/**
 * Fiscal close workbench for one ledger entity.
 *
 * The calendar controls (branch and fiscal year pickers and the new-year action)
 * read as part of the page heading rather than as the first row of the body, so
 * a host that exposes a `headerSlot` node receives them through a portal and
 * gets them on the title line; a host that does not passes nothing and they
 * render inline above the workbench. The pickers own the selection that drives
 * every query below them, which is why the controls stay part of this component
 * instead of being lifted into the host.
 *
 * Opening a fiscal year changes every branch's calendar, so the server takes it
 * from a whole-school reader only, and "New fiscal year" is offered to nobody
 * else, as "Re-open year" is not.
 */
export function PeriodsTab({ entity, headerSlot }: {
  entity: string;
  headerSlot?: HTMLElement | null;
}) {
  const calendar = useCalendarBranch();
  const { canWholeSchool } = useWholeSchoolAccess();
  const { can } = useCan();
  const dates = useDates();
  const [showArchived] = useShowArchived();
  const archivedArg = includeArchivedArg(showArchived);
  const readArg = calendar.readBranch != null ? { branch: calendar.readBranch } : {};
  // Under All branches at a school with several, each row brings every branch's own state.
  const eachBranch = calendar.applies && calendar.selected === "all";
  const branchesArg = eachBranch ? { include_branches: "true" as const } : {};
  const {
    data: fiscalYearData,
    isLoading: fiscalYearsLoading,
    isError: fiscalYearsFailed,
    error: fiscalYearsError,
    refetch: refetchFiscalYears,
  } = useGetFiscalYearsQuery({ entity, ...readArg, ...archivedArg, ...branchesArg }, { skip: calendar.isLoading });
  const fiscalYears = useMemo(
    () => [...toArray(fiscalYearData?.data)].sort((a, b) => b.year - a.year),
    [fiscalYearData],
  );
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const activeFiscalYear = fiscalYears.find((year) => year.year === chosenYear) ?? fiscalYears[0] ?? null;
  const activeYear = activeFiscalYear?.year ?? null;
  const {
    data: periodData,
    isLoading: periodsLoading,
    isFetching: periodsFetching,
    isError: periodsFailed,
    error: periodsError,
    refetch: refetchPeriods,
  } = useGetFiscalYearPeriodsQuery(activeYear && !calendar.isLoading ? { entity, year: activeYear, ...readArg, ...archivedArg, ...branchesArg } : skipToken);
  const periods = useMemo(
    () => [...(Array.isArray(periodData?.data) ? periodData.data : [])]
      .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [periodData],
  );
  const summary = useMemo(() => summarizePeriods(periods), [periods]);
  const closeState = yearCloseState(activeFiscalYear?.status ?? "OPEN", periods);
  const finalPeriod = periods.at(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [yearAction, setYearAction] = useState<YearAction | null>(null);
  const [yearBranch, setYearBranch] = useState("");
  const [yearReason, setYearReason] = useState("");
  const [closeYear, { isLoading: closingYear }] = useCloseFiscalYearMutation();
  const [reopenYear, { isLoading: reopeningYear }] = useReopenFiscalYearMutation();
  const [archiveYear, { isLoading: archivingYear }] = useArchiveFiscalYearMutation();
  const [unarchiveYear, { isLoading: unarchivingYear }] = useUnarchiveFiscalYearMutation();
  const yearBusy = closingYear || reopeningYear || archivingYear || unarchivingYear;

  // Archiving binds every branch, so it is offered on the school's own state
  // only: to a whole-school holder of the key, under All branches or at a
  // school with one branch. The minimum age comes from the record-keeping
  // settings when the reader may read them; otherwise the server judges it.
  const mayArchive = canWholeSchool(P.FIN_ARCHIVE_FISCAL_YEAR) && calendar.readBranch == null;
  const retentionQ = useGetRecordRetentionSettingsQuery(
    { entity },
    { skip: !mayArchive || !can(P.FIN_VIEW_SETTINGS) },
  );
  const minAgeYears = retentionQ.data?.data?.archive_min_age_years ?? null;

  const latestFiscalYear = fiscalYears[0] ?? null;
  const latestStart = latestFiscalYear?.start_date
    ? new Date(`${latestFiscalYear.start_date}T00:00:00`)
    : null;
  const startDefaults = {
    year: (latestFiscalYear?.year ?? new Date().getFullYear() - 1) + 1,
    month: latestStart ? latestStart.getMonth() + 1 : 1,
    day: latestStart ? latestStart.getDate() : 1,
    frequency: activeYear === latestFiscalYear?.year && periods.length === 4
      ? "QUARTERLY" as const
      : "MONTHLY" as const,
  };
  const selectedPeriod = periods.find((period) => period.id === selected);
  const finalPeriodOfOpenYear = !!selectedPeriod
    && selectedPeriod.id === finalPeriod?.id
    && activeFiscalYear?.status === "OPEN";
  const yearShut = activeFiscalYear?.status === "CLOSED" || activeFiscalYear?.status === "LOCKED"
    ? { year: activeFiscalYear.year, status: activeFiscalYear.status }
    : null;

  const chooseYear = (year: number) => {
    setChosenYear(year);
    setSelected(null);
  };
  const chooseBranch = (value: string) => {
    calendar.choose(value === "all" ? "all" : Number(value));
    setSelected(null);
  };
  const openYearAction = (next: YearAction | null) => {
    setYearAction(next);
    setYearBranch("");
    setYearReason("");
  };
  const yearTarget = actionBranch(calendar, yearBranch);
  const yearScope = forBranch(calendar, yearTarget);
  const doYearAction = async () => {
    if (!yearAction) return;
    const branchArg = yearTarget != null ? { branch: yearTarget } : {};
    try {
      if (yearAction.kind === "archive" || yearAction.kind === "unarchive") {
        const act = yearAction.kind === "archive" ? archiveYear : unarchiveYear;
        const response = await act({ id: yearAction.id, entity, reason: yearReason.trim() }).unwrap();
        toast.success(response.message || `Fiscal year ${yearAction.year} ${yearAction.kind}d.`);
      } else if (yearAction.kind === "close") {
        const response = await closeYear({ id: yearAction.id, entity, ...branchArg }).unwrap();
        const netIncome = response.data?.net_income?.naira;
        toast.success(
          `${response.message || `Fiscal year ${yearAction.year} closed.`}`
          + `${netIncome ? ` · Net ${netIncome} → Retained Earnings` : ""}`,
        );
      } else {
        const response = await reopenYear({ id: yearAction.id, entity, ...branchArg, reason: yearReason.trim() }).unwrap();
        toast.success(response.message || `Fiscal year ${yearAction.year} re-opened.`);
      }
      openYearAction(null);
    } catch { /* central */ }
  };

  if (calendar.isLoading || fiscalYearsLoading) return <LoadingState rows={6} label="Loading fiscal years…" />;
  if (fiscalYearsFailed) {
    return isForbidden(fiscalYearsError)
      ? <ForbiddenState message="You do not have permission to view fiscal periods." />
      : <ErrorState onRetry={refetchFiscalYears} />;
  }

  const calendarControls = (
    <div data-guide="finance-periods.calendar-controls" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      {calendar.canChoose ? (
        <label className="w-full min-w-0 sm:w-56 sm:flex-none">
          <span className="sr-only">Branch</span>
          <select
            aria-label="Branch"
            value={String(calendar.selected)}
            onChange={(event) => chooseBranch(event.target.value)}
            disabled={periodsFetching}
            className={selectCls}
          >
            <option value="all">All branches</option>
            {calendar.choices.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
      ) : calendar.applies && calendar.readBranch != null ? (
        <span className="flex h-9 w-full min-w-0 items-center gap-1.5 rounded-md sm:w-auto sm:max-w-56 border border-white-02 bg-white px-2.5 font-mont text-sm text-black-01">
          <Building2 className="size-3.5 shrink-0 text-gray-05" />
          <span className="truncate">{calendarBranchName(calendar, calendar.readBranch)}</span>
        </span>
      ) : null}
      {fiscalYears.length > 0 ? (
        <label className="min-w-0 flex-1 sm:w-40 sm:flex-none">
          <span className="sr-only">Fiscal year</span>
          <select
            value={activeYear ?? ""}
            onChange={(event) => chooseYear(Number(event.target.value))}
            disabled={periodsFetching}
            className={selectCls}
          >
            {fiscalYears.map((year) => (
              <option key={year.id} value={year.year}>FY {year.year} · {humanize(year.status)}{year.is_archived ? " · Archived" : ""}</option>
            ))}
          </select>
        </label>
      ) : null}
      <ShowArchivedToggle entity={entity} className="h-9" />
      {canWholeSchool(P.FIN_CREATE_PERIOD) ? (
        <Button onClick={() => setCreating(true)} className="h-9 flex-1 gap-1.5 font-mont text-xs font-semibold sm:flex-none">
          <Plus className="size-3.5" /> New fiscal year
        </Button>
      ) : null}
    </div>
  );

  const yearCopy = yearAction?.kind === "archive"
    ? {
      title: `Archive fiscal year ${yearAction.year}?`,
      description: `FY ${yearAction.year} leaves the year pickers, the period pickers and the document lists for every branch. Nothing is deleted: tick "Show archived years" to read and report on it again. Bills still unpaid stay in the lists.`,
      text: "Archive year",
    }
    : yearAction?.kind === "unarchive"
      ? {
        title: `Unarchive fiscal year ${yearAction.year}?`,
        description: `FY ${yearAction.year} comes back into the pickers and lists for every branch. It stays closed: re-open it afterwards if a month needs correcting.`,
        text: "Unarchive year",
      }
      : yearAction?.kind === "reopen"
    ? {
      title: `Re-open fiscal year ${yearAction.year}${yearScope}?`,
      description: calendar.applies
        ? `Reverses ${yearTarget != null ? `${calendarBranchName(calendar, yearTarget)}'s` : "the branch's"} year-end closing entry so a month can be corrected, and the year must be closed again for that branch afterwards.`
        : "Reverses the year-end closing entry so a month can be corrected, and the year must be closed again afterwards.",
      text: "Re-open fiscal year",
    }
    : {
      title: `Close fiscal year ${yearAction?.year ?? ""}${yearScope}?`,
      description: calendar.applies
        ? `Posts the branch's year-end journal, clears its income and expense balances into Retained Earnings, and seals FY ${yearAction?.year ?? ""} for that branch. The school's year closes once every branch has closed its year. Period locks remain unchanged.`
        : `Posts the formal year-end journal, clears income and expense balances into Retained Earnings, and seals FY ${yearAction?.year ?? ""}. Period locks remain unchanged.`,
      text: "Close fiscal year",
    };

  const yearActionWhole = yearAction?.kind === "archive" || yearAction?.kind === "unarchive";
  const archive: ArchiveReadiness | null = activeFiscalYear && mayArchive
    ? archiveReadiness(activeFiscalYear, minAgeYears, dates.today())
    : null;

  return (
    <div data-guide="finance-periods.workbench" className="min-w-0 space-y-5">
      {headerSlot ? createPortal(calendarControls, headerSlot) : calendarControls}

      {fiscalYears.length === 0 ? (
        <div className="rounded-md border border-white-02 bg-white">
          <EmptyState title="No fiscal calendar" message="Create the first fiscal year to open its monthly or quarterly posting periods." />
        </div>
      ) : periodsLoading ? (
        <LoadingState rows={6} label={`Loading FY ${activeYear}…`} />
      ) : periodsFailed ? (
        isForbidden(periodsError)
          ? <ForbiddenState message="You do not have permission to read this fiscal calendar." />
          : <ErrorState onRetry={refetchPeriods} />
      ) : periods.length === 0 || !activeFiscalYear ? (
        <div className="rounded-md border border-amber-200 bg-amber-50">
          <EmptyState title={`FY ${activeYear} has no periods`} message="This fiscal year is incomplete. Create a valid calendar or ask an administrator to repair it before posting." />
        </div>
      ) : (
        <>
          <FiscalYearOverview
            fiscalYear={activeFiscalYear}
            periods={periods}
            summary={summary}
            branchName={calendar.applies && calendar.readBranch != null ? calendarBranchName(calendar, calendar.readBranch) : null}
          />

          {calendar.applies && calendar.selected === "all" ? (
            <div role="note" className="flex min-w-0 items-start gap-2.5 rounded-md bg-primary/5 px-3 py-2.5 ring-1 ring-primary/15">
              <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="min-w-0 font-mont text-xs leading-5 text-gray-01 text-pretty">
                <span className="font-semibold">The school's calendar.</span> Each branch closes its own months and year.
                A month here reads closed once every branch has closed it, and the year once every branch has closed
                its year. Choose a branch to see where it stands; each action here asks which branch it is for.
              </p>
            </div>
          ) : null}

          <YearCloseReadiness
            state={closeState}
            status={activeFiscalYear.status}
            year={activeFiscalYear.year}
            fiscalYearId={activeFiscalYear.id}
            openCount={summary.open}
            mayReopenYear={canWholeSchool(P.FIN_REOPEN_FISCAL_YEAR)}
            isArchived={!!activeFiscalYear.is_archived}
            archive={archive}
            branchName={calendar.applies && calendar.readBranch != null ? calendarBranchName(calendar, calendar.readBranch) : null}
            onCloseYear={() => openYearAction({ kind: "close", id: activeFiscalYear.id, year: activeFiscalYear.year })}
            onReopenYear={() => openYearAction({ kind: "reopen", id: activeFiscalYear.id, year: activeFiscalYear.year })}
            onArchiveYear={() => openYearAction({ kind: "archive", id: activeFiscalYear.id, year: activeFiscalYear.year })}
            onUnarchiveYear={() => openYearAction({ kind: "unarchive", id: activeFiscalYear.id, year: activeFiscalYear.year })}
          />

          {eachBranch ? <BranchYearStates states={activeFiscalYear.branch_states} /> : null}

          <section data-guide="finance-periods.periods">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-mont text-sm font-semibold text-gray-01">Posting periods</h2>
                <p className="mt-0.5 font-mont text-xs text-gray-05">Select a period to inspect its close checklist and available actions.</p>
              </div>
              <p className="font-mont text-[11px] text-gray-05">{summary.total === 4 ? "Quarterly" : summary.total === 12 ? "Monthly" : "Custom"} calendar · {summary.total} periods</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {periods.map((period) => (
                <PeriodCard
                  key={period.id}
                  period={period}
                  selected={selected === period.id}
                  onClick={() => setSelected(period.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <PeriodCloseDrawer
        id={selected}
        entity={entity}
        finalPeriodOfOpenYear={finalPeriodOfOpenYear}
        yearShut={yearShut}
        calendar={calendar}
        status={selectedPeriod?.status}
        branchStates={selectedPeriod?.branch_states}
        onClose={() => setSelected(null)}
      />

      {creating ? (
        <StartFiscalYearModal
          open
          entity={entity}
          defaults={startDefaults}
          onClose={() => setCreating(false)}
        />
      ) : null}

      <ConfirmActionModal
        open={yearAction != null}
        onOpenChange={(open) => !open && openYearAction(null)}
        title={yearCopy.title}
        description={yearCopy.description}
        confirmText={yearCopy.text}
        destructive={yearAction?.kind === "close" || yearAction?.kind === "archive"}
        loading={yearBusy}
        confirmDisabled={yearActionWhole
          ? !hasReason(yearReason)
          : !actionBranchReady(calendar, yearBranch) || (yearAction?.kind === "reopen" && !hasReason(yearReason))}
        onConfirm={doYearAction}
      >
        {yearActionWhole ? (
          <ReasonField
            value={yearReason}
            onChange={setYearReason}
            disabled={yearBusy}
            placeholder={yearAction?.kind === "archive"
              ? "For example: FY 2027 is finished and audited; it no longer needs to sit in the lists"
              : "For example: the tax office is reviewing FY 2027"}
            hint="Kept on the audit trail with your name."
          />
        ) : calendar.mustAsk || yearAction?.kind === "reopen" ? (
          <div className="space-y-4">
            <CalendarBranchQuestion
              calendar={calendar}
              value={yearBranch}
              onChange={setYearBranch}
              hint={yearAction?.kind === "reopen"
                ? "Only this branch's year re-opens. The school's year re-opens with it."
                : "Only this branch's year closes. The school's year closes once every branch has closed its year."}
            />
            {yearAction?.kind === "reopen" ? (
              <ReasonField
                value={yearReason}
                onChange={setYearReason}
                disabled={yearBusy}
                placeholder="For example: a supplier bill dated in June arrived after the year was closed"
                hint="Kept on the audit trail with your name."
              />
            ) : null}
          </div>
        ) : null}
      </ConfirmActionModal>
    </div>
  );
}

function FiscalYearOverview({
  fiscalYear,
  periods,
  summary,
  branchName,
}: {
  fiscalYear: { year: number; start_date: string; end_date: string; status: string };
  periods: FiscalPeriod[];
  summary: ReturnType<typeof summarizePeriods>;
  /** The branch whose calendar this is, at a school with several; null for the school's own. */
  branchName: string | null;
}) {
  const dates = useDates();
  const progress = summary.total ? Math.round((summary.progressed / summary.total) * 100) : 0;
  return (
    <section className="rounded-lg border border-white-02 bg-[#F7F8FA] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mont text-lg font-semibold text-black-01">Fiscal year {fiscalYear.year}{branchName ? ` · ${branchName}` : ""}</h2>
            <StatusPill status={fiscalYear.status} />
          </div>
          <p className="mt-1 font-mont text-xs text-gray-05">
            {dates.day(fiscalYear.start_date)} - {dates.day(fiscalYear.end_date)} · {periods.length === 4 ? "Quarterly" : periods.length === 12 ? "Monthly" : "Custom"}
          </p>
        </div>
        <div className="w-full sm:w-52">
          <div className="flex items-center justify-between font-mont text-[11px] text-gray-05">
            <span>Close progress</span>
            <span className="font-semibold tabular-nums text-gray-01">{summary.progressed} / {summary.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-03/60">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={String(summary.open)} sub="Ordinary posting allowed" icon={Circle} tone="primary" />
        <StatCard label="Soft-closed" value={String(summary.softClosed)} sub="Close entries only" icon={Clock3} tone="amber" />
        <StatCard label="Closed" value={String(summary.closed)} sub="Re-openable by permission" icon={ShieldCheck} tone="green" />
        <StatCard label="Locked" value={String(summary.locked)} sub="Permanent seal" icon={Lock} tone="gray" />
      </div>
    </section>
  );
}

/**
 * Where the year stands and its year-end action.
 *
 * An open year offers Close fiscal year once every month is restricted. A
 * CLOSED year offers Re-open fiscal year to a holder of its own key who also
 * covers the whole school (`mayReopenYear`, from `useWholeSchoolAccess`): re-opening a year moves a whole
 * year's result out of Retained Earnings, so the server keeps it for a
 * school-wide administrator and refuses a branch's own bursar with a 403. A
 * reader pinned to the only branch of a one-branch school counts as
 * school-wide, as the server counts them. A LOCKED year offers nothing,
 * because it cannot be re-opened. `status` is the year as
 * the workbench reads it: one branch's year when a branch is chosen, the
 * school's under All branches.
 *
 * A closed year a school no longer works in can be archived (`archive`, null
 * when the reader may not archive). An archived year must be unarchived before
 * it can be re-opened, so its Re-open is disabled with that said beside it,
 * and Unarchive is offered in its place.
 */
function YearCloseReadiness({
  state,
  status,
  year,
  fiscalYearId,
  openCount,
  mayReopenYear,
  isArchived,
  archive,
  branchName,
  onCloseYear,
  onReopenYear,
  onArchiveYear,
  onUnarchiveYear,
}: {
  state: YearCloseState;
  status: string;
  year: number;
  fiscalYearId: number;
  openCount: number;
  mayReopenYear: boolean;
  isArchived: boolean;
  archive: ArchiveReadiness | null;
  branchName: string | null;
  onCloseYear: () => void;
  onReopenYear: () => void;
  onArchiveYear: () => void;
  onUnarchiveYear: () => void;
}) {
  const dates = useDates();
  if (state === "SEALED") {
    const archiveNote = archive?.kind === "too-recent"
      ? `FY ${year} can be archived from ${dates.day(archive.from)}.`
      : null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-01/25 bg-green-01/5 p-4">
        {isArchived
          ? <Archive className="size-5 shrink-0 text-gray-05" />
          : <CheckCircle2 className="size-5 shrink-0 text-green-01" />}
        <div className="min-w-0 flex-1">
          <p className="font-mont text-sm font-semibold text-gray-01">
            Fiscal year {year} is {isArchived ? "archived" : "sealed"}{branchName ? ` for ${branchName}` : ""}
          </p>
          <p className="mt-0.5 font-mont text-xs text-gray-05">
            {isArchived
              ? "It is left out of pickers and lists until \"Show archived years\" is ticked. Unarchive it before re-opening it."
              : status === "LOCKED"
                ? "The year is locked and cannot be re-opened."
                : "The year-end journal has been posted. Individual closed periods may now be locked when required."}
          </p>
          {archiveNote ? <p className="mt-0.5 font-mont text-xs text-gray-05">{archiveNote}</p> : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {status === "CLOSED" && mayReopenYear ? (
            <Button
              variant="outline"
              onClick={onReopenYear}
              disabled={!fiscalYearId || isArchived}
              title={isArchived ? `Unarchive FY ${year} before re-opening it.` : undefined}
              className="w-full sm:w-auto"
            >Re-open year</Button>
          ) : null}
          {archive?.kind === "archived" ? (
            <Button variant="outline" onClick={onUnarchiveYear} className="w-full gap-1.5 sm:w-auto">
              <ArchiveRestore className="size-4" /> Unarchive year
            </Button>
          ) : archive ? (
            <Button
              variant="outline"
              onClick={onArchiveYear}
              disabled={archive.kind !== "ready"}
              title={archiveNote ?? undefined}
              className="w-full gap-1.5 sm:w-auto"
            >
              <Archive className="size-4" /> Archive year
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const blocked = state === "OPEN_PERIODS" || state === "FINAL_LOCKED" || state === "EMPTY";
  const title = state === "OPEN_PERIODS"
    ? `${openCount} ${openCount === 1 ? "period is" : "periods are"} still open`
    : state === "FINAL_LOCKED"
      ? "The final period is already locked"
      : state === "EMPTY"
        ? "This fiscal calendar is incomplete"
        : "Ready for year-end close";
  const description = state === "OPEN_PERIODS"
    ? "Soft-close or close every open period before posting the formal year-end journal."
    : state === "FINAL_LOCKED"
      ? "A locked final period cannot accept the year-end journal. An administrator must repair this historical state."
      : state === "EMPTY"
        ? "A fiscal year without posting periods cannot be closed."
        : "All posting windows are restricted. Closing the year will move the net result into Retained Earnings.";

  return (
    <div className={cn(
      "flex flex-wrap items-center gap-3 rounded-lg border p-4",
      blocked ? "border-amber-200 bg-amber-50" : "border-green-01/25 bg-green-01/5",
    )}>
      {blocked
        ? <TriangleAlert className="size-5 shrink-0 text-amber-700" />
        : <CheckCircle2 className="size-5 shrink-0 text-green-01" />}
      <div className="min-w-0 flex-1">
        <p className="font-mont text-sm font-semibold text-gray-01">{title}</p>
        <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">{description}</p>
      </div>
      <Can permission={P.FIN_CLOSE_PERIOD}>
        <Button
          onClick={onCloseYear}
          disabled={blocked || !fiscalYearId}
          className="w-full sm:w-auto"
        >Close fiscal year</Button>
      </Can>
    </div>
  );
}

/** The sealed-figures check, when it says something moved: the verify screen explains what. */
function sealsLink(item: ChecklistItem): boolean {
  return item.name === "sealed_figures_unchanged" && !item.passed;
}

function PeriodCard({ period, selected, onClick }: { period: FiscalPeriod; selected: boolean; onClick: () => void }) {
  const dates = useDates();
  const tone = period.status === "OPEN"
    ? "bg-primary"
    : period.status === "SOFT_CLOSED"
      ? "bg-amber-500"
      : period.status === "CLOSED"
        ? "bg-green-01"
        : "bg-gray-04";
  return (
    <button
      type="button"
      data-guide="finance-periods.period"
      onClick={onClick}
      aria-label={`${periodActionLabel(period.status)} for ${period.name}`}
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-lg border bg-white p-4 text-left transition-all",
        selected ? "border-primary ring-2 ring-primary/10" : "border-white-02 hover:border-primary/50 hover:shadow-sm",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", tone)} />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <p className="font-mont text-[10px] font-semibold uppercase tracking-wide text-gray-05">Period {String(period.period_no).padStart(2, "0")}</p>
          <p className="mt-1 truncate font-mont text-sm font-semibold text-gray-01">{period.name}</p>
        </div>
        <StatusPill status={period.status} />
      </div>
      <p className="mt-4 pl-1 font-mont text-xs text-gray-05 tabular-nums">
        {dates.day(period.start_date)} - {dates.day(period.end_date)}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-white-02 pt-3 pl-1">
        <span className="font-mont text-xs font-semibold text-primary">{periodActionLabel(period.status)}</span>
        <ArrowRight className="size-3.5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

function StartFiscalYearModal({
  open,
  entity,
  defaults,
  onClose,
}: {
  open: boolean;
  entity: string;
  defaults: { year: number; month: number; day: number; frequency: "MONTHLY" | "QUARTERLY" };
  onClose: () => void;
}) {
  const [year, setYear] = useState(defaults.year);
  const [month, setMonth] = useState(defaults.month);
  const [day, setDay] = useState(defaults.day);
  const [frequency, setFrequency] = useState<"MONTHLY" | "QUARTERLY">(defaults.frequency);
  const [start, { isLoading }] = useStartFiscalYearMutation();

  const submit = async () => {
    try {
      const response = await start({
        entity,
        year,
        start_month: month,
        fiscal_start_day: day,
        frequency,
      }).unwrap();
      toast.success(response.message || `Fiscal year ${year} created.`);
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="New fiscal year"
      description="Creates one complete fiscal calendar for this entity. It does not change previous years or their period statuses."
      submitText="Create fiscal calendar"
      loading={isLoading}
      canSubmit={year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= 31}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Fiscal year label" required>
          <Input type="number" min={1900} max={2200} value={year} onChange={(event) => setYear(Number(event.target.value))} className="bg-white" />
        </FormField>
        <FormField label="Period frequency" required>
          <select value={frequency} onChange={(event) => setFrequency(event.target.value as "MONTHLY" | "QUARTERLY")} className={selectCls}>
            <option value="MONTHLY">Monthly · 12 periods</option>
            <option value="QUARTERLY">Quarterly · 4 periods</option>
          </select>
        </FormField>
        <FormField label="Starting month" required>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className={selectCls}>
            {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
        </FormField>
        <FormField label="Starting day" required>
          <Input type="number" min={1} max={31} value={day} onChange={(event) => setDay(Number(event.target.value))} className="bg-white" />
        </FormField>
      </div>
      <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="font-mont text-xs leading-5 text-gray-05">
            FY {year || "-"} will begin on {MONTHS[month - 1] ?? "-"} {day || "-"} and create {frequency === "MONTHLY" ? "12 monthly" : "4 quarterly"} open posting periods. Short months use their final calendar day.
          </p>
        </div>
      </div>
    </FormModal>
  );
}

type PeriodAction = "soft-close" | "close" | "force" | "reopen" | "lock";

const F = routesPath.PROTECTED.FINANCE;

/**
 * One period's checklist and its lifecycle actions.
 *
 * Re-opening a month undoes a control, so it asks for a reason the backend
 * stores on the audit row, and its confirm stays disabled until one is typed.
 * A month of a CLOSED or LOCKED fiscal year cannot be re-opened at all: the
 * year's result already sits in Retained Earnings, so the year is reopened
 * first. `yearShut` names that year, and Re-open is then disabled with the
 * reason beside it rather than offered and refused.
 *
 * `calendar` says whose month this is (see `calendar-branch.ts`): with a branch
 * chosen, the checklist runs against that branch and every action sends it;
 * under All branches each action asks which branch in its confirm dialog. The
 * checklist reports the school's status for the month, so a branch's own
 * status arrives as `status`, read from the branch's period list. Under All
 * branches at a school with several, the drawer also lists each branch's own
 * state for the month, so a month held open by one branch says which.
 *
 * Forcing a close: when a check that blocks the close fails, a holder of
 * `finance.period.force_close` may close the month anyway. It is its own act,
 * with its own key and a required reason, and the server keeps the reason and
 * the overridden checks on the audit trail. Without the key no force is
 * offered.
 */
export function PeriodCloseDrawer({
  id,
  entity,
  finalPeriodOfOpenYear,
  yearShut = null,
  calendar = ONE_BRANCH_CALENDAR,
  status: listedStatus,
  branchStates,
  onClose,
}: {
  id: number | null;
  entity: string;
  finalPeriodOfOpenYear: boolean;
  yearShut?: { year: number; status: string } | null;
  calendar?: CalendarBranch;
  status?: FiscalPeriod["status"];
  /** Each branch's own state in the month, from the period list, under All branches. */
  branchStates?: BranchCloseState[];
  onClose: () => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const { canWholeSchool } = useWholeSchoolAccess();
  const { data, isLoading, isError, error, refetch } = useGetPeriodChecklistQuery(
    id ? { id, entity, ...(calendar.readBranch != null ? { branch: calendar.readBranch } : {}) } : skipToken,
  );
  const [close, { isLoading: closing }] = useClosePeriodMutation();
  const [reopen, { isLoading: reopening }] = useReopenPeriodMutation();
  const [lock, { isLoading: locking }] = useLockPeriodMutation();
  const detail = data?.data;
  const period = detail?.period;
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const [action, setAction] = useState<PeriodAction | null>(null);
  const [reason, setReason] = useState("");
  const [branchChoice, setBranchChoice] = useState("");
  const busy = closing || reopening || locking;
  const status = period ? (listedStatus ?? period.status) : undefined;
  const canClose = status === "OPEN" || status === "SOFT_CLOSED";
  const canReopen = status === "CLOSED" || status === "SOFT_CLOSED";
  const canLock = status === "CLOSED";
  const target = actionBranch(calendar, branchChoice);
  const branchArg = target != null ? { branch: target } : {};
  const scope = forBranch(calendar, target);

  const chooseAction = (next: PeriodAction | null) => {
    setAction(next);
    setReason("");
    setBranchChoice("");
  };
  const closeDrawer = () => {
    chooseAction(null);
    onClose();
  };
  const doClose = async (soft: boolean, forced = false) => {
    try {
      const override = forced ? { force: true as const, reason: reason.trim() } : {};
      const response = await close({ id: id!, entity, soft, ...branchArg, ...override }).unwrap();
      toast.success(closeOutcomeMessage(period?.name, response.data?.checklist?.items));
      closeDrawer();
    } catch { /* central */ }
  };
  const doReopen = async () => {
    try {
      const response = await reopen({ id: id!, entity, ...branchArg, reason: reason.trim() }).unwrap();
      toast.success(response.message || `Re-opened ${period?.name}.`);
      closeDrawer();
    } catch { /* central */ }
  };
  const doLock = async () => {
    try {
      const response = await lock({ id: id!, entity, ...branchArg }).unwrap();
      toast.success(response.message || `Locked ${period?.name}.`);
      closeDrawer();
    } catch { /* central */ }
  };
  const confirm = () => {
    if (action === "soft-close") void doClose(true);
    else if (action === "close") void doClose(false);
    else if (action === "force") void doClose(false, true);
    else if (action === "reopen") void doReopen();
    else if (action === "lock") void doLock();
  };
  const several = calendar.applies;
  const blockers = failedBlockers(items);
  const forceable = forceCanClose(items);
  const confirmCopy: Record<PeriodAction, { title: string; description: string; text: string; destructive?: boolean; branchHint: string }> = {
    "soft-close": {
      title: `Soft-close ${period?.name ?? "period"}${scope}?`,
      description: "Blocks ordinary postings while still allowing controlled close-process entries. Authorised users can re-open it later.",
      text: "Soft-close period",
      branchHint: "Only this branch's month is soft-closed.",
    },
    close: {
      title: `Run close for ${period?.name ?? "period"}${scope}?`,
      description: "Runs the close steps and blocks further postings. The period remains re-openable until it is permanently locked."
        + (several ? " The school's month closes once every branch has closed it." : ""),
      text: "Run period close",
      branchHint: "The close steps run against this branch's entries.",
    },
    force: {
      title: `Force close ${period?.name ?? "period"}${scope}?`,
      description: `Closes the month although ${blockers.length === 1 ? "one check that blocks the close fails" : `${blockers.length} checks that block the close fail`}. `
        + "The checks you override and your reason are kept on the audit trail with your name."
        + (several ? " The school's month closes once every branch has closed it." : ""),
      text: "Force close",
      destructive: true,
      branchHint: "Only this branch's month is closed.",
    },
    reopen: {
      title: `Re-open ${period?.name ?? "period"}${scope}?`,
      description: "Allows ordinary journals and source documents to post into this period again. The re-open and your reason are recorded in the audit trail."
        + (several ? " The school's month re-opens with it." : ""),
      text: "Re-open period",
      branchHint: "Only this branch's month re-opens.",
    },
    lock: {
      title: `Permanently lock ${period?.name ?? "period"}${scope}?`,
      description: "This cannot be reversed. Any correction must be posted in a later open period."
        + (several ? " The school's month locks once every branch has locked it." : ""),
      text: "Lock period",
      destructive: true,
      branchHint: "Only this branch's month is locked.",
    },
  };
  const activeCopy = action ? confirmCopy[action] : null;

  return (
    <>
      <DetailDrawer
        open={id != null}
        onOpenChange={(open) => !open && closeDrawer()}
        title={period ? `Manage ${period.name}` : "Period close"}
        description={period
          ? `Period ${period.period_no} · ${dates.day(period.start_date)} - ${dates.day(period.end_date)}`
            + (several && calendar.readBranch != null ? ` · ${calendarBranchName(calendar, calendar.readBranch)}` : "")
          : undefined}
        widthClass="w-full sm:max-w-2xl"
        footer={(canClose || canReopen || canLock) ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {canReopen ? (
              <Can permission={P.FIN_REOPEN_PERIOD}>
                <Button
                  variant="outline"
                  onClick={() => chooseAction("reopen")}
                  disabled={busy || !!yearShut}
                  title={yearShut ? `Reopen FY ${yearShut.year} before re-opening one of its months.` : undefined}
                  className="w-full sm:w-auto"
                >Re-open</Button>
              </Can>
            ) : null}
            {canLock ? (
              <Can permission={P.FIN_LOCK_PERIOD}>
                <Button
                  variant="outline"
                  onClick={() => chooseAction("lock")}
                  disabled={busy || finalPeriodOfOpenYear}
                  title={finalPeriodOfOpenYear ? "Close the fiscal year before locking its final period." : undefined}
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/5 sm:w-auto"
                >Lock period</Button>
              </Can>
            ) : null}
            {canClose && forceable ? (
              <Can permission={P.FIN_FORCE_CLOSE_PERIOD}>
                <Button
                  variant="outline"
                  onClick={() => chooseAction("force")}
                  disabled={busy}
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/5 sm:w-auto"
                >Force close</Button>
              </Can>
            ) : null}
            {canClose ? (
              <Can permission={P.FIN_CLOSE_PERIOD}>
                {status === "OPEN" ? (
                  <Button variant="outline" onClick={() => chooseAction("soft-close")} disabled={busy} className="w-full sm:w-auto">Soft close</Button>
                ) : null}
                <Button onClick={() => chooseAction("close")} disabled={busy} className="w-full sm:w-auto">Run close steps</Button>
              </Can>
            ) : null}
          </div>
        ) : null}
      >
        {isLoading ? (
          <LoadingState rows={5} />
        ) : isError || !detail || !period ? (
          isForbidden(error)
            ? <ForbiddenState message="You do not have permission to inspect this period." />
            : <ErrorState onRetry={refetch} />
        ) : (
          <div data-guide="finance-periods.checklist" className="space-y-5">
            <div className="rounded-lg border border-white-02 bg-[#F7F8FA] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 font-mont text-sm">
                <span className="flex items-center gap-2 text-gray-05">Current status <StatusPill status={status ?? period.status} /></span>
                <span className="text-gray-05">Checklist <span className="font-semibold tabular-nums text-black-01">{detail.done} / {detail.total}</span></span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-03/60">
                <div className="h-full rounded-full bg-primary" style={{ width: `${detail.total ? (detail.done / detail.total) * 100 : 0}%` }} />
              </div>
            </div>

            {yearShut && canReopen ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <p className="font-mont text-xs leading-5 text-gray-05">
                  FY {yearShut.year} is {yearShut.status === "LOCKED" ? "locked" : "closed"}, so its months stay shut.
                  {yearShut.status === "LOCKED"
                    ? " A locked year cannot be reopened."
                    : " Reopen the fiscal year before re-opening one of its months."}
                </p>
              </div>
            ) : null}

            {finalPeriodOfOpenYear && canLock ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <p className="font-mont text-xs leading-5 text-gray-05">This is the final period. Close the fiscal year before applying its permanent lock.</p>
              </div>
            ) : null}

            {/* Why the close is refused, said once at the top. Warnings are
                deliberately not counted here - they never stop a close. */}
            {blockers.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
                <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="font-mont text-xs leading-5 text-gray-05">
                  <span className="font-semibold text-destructive">
                    {blockers.length === 1
                      ? "One check must pass before this period can close."
                      : `${blockers.length} checks must pass before this period can close.`}
                  </span>{" "}
                  Anything marked "Warning only" or "Done by the close" below will not stop it.
                  {canClose && forceable && can(P.FIN_FORCE_CLOSE_PERIOD) ? " You may force the close with a reason." : ""}
                </p>
              </div>
            ) : null}

            {several && calendar.selected === "all" && period ? <BranchMonthStates states={branchStates} /> : null}

            <div>
              <div className="mb-3 flex items-center gap-1.5">
                <h4 className="font-mont text-sm font-semibold text-gray-01">Close checklist</h4>
                <InfoHint ariaLabel="About the close checklist">Closing posts due depreciation and releases deferred income falling due, then runs month-end controls. Soft close is reversible; permanent locks are not.</InfoHint>
              </div>
              {/* A failed warning drawn like a failed blocker stops month-end for a
                  balance that is entirely legitimate, so the three states are told
                  apart here rather than by a single grey "not done" circle. */}
              <div className="space-y-2">
                {items.map((item, index) => {
                  const severity = checklistSeverity(item);
                  return (
                    <div key={item.name} className={cn(
                      "flex items-start gap-3 rounded-md border bg-white px-3 py-3",
                      severity === "blocker" ? "border-red-200 bg-red-50/50"
                        : severity === "warning" ? "border-amber-200 bg-amber-50/50"
                          : "border-white-02",
                    )}>
                      <span className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mont text-[11px] font-semibold",
                        severity === "passed" ? "bg-green-01 text-white"
                          : severity === "done-by-close" ? "bg-gray-04 text-white"
                            : severity === "blocker" ? "bg-destructive text-white"
                              : "bg-amber-500 text-white",
                      )}>
                        {severity === "passed" ? <Check className="size-3" />
                          : severity === "done-by-close" ? <Clock3 className="size-3" />
                            : severity === "blocker" ? <X className="size-3" />
                              : <TriangleAlert className="size-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mont text-sm font-medium text-gray-01">{checklistLabel(item.name, humanize)}</p>
                          {severity === "blocker" ? (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mont text-[10px] font-medium text-destructive">Blocks the close</span>
                          ) : severity === "done-by-close" ? (
                            <span className="rounded bg-gray-02 px-1.5 py-0.5 font-mont text-[10px] font-medium text-gray-05">Done by the close</span>
                          ) : severity === "warning" ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mont text-[10px] font-medium text-amber-700">Warning only</span>
                          ) : !item.blocking ? (
                            <span className="rounded bg-gray-02 px-1.5 py-0.5 font-mont text-[10px] text-gray-05">Non-blocking</span>
                          ) : null}
                        </div>
                        {item.detail ? <p className="mt-1 break-words font-mont text-xs leading-5 text-gray-05">{item.detail}</p> : null}
                        {sealsLink(item) && canWholeSchool(P.FIN_VIEW_SEALS) ? (
                          <Link to={`${F.REPORTS}/seals`} className="mt-1 inline-block font-mont text-xs font-semibold text-primary hover:underline">
                            Verify sealed figures
                          </Link>
                        ) : null}
                        {severity === "warning" ? (
                          <p className="mt-1 font-mont text-[11px] leading-5 text-amber-700">This does not stop the close. It is here so the figure is seen first.</p>
                        ) : null}
                      </div>
                      <span className="sr-only">{`Item ${index + 1}`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
      <ConfirmActionModal
        open={action != null}
        onOpenChange={(open) => !open && chooseAction(null)}
        title={activeCopy?.title ?? "Confirm period action"}
        description={activeCopy?.description}
        confirmText={activeCopy?.text}
        destructive={activeCopy?.destructive}
        loading={busy}
        confirmDisabled={!actionBranchReady(calendar, branchChoice) || ((action === "reopen" || action === "force") && !hasReason(reason))}
        onConfirm={confirm}
      >
        {calendar.mustAsk || action === "reopen" || action === "force" ? (
          <div className="space-y-4">
            <CalendarBranchQuestion
              calendar={calendar}
              value={branchChoice}
              onChange={setBranchChoice}
              hint={activeCopy?.branchHint ?? ""}
            />
            {action === "force" ? (
              <div className="rounded-md border border-red-200 bg-red-50/60 p-3">
                <p className="font-mont text-xs font-semibold text-gray-01">Checks you are overriding</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mont text-xs text-gray-05">
                  {blockers.map((item) => (
                    <li key={item.name}>{checklistLabel(item.name, humanize)}{item.detail ? `: ${item.detail}` : ""}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {action === "reopen" || action === "force" ? (
              <ReasonField
                value={reason}
                onChange={setReason}
                disabled={busy}
                placeholder={action === "force"
                  ? "For example: the bank statement for March is late and the accountant has agreed the balance"
                  : "For example: a supplier bill dated in this month arrived after the close"}
                hint="Kept on the audit trail with your name."
              />
            ) : null}
          </div>
        ) : null}
      </ConfirmActionModal>
    </>
  );
}
