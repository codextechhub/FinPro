// Fiscal-period close workbench. The route, Redux services and lifecycle remain
// unchanged; this view presents one bounded fiscal year at a time and makes every
// available close action explicit.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import {
  ArrowRight,
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
  StatCard,
  StatusPill,
} from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { checklistLabel, checklistSeverity, closeOutcomeMessage, failedBlockers } from "./close-checklist";
import { P } from "../../../permissions";
import {
  useCloseFiscalYearMutation,
  useClosePeriodMutation,
  useGetFiscalYearPeriodsQuery,
  useGetPeriodChecklistQuery,
  useLockPeriodMutation,
  useReopenPeriodMutation,
  useStartFiscalYearMutation,
} from "@/redux/services/finance/setup-api";
import { useGetFiscalYearsQuery } from "@/redux/services/finance/ops-api";
import { toArray } from "@/redux/services/finance/api-types";
import type { FiscalPeriod } from "@/redux/services/finance/setup-types";
import {
  periodActionLabel,
  summarizePeriods,
  yearCloseState,
  type YearCloseState,
} from "./periods-model";

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
const humanize = (value: string) => {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const formatDate = (value: string) => new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
}).format(new Date(`${value}T00:00:00`));
const isForbidden = (error: unknown) => (
  typeof error === "object" && error !== null && "status" in error && error.status === 403
);

/**
 * Fiscal close workbench for one ledger entity.
 *
 * The calendar controls (fiscal year picker and the new-year action) read as part
 * of the page heading rather than as the first row of the body, so a host that
 * exposes a `headerSlot` node receives them through a portal and gets them on the
 * title line; a host that does not passes nothing and they render inline above the
 * workbench. The picker owns the selected year that drives every query below it,
 * which is why the controls stay part of this component instead of being lifted
 * into the host.
 */
export function PeriodsTab({ entity, headerSlot }: {
  entity: string;
  headerSlot?: HTMLElement | null;
}) {
  const {
    data: fiscalYearData,
    isLoading: fiscalYearsLoading,
    isError: fiscalYearsFailed,
    error: fiscalYearsError,
    refetch: refetchFiscalYears,
  } = useGetFiscalYearsQuery({ entity });
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
  } = useGetFiscalYearPeriodsQuery(activeYear ? { entity, year: activeYear } : skipToken);
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
  const [closing, setClosing] = useState<{ id: number; year: number } | null>(null);
  const [closeYear, { isLoading: closingYear }] = useCloseFiscalYearMutation();

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

  const chooseYear = (year: number) => {
    setChosenYear(year);
    setSelected(null);
  };
  const doCloseYear = async () => {
    if (!closing) return;
    try {
      const response = await closeYear({ id: closing.id, entity }).unwrap();
      const netIncome = response.data?.net_income?.naira;
      toast.success(
        `${response.message || `Fiscal year ${closing.year} closed.`}`
        + `${netIncome ? ` · Net ${netIncome} → Retained Earnings` : ""}`,
      );
      setClosing(null);
    } catch { /* central */ }
  };

  if (fiscalYearsLoading) return <LoadingState rows={6} label="Loading fiscal years…" />;
  if (fiscalYearsFailed) {
    return isForbidden(fiscalYearsError)
      ? <ForbiddenState message="You do not have permission to view fiscal periods." />
      : <ErrorState onRetry={refetchFiscalYears} />;
  }

  const calendarControls = (
    <div data-guide="finance-periods.calendar-controls" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
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
              <option key={year.id} value={year.year}>FY {year.year} · {humanize(year.status)}</option>
            ))}
          </select>
        </label>
      ) : null}
      <Can permission={P.FIN_CREATE_PERIOD}>
        <Button onClick={() => setCreating(true)} className="h-9 flex-1 gap-1.5 font-mont text-xs font-semibold sm:flex-none">
          <Plus className="size-3.5" /> New fiscal year
        </Button>
      </Can>
    </div>
  );

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
          />

          <YearCloseReadiness
            state={closeState}
            year={activeFiscalYear.year}
            fiscalYearId={activeFiscalYear.id}
            openCount={summary.open}
            onCloseYear={() => setClosing({ id: activeFiscalYear.id, year: activeFiscalYear.year })}
          />

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
        open={closing != null}
        onOpenChange={(open) => !open && setClosing(null)}
        title={closing ? `Close fiscal year ${closing.year}?` : "Close fiscal year?"}
        description={`Posts the formal year-end journal, clears income and expense balances into Retained Earnings, and seals FY ${closing?.year ?? ""}. Period locks remain unchanged. This cannot be undone.`}
        confirmText="Close fiscal year"
        destructive
        loading={closingYear}
        onConfirm={doCloseYear}
      />
    </div>
  );
}

function FiscalYearOverview({
  fiscalYear,
  periods,
  summary,
}: {
  fiscalYear: { year: number; start_date: string; end_date: string; status: string };
  periods: FiscalPeriod[];
  summary: ReturnType<typeof summarizePeriods>;
}) {
  const progress = summary.total ? Math.round((summary.progressed / summary.total) * 100) : 0;
  return (
    <section className="rounded-lg border border-white-02 bg-[#F7F8FA] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mont text-lg font-semibold text-black-01">Fiscal year {fiscalYear.year}</h2>
            <StatusPill status={fiscalYear.status} />
          </div>
          <p className="mt-1 font-mont text-xs text-gray-05">
            {formatDate(fiscalYear.start_date)} - {formatDate(fiscalYear.end_date)} · {periods.length === 4 ? "Quarterly" : periods.length === 12 ? "Monthly" : "Custom"}
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

function YearCloseReadiness({
  state,
  year,
  fiscalYearId,
  openCount,
  onCloseYear,
}: {
  state: YearCloseState;
  year: number;
  fiscalYearId: number;
  openCount: number;
  onCloseYear: () => void;
}) {
  if (state === "SEALED") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-01/25 bg-green-01/5 p-4">
        <CheckCircle2 className="size-5 shrink-0 text-green-01" />
        <div className="min-w-0 flex-1">
          <p className="font-mont text-sm font-semibold text-gray-01">Fiscal year {year} is sealed</p>
          <p className="mt-0.5 font-mont text-xs text-gray-05">The year-end journal has been posted. Individual closed periods may now be locked when required.</p>
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

function PeriodCard({ period, selected, onClick }: { period: FiscalPeriod; selected: boolean; onClick: () => void }) {
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
        {formatDate(period.start_date)} - {formatDate(period.end_date)}
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

type PeriodAction = "soft-close" | "close" | "reopen" | "lock";

function PeriodCloseDrawer({
  id,
  entity,
  finalPeriodOfOpenYear,
  onClose,
}: {
  id: number | null;
  entity: string;
  finalPeriodOfOpenYear: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useGetPeriodChecklistQuery(id ? { id, entity } : skipToken);
  const [close, { isLoading: closing }] = useClosePeriodMutation();
  const [reopen, { isLoading: reopening }] = useReopenPeriodMutation();
  const [lock, { isLoading: locking }] = useLockPeriodMutation();
  const detail = data?.data;
  const period = detail?.period;
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const [action, setAction] = useState<PeriodAction | null>(null);
  const busy = closing || reopening || locking;
  const canClose = !!period && (period.status === "OPEN" || period.status === "SOFT_CLOSED");
  const canReopen = !!period && (period.status === "CLOSED" || period.status === "SOFT_CLOSED");
  const canLock = !!period && period.status === "CLOSED";

  const closeDrawer = () => {
    setAction(null);
    onClose();
  };
  const doClose = async (soft: boolean) => {
    try {
      const response = await close({ id: id!, entity, soft }).unwrap();
      toast.success(closeOutcomeMessage(period?.name, response.data?.checklist?.items));
      closeDrawer();
    } catch { /* central */ }
  };
  const doReopen = async () => {
    try {
      const response = await reopen({ id: id!, entity }).unwrap();
      toast.success(response.message || `Re-opened ${period?.name}.`);
      closeDrawer();
    } catch { /* central */ }
  };
  const doLock = async () => {
    try {
      const response = await lock({ id: id!, entity }).unwrap();
      toast.success(response.message || `Locked ${period?.name}.`);
      closeDrawer();
    } catch { /* central */ }
  };
  const confirm = () => {
    if (action === "soft-close") void doClose(true);
    else if (action === "close") void doClose(false);
    else if (action === "reopen") void doReopen();
    else if (action === "lock") void doLock();
  };
  const confirmCopy: Record<PeriodAction, { title: string; description: string; text: string; destructive?: boolean }> = {
    "soft-close": {
      title: `Soft-close ${period?.name ?? "period"}?`,
      description: "Blocks ordinary postings while still allowing controlled close-process entries. Authorised users can re-open it later.",
      text: "Soft-close period",
    },
    close: {
      title: `Run close for ${period?.name ?? "period"}?`,
      description: "Runs the close steps and blocks further postings. The period remains re-openable until it is permanently locked.",
      text: "Run period close",
    },
    reopen: {
      title: `Re-open ${period?.name ?? "period"}?`,
      description: "Allows ordinary journals and source documents to post into this period again. The action is recorded in the audit trail.",
      text: "Re-open period",
    },
    lock: {
      title: `Permanently lock ${period?.name ?? "period"}?`,
      description: "This cannot be reversed. Any correction must be posted in a later open period.",
      text: "Lock period",
      destructive: true,
    },
  };
  const activeCopy = action ? confirmCopy[action] : null;

  return (
    <>
      <DetailDrawer
        open={id != null}
        onOpenChange={(open) => !open && closeDrawer()}
        title={period ? `Manage ${period.name}` : "Period close"}
        description={period ? `Period ${period.period_no} · ${formatDate(period.start_date)} - ${formatDate(period.end_date)}` : undefined}
        widthClass="w-full sm:max-w-2xl"
        footer={(canClose || canReopen || canLock) ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {canReopen ? (
              <Can permission={P.FIN_REOPEN_PERIOD}>
                <Button variant="outline" onClick={() => setAction("reopen")} disabled={busy} className="w-full sm:w-auto">Re-open</Button>
              </Can>
            ) : null}
            {canLock ? (
              <Can permission={P.FIN_LOCK_PERIOD}>
                <Button
                  variant="outline"
                  onClick={() => setAction("lock")}
                  disabled={busy || finalPeriodOfOpenYear}
                  title={finalPeriodOfOpenYear ? "Close the fiscal year before locking its final period." : undefined}
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/5 sm:w-auto"
                >Lock period</Button>
              </Can>
            ) : null}
            {canClose ? (
              <Can permission={P.FIN_CLOSE_PERIOD}>
                {period?.status === "OPEN" ? (
                  <Button variant="outline" onClick={() => setAction("soft-close")} disabled={busy} className="w-full sm:w-auto">Soft close</Button>
                ) : null}
                <Button onClick={() => setAction("close")} disabled={busy} className="w-full sm:w-auto">Run close steps</Button>
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
                <span className="flex items-center gap-2 text-gray-05">Current status <StatusPill status={period.status} /></span>
                <span className="text-gray-05">Checklist <span className="font-semibold tabular-nums text-black-01">{detail.done} / {detail.total}</span></span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-03/60">
                <div className="h-full rounded-full bg-primary" style={{ width: `${detail.total ? (detail.done / detail.total) * 100 : 0}%` }} />
              </div>
            </div>

            {finalPeriodOfOpenYear && canLock ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <p className="font-mont text-xs leading-5 text-gray-05">This is the final period. Close the fiscal year before applying its permanent lock.</p>
              </div>
            ) : null}

            {/* Why the close is refused, said once at the top. Warnings are
                deliberately not counted here - they never stop a close. */}
            {failedBlockers(items).length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
                <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="font-mont text-xs leading-5 text-gray-05">
                  <span className="font-semibold text-destructive">
                    {failedBlockers(items).length === 1
                      ? "One check must pass before this period can close."
                      : `${failedBlockers(items).length} checks must pass before this period can close.`}
                  </span>{" "}
                  Anything marked "Warning only" below will not stop it.
                </p>
              </div>
            ) : null}

            <div>
              <div className="mb-3 flex items-center gap-1.5">
                <h4 className="font-mont text-sm font-semibold text-gray-01">Close checklist</h4>
                <InfoHint ariaLabel="About the close checklist">Closing runs month-end controls and due depreciation. Soft close is reversible; permanent locks are not.</InfoHint>
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
                          : severity === "blocker" ? "bg-destructive text-white"
                            : "bg-amber-500 text-white",
                      )}>
                        {severity === "passed" ? <Check className="size-3" />
                          : severity === "blocker" ? <X className="size-3" />
                            : <TriangleAlert className="size-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mont text-sm font-medium text-gray-01">{checklistLabel(item.name, humanize)}</p>
                          {severity === "blocker" ? (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mont text-[10px] font-medium text-destructive">Blocks the close</span>
                          ) : severity === "warning" ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mont text-[10px] font-medium text-amber-700">Warning only</span>
                          ) : !item.blocking ? (
                            <span className="rounded bg-gray-02 px-1.5 py-0.5 font-mont text-[10px] text-gray-05">Non-blocking</span>
                          ) : null}
                        </div>
                        {item.detail ? <p className="mt-1 break-words font-mont text-xs leading-5 text-gray-05">{item.detail}</p> : null}
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
        onOpenChange={(open) => !open && setAction(null)}
        title={activeCopy?.title ?? "Confirm period action"}
        description={activeCopy?.description}
        confirmText={activeCopy?.text}
        destructive={activeCopy?.destructive}
        loading={busy}
        onConfirm={confirm}
      />
    </>
  );
}
