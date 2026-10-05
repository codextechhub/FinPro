/**
 * Receivables -> Deferred Income.
 *
 * A fee billed before the period it pays for is not income yet: Tunde's
 * N400,000 first-term bill raised in August credits Deferred income, and each
 * month of the term moves its share to revenue. This screen shows what is still
 * waiting, what has been released, and what falls due month by month, and runs
 * the release.
 *
 * Releasing and undoing act for every branch at once (one journal per branch),
 * so the server refuses them to a reader who does not cover the whole school;
 * the buttons are offered only to a whole-school holder of the key. A month
 * cannot close while its share is unreleased, which the close checklist says
 * on its own. How a term's fee is spread (evenly by month, or all in its first
 * month) is the school's choice under Settings > Receivables.
 *
 * The figures and the release list follow the branch picked (`list-branch`).
 * The release list names every release journal posted, and the undo form
 * offers only the months the server says can still be undone (`can_reverse`:
 * a release not yet reversed whose month is open), with what each holds.
 * `can_reverse` reads the school's month; a branch may have closed its own
 * month while the school's is open, and the undo, which reverses every
 * branch's release at once, is then refused. So the form also reads each
 * branch's own month (`branch_states` of the open periods) and lists such a
 * month disabled, naming the branch that closed it.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Undo2 } from "lucide-react";
import {
  ConfirmActionModal, DataTable, FormField, Money, PostingDateField, StatusPill, toArray, type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useReaderReach } from "../../../host";
import { useDates } from "../../../lib/display-prefs";
import {
  useGetDeferredIncomeQuery, useGetDeferredIncomeReleasesQuery, useReleaseDeferredIncomeMutation,
  useReverseDeferredIncomeMutation,
} from "@/redux/services/finance/fees-api";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import type { FiscalPeriod } from "@/redux/services/finance/setup-types";
import type { DeferredIncomeRelease, DeferredIncomeReleaseRow } from "@/redux/services/finance/fees-types";
import { Kpi, Note, useBranchColumn } from "./fees-parts";
import { ListBranchSelect, listBranchArg, useListBranch } from "./list-branch";

/** One month the undo form offers: what its open releases hold. */
export interface UndoableMonth {
  periodId: number;
  name: string;
  amount: number;
  journals: number;
  /** Branches holding a release in the month that have closed their own month; any one blocks the undo. */
  closedAt: string[];
}

/**
 * The months whose releases can still be undone, newest first, from the
 * server's release rows. Undoing reverses every release of the month, every
 * branch's, so each month is offered once with its total. `periods` carries
 * each branch's own state of the month (`branch_states`): a branch with a
 * release in the month whose own month is not OPEN is named in `closedAt`,
 * because the server refuses to post its reversal there.
 */
export function undoableMonths(
  rows: DeferredIncomeReleaseRow[],
  periods: Pick<FiscalPeriod, "id" | "branch_states">[] = [],
): UndoableMonth[] {
  const months = new Map<number, UndoableMonth>();
  for (const row of rows) {
    if (!row.can_reverse || row.period_id == null) continue;
    const month = months.get(row.period_id) ?? { periodId: row.period_id, name: row.period_name ?? row.month, amount: 0, journals: 0, closedAt: [] };
    month.amount += row.amount;
    month.journals += 1;
    const own = periods.find((p) => p.id === row.period_id)?.branch_states?.find((b) => b.branch === row.branch_id);
    if (own && own.status !== "OPEN" && !month.closedAt.includes(own.branch_name)) month.closedAt.push(own.branch_name);
    months.set(row.period_id, month);
  }
  return [...months.values()];
}

export function DeferredIncomeTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const { can } = useCan();
  const { wholeSchool } = useReaderReach();
  const branches = useBranchColumn();
  const list = useListBranch();
  const branchArg = listBranchArg(list.view);
  const { data, isLoading, isError, refetch } = useGetDeferredIncomeQuery({ entity, ...branchArg });
  const [releasePage, setReleasePage] = useState(1);
  const releasesQ = useGetDeferredIncomeReleasesQuery({ entity, page: releasePage, ...branchArg });
  const releaseRows = useMemo(() => toArray(releasesQ.data?.data), [releasesQ.data]);
  const [releasing, setReleasing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [lastRun, setLastRun] = useState<DeferredIncomeRelease[] | null>(null);
  const summary = data?.data;
  const canRelease = wholeSchool && can(P.FIN_RELEASE_DEFERRED_INCOME);
  const canUndo = wholeSchool && can(P.FIN_REVERSE_DEFERRED_INCOME);
  const runsOffered = can(P.FIN_RELEASE_DEFERRED_INCOME) || can(P.FIN_REVERSE_DEFERRED_INCOME);

  const monthColumns: Column<{ month: string; amount: number }>[] = [
    { header: "Month", cell: (r) => <span className="font-medium text-gray-01">{dates.monthYear(`${r.month}-01`)}</span> },
    { header: "To release", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
  ];
  const runColumns: Column<DeferredIncomeRelease>[] = [
    ...(branches.show ? [{ header: "Branch", cell: (r: DeferredIncomeRelease) => branches.name(r.branch_id) }] : []),
    { header: "Date", cell: (r) => <span className="tabular-nums">{dates.day(r.date)}</span> },
    { header: "Journal", cell: (r) => <span className="tabular-nums text-gray-05">#{r.journal_id}</span> },
    { header: "Released", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
  ];
  const showBranch = branches.show && list.view.selected === "all";
  const releaseColumns: Column<DeferredIncomeReleaseRow>[] = [
    { header: "Date", cell: (r) => <span className="tabular-nums">{dates.day(r.date, r.branch_id)}</span> },
    ...(showBranch ? [{ header: "Branch", cell: (r: DeferredIncomeReleaseRow) => branches.name(r.branch_id, r.branch_name) }] : []),
    { header: "Month", cell: (r) => r.period_name ?? dates.monthYear(`${r.month}-01`) },
    { header: "Journal", cell: (r) => <span className="tabular-nums text-gray-05">{r.journal_number ?? `#${r.journal_id}`}</span> },
    { header: "Released", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <StatusPill status={r.reversed ? "REVERSED" : "POSTED"} /> },
  ];

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !summary) return <ErrorState onRetry={refetch} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kpi label="Waiting to be released" value={formatMoney(summary.pending, currency)} hint="Billed for months still to come" />
        <Kpi label="Released to income" value={formatMoney(summary.released, currency)} />
      </div>

      <ListBranchSelect view={list.view} onChange={(v) => { setReleasePage(1); list.choose(v); }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mont text-sm font-semibold text-black-01">Due by month</p>
        <div className="flex flex-wrap gap-2">
          {canUndo ? (
            <Button variant="outline" onClick={() => setUndoing(true)} className="gap-1.5"><Undo2 className="size-4" /> Undo a month&apos;s release</Button>
          ) : null}
          {canRelease ? (
            <Button onClick={() => setReleasing(true)} className="gap-1.5"><CalendarCheck className="size-4" /> Release due income</Button>
          ) : null}
        </div>
      </div>
      {runsOffered && !wholeSchool ? (
        <Note>A release covers every branch at once, so only someone who covers the whole school runs or undoes it.</Note>
      ) : null}

      <DataTable
        columns={monthColumns} rows={summary.by_month} rowKey={(r) => r.month}
        emptyTitle="Nothing waiting"
        emptyMessage="Fees billed before the period they pay for appear here, month by month, until they are released."
      />

      {lastRun ? (
        <div className="space-y-2">
          <p className="font-mont text-sm font-semibold text-black-01">
            {lastRun.length ? `This release posted ${lastRun.length} journal${lastRun.length === 1 ? "" : "s"}` : "Nothing was due to release"}
          </p>
          {lastRun.length ? (
            <DataTable columns={runColumns} rows={lastRun} rowKey={(r) => r.id} mobile="scroll" />
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="font-mont text-sm font-semibold text-black-01">Releases</p>
        <DataTable
          columns={releaseColumns} rows={releaseRows} rowKey={(r) => r.id}
          loading={releasesQ.isLoading || releasesQ.isFetching} error={releasesQ.isError} onRetry={releasesQ.refetch}
          page={releasesQ.data?.pagination?.currentPage} totalPages={releasesQ.data?.pagination?.totalPages} onPageChange={setReleasePage}
          emptyTitle="No releases yet"
          emptyMessage="Each release posts one journal per branch; they are listed here."
        />
      </div>

      <Note>
        A month cannot be closed while its share is unreleased. The spread (evenly over each month, or all in the
        first month) is set under Settings, Receivables.
      </Note>

      <ReleaseModal open={releasing} onClose={() => setReleasing(false)} entity={entity} onDone={setLastRun} />
      <UndoModal open={undoing} onClose={() => setUndoing(false)} entity={entity} currency={currency} />
    </div>
  );
}

function ReleaseModal({ open, onClose, entity, onDone }: {
  open: boolean; onClose: () => void; entity: string; onDone: (rows: DeferredIncomeRelease[]) => void;
}) {
  const dates = useDates();
  const [upTo, setUpTo] = useState("");
  const [release, { isLoading }] = useReleaseDeferredIncomeMutation();
  const today = dates.today();
  const value = upTo || today;
  const submit = async () => {
    try {
      const res = await release({ entity, up_to: value }).unwrap();
      toast.success(res.message || "Deferred income released.");
      onDone(res.data.releases);
      setUpTo("");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open={open} onOpenChange={(o) => !o && onClose()}
      title="Release deferred income?"
      description="Moves every month's share due by this date from Deferred income to revenue, one journal per branch. Running it again releases nothing twice."
      confirmText="Release" loading={isLoading} onConfirm={submit}
      confirmDisabled={value > today}
    >
      <PostingDateField label="Release up to" entity={entity} value={value} onChange={setUpTo} />
      {value > today ? <p className="font-mont text-[11px] text-destructive">Income is released for days that have passed, not ahead.</p> : null}
    </ConfirmActionModal>
  );
}

function UndoModal({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const { data, isFetching } = useGetDeferredIncomeReleasesQuery({ entity, reversed: "false", page_size: 100 }, { skip: !open });
  const periodsQ = useGetPeriodsQuery({ entity, status: "OPEN", include_branches: "true" }, { skip: !open });
  const months = useMemo(() => undoableMonths(toArray(data?.data), toArray(periodsQ.data?.data)), [data, periodsQ.data]);
  const [period, setPeriod] = useState("");
  const [reverse, { isLoading }] = useReverseDeferredIncomeMutation();
  const chosen = months.find((m) => String(m.periodId) === period && !m.closedAt.length);
  const blocked = months.some((m) => m.closedAt.length);
  const submit = async () => {
    if (!chosen) return;
    try {
      const res = await reverse({ entity, period: chosen.periodId }).unwrap();
      toast.success(res.message || "Release undone.");
      setPeriod("");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open={open} onOpenChange={(o) => !o && onClose()}
      title="Undo a month's release?"
      description="Reverses every release journal dated in the month you pick, every branch's. Its shares go back to Deferred income and wait to be released again. A closed month keeps its releases."
      confirmText="Undo release" destructive loading={isLoading} onConfirm={submit} confirmDisabled={!chosen}
    >
      <FormField label="Month" required>
        <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month" disabled={!months.length}>
          <option value="" disabled>{isFetching ? "Loading releases" : months.length ? "Select a month" : "No release can be undone"}</option>
          {months.map((m) => (
            <option key={m.periodId} value={String(m.periodId)} disabled={m.closedAt.length > 0}>
              {m.closedAt.length
                ? `${m.name}: closed at ${m.closedAt.join(", ")}`
                : `${m.name}: ${formatMoney(m.amount, currency)} in ${m.journals} ${m.journals === 1 ? "journal" : "journals"}`}
            </option>
          ))}
        </NativeSelect>
        {blocked ? (
          <span className="mt-1 block font-mont text-[11px] text-gray-05">A month closed at any branch cannot be undone until that branch re-opens it.</span>
        ) : null}
      </FormField>
    </ConfirmActionModal>
  );
}
