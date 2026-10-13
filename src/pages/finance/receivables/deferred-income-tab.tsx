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
 * offers the months the server says can still be undone (`can_reverse`), with
 * what each holds. A branch may close its own month while the school's is
 * still open, and the undo, which reverses every branch's release of the month
 * at once, is then refused for all of them: the server says so on each row
 * (`can_reverse` false, `reverse_blocked_reason`). Such a month is listed in
 * the form greyed out with that reason, and the release list shows the reason
 * under the row, so Lekki's bursar learns that Ikeja's close is what holds
 * September before anyone tries the undo.
 *
 * Every figure, column and filter here is a `finance.deferredincome` field with
 * its own Read switch, and the release date and accounting period are the two
 * that are also written (the release run submits `up_to`, the undo submits
 * `period`). A field the role may not read is not on screen at all, with its
 * header and its filter. The undo needs the period to be writable and the
 * reversal state to be readable, because the month list is built from the
 * releases not yet reversed, so a role without both is not offered it. The
 * release needs no field, so a role that may not write the date releases up to
 * today.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Undo2 } from "lucide-react";
import {
  AccessField, ConfirmActionModal, DataTable, Money, PostingDateField, StatusPill, fieldWriteErrors, toArray,
  useFieldAccess, type Column, type FieldErrors,
} from "@/components/finance-ui";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useWholeSchoolAccess } from "@/components/finance-ui/whole-school-access";
import { useDates } from "../../../lib/display-prefs";
import {
  useGetDeferredIncomeQuery, useGetDeferredIncomeReleasesQuery, useReleaseDeferredIncomeMutation,
  useReverseDeferredIncomeMutation,
} from "@/redux/services/finance/fees-api";
import type { DeferredIncomeRelease, DeferredIncomeReleaseRow } from "@/redux/services/finance/fees-types";
import { Kpi, Note, useBranchColumn } from "./fees-parts";
import { ListBranchSelect, listBranchArg, useListBranch } from "./list-branch";

/** One month the undo form lists: what its open releases hold, and why it cannot be undone, if it cannot. */
export interface UndoableMonth {
  periodId: number;
  name: string;
  amount: number;
  journals: number;
  /** The server's reason the month's undo would be refused, or null when it can be undone. */
  blockedReason: string | null;
}

const RESOURCE = "finance.deferredincome";

/**
 * Why the server refuses a release's undo, when it does, for a month that is
 * still open. A row that lacks the reversal state (the role may not read it)
 * says nothing: only the server's own sentence is shown then, if the role reads
 * that. A row that lacks the period's status (the role may not read the period)
 * cannot be told apart from one in a closed month, so it shows the server's
 * sentence too.
 */
export function openMonthBlock(row: DeferredIncomeReleaseRow): string | null {
  if (row.reversed || row.can_reverse) return null;
  if (row.period_status != null && row.period_status !== "OPEN") return null;
  if (row.can_reverse === false) return row.reverse_blocked_reason ?? "This month's releases cannot be undone.";
  return row.reverse_blocked_reason ?? null;
}

/**
 * The months the undo form lists, newest first, from the server's release rows.
 * Undoing reverses every release of the month, every branch's, so each month is
 * listed once with its total. A month whose undo the server would refuse while
 * the month is still open (a branch has closed it on its own) is listed with
 * the server's reason; the reason from a still-open branch's row is preferred,
 * because it names the branch that closed the month. A month closed for the
 * whole school is not listed at all.
 */
export function undoableMonths(rows: DeferredIncomeReleaseRow[]): UndoableMonth[] {
  const months = new Map<number, UndoableMonth>();
  for (const row of rows) {
    if (row.reversed || row.period_id == null) continue;
    const block = openMonthBlock(row);
    if (!row.can_reverse && !block) continue;
    const month = months.get(row.period_id) ?? { periodId: row.period_id, name: row.period_label ?? row.period_name ?? row.month ?? "", amount: 0, journals: 0, blockedReason: null };
    month.amount += row.amount ?? 0;
    month.journals += 1;
    if (block && (!month.blockedReason || row.branch_period_status === "OPEN")) month.blockedReason = block;
    months.set(row.period_id, month);
  }
  return [...months.values()];
}

export function DeferredIncomeTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const access = useFieldAccess(RESOURCE);
  const { canWholeSchool, heldWithoutReach } = useWholeSchoolAccess();
  const branches = useBranchColumn();
  const list = useListBranch();
  const branchArg = listBranchArg(list.view);
  const day = (value: string | undefined, branchId?: number | null) => (value ? dates.day(value, branchId) : "");
  const { data, isLoading, isError, refetch } = useGetDeferredIncomeQuery({ entity, ...branchArg });
  const [releasePage, setReleasePage] = useState(1);
  const [releasing, setReleasing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [lastRun, setLastRun] = useState<DeferredIncomeRelease[] | null>(null);
  const summary = data?.data;
  const canRelease = canWholeSchool(P.FIN_RELEASE_DEFERRED_INCOME);
  const canUndo = canWholeSchool(P.FIN_REVERSE_DEFERRED_INCOME) && !access.isReadOnly("period") && !access.isHidden("reversed");
  const runsWithheld = heldWithoutReach(P.FIN_RELEASE_DEFERRED_INCOME) || heldWithoutReach(P.FIN_REVERSE_DEFERRED_INCOME);

  const monthColumns: Column<{ month: string; amount: number }>[] = [
    { header: "Month", cell: (r) => <span className="font-medium text-gray-01">{dates.monthYear(`${r.month}-01`)}</span> },
    { header: "To release", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
  ];
  const runColumns: Column<DeferredIncomeRelease>[] = [
    ...(branches.show ? [{ header: "Branch", cell: (r: DeferredIncomeRelease) => branches.name(r.branch_id) }] : []),
    ...(!access.isHidden("date") ? [{ header: "Date", cell: (r: DeferredIncomeRelease) => <span className="tabular-nums">{day(r.date)}</span> }] : []),
    ...(!access.isHidden("journal_id") ? [{ header: "Journal", cell: (r: DeferredIncomeRelease) => <span className="tabular-nums text-gray-05">#{r.journal_id}</span> }] : []),
    ...(!access.isHidden("amount") ? [{ header: "Released", align: "right" as const, cell: (r: DeferredIncomeRelease) => <Money kobo={r.amount ?? 0} currency={currency} align="right" /> }] : []),
  ];
  const showBranch = branches.show && list.view.selected === "all";
  const showMonth = !access.isHidden("period_label") || !access.isHidden("month");
  const showReason = !access.isHidden("reverse_blocked_reason");
  const showState = !access.isHidden("reversed");
  const releaseColumns: Column<DeferredIncomeReleaseRow>[] = [
    ...(!access.isHidden("date") ? [{ header: "Date", cell: (r: DeferredIncomeReleaseRow) => <span className="tabular-nums">{day(r.date, r.branch_id)}</span> }] : []),
    ...(showBranch ? [{ header: "Branch", cell: (r: DeferredIncomeReleaseRow) => branches.name(r.branch_id, r.branch_name) }] : []),
    ...(showMonth ? [{ header: "Month", cell: (r: DeferredIncomeReleaseRow) => r.period_label ?? (r.month ? dates.monthYear(`${r.month}-01`) : "") }] : []),
    ...(!access.isHidden("journal_number") ? [{ header: "Journal", cell: (r: DeferredIncomeReleaseRow) => <span className="tabular-nums text-gray-05">{r.journal_number ?? (r.journal_id != null ? `#${r.journal_id}` : "")}</span> }] : []),
    ...(!access.isHidden("amount") ? [{ header: "Released", align: "right" as const, cell: (r: DeferredIncomeReleaseRow) => <Money kobo={r.amount ?? 0} currency={currency} align="right" /> }] : []),
    ...(showState || showReason ? [{
      header: "Status",
      cell: (r: DeferredIncomeReleaseRow) => (
        <div className="flex flex-col gap-1">
          {showState ? <StatusPill status={r.reversed ? "REVERSED" : "POSTED"} /> : null}
          {showReason && openMonthBlock(r) ? <span className="max-w-xs font-mont text-[11px] leading-4 text-gray-05">{openMonthBlock(r)}</span> : null}
        </div>
      ),
    }] : []),
  ];
  const releasesQ = useGetDeferredIncomeReleasesQuery({ entity, page: releasePage, ...branchArg }, { skip: releaseColumns.length === 0 });
  const releaseRows = useMemo(() => toArray(releasesQ.data?.data), [releasesQ.data]);

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !summary) return <ErrorState onRetry={refetch} />;

  return (
    <div className="space-y-5">
      {access.anyVisible("pending", "released") ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!access.isHidden("pending") ? <Kpi label="Waiting to be released" value={formatMoney(summary.pending ?? 0, currency)} hint="Billed for months still to come" /> : null}
          {!access.isHidden("released") ? <Kpi label="Released to income" value={formatMoney(summary.released ?? 0, currency)} /> : null}
        </div>
      ) : null}

      <ListBranchSelect view={list.view} onChange={(v) => { setReleasePage(1); list.choose(v); }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!access.isHidden("by_month") ? <p className="font-mont text-sm font-semibold text-black-01">Due by month</p> : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {canUndo ? (
            <Button variant="outline" onClick={() => setUndoing(true)} className="gap-1.5"><Undo2 className="size-4" /> Undo a month&apos;s release</Button>
          ) : null}
          {canRelease ? (
            <Button onClick={() => setReleasing(true)} className="gap-1.5"><CalendarCheck className="size-4" /> Release due income</Button>
          ) : null}
        </div>
      </div>
      {runsWithheld ? (
        <Note>A release covers every branch at once, so only someone who covers the whole school runs or undoes it.</Note>
      ) : null}

      {!access.isHidden("by_month") ? (
        <DataTable
          columns={monthColumns} rows={summary.by_month ?? []} rowKey={(r) => r.month}
          emptyTitle="Nothing waiting"
          emptyMessage="Fees billed before the period they pay for appear here, month by month, until they are released."
        />
      ) : null}

      {lastRun ? (
        <div className="space-y-2">
          <p className="font-mont text-sm font-semibold text-black-01">
            {lastRun.length ? `This release posted ${lastRun.length} journal${lastRun.length === 1 ? "" : "s"}` : "Nothing was due to release"}
          </p>
          {lastRun.length && runColumns.length ? (
            <DataTable columns={runColumns} rows={lastRun} rowKey={(r) => r.id} mobile="scroll" />
          ) : null}
        </div>
      ) : null}

      {releaseColumns.length ? (
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
      ) : null}

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
  const access = useFieldAccess(RESOURCE);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [upTo, setUpTo] = useState("");
  const [release, { isLoading }] = useReleaseDeferredIncomeMutation();
  const today = dates.today();
  const value = upTo || today;
  const showDate = !access.isHidden("up_to");
  const submit = async () => {
    try {
      const res = await release({ entity, ...access.writableOnly({ up_to: value }) }).unwrap();
      toast.success(res.message || "Deferred income released.");
      onDone(res.data.releases ?? []);
      setUpTo("");
      setDenied(null);
      onClose();
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };
  return (
    <ConfirmActionModal
      open={open} onOpenChange={(o) => !o && onClose()}
      title="Release deferred income?"
      description={`Moves every month's share due by ${showDate ? "this date" : "today"} from Deferred income to revenue, one journal per branch. Running it again releases nothing twice.`}
      confirmText="Release" loading={isLoading} onConfirm={submit}
      confirmDisabled={showDate && value > today}
    >
      <AccessField access={access} name="up_to" errors={denied}>
        <PostingDateField label="Release up to" entity={entity} value={value} onChange={setUpTo} />
      </AccessField>
      {showDate && value > today ? <p className="font-mont text-[11px] text-destructive">Income is released for days that have passed, not ahead.</p> : null}
    </ConfirmActionModal>
  );
}

function UndoModal({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const access = useFieldAccess(RESOURCE);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const { data, isFetching } = useGetDeferredIncomeReleasesQuery({ entity, reversed: "false", page_size: 100 }, { skip: !open });
  const months = useMemo(() => undoableMonths(toArray(data?.data)), [data]);
  const [period, setPeriod] = useState("");
  const [reverse, { isLoading }] = useReverseDeferredIncomeMutation();
  const chosen = months.find((m) => String(m.periodId) === period && !m.blockedReason);
  const blocked = months.filter((m) => m.blockedReason);
  const showAmount = !access.isHidden("amount");
  const showReason = !access.isHidden("reverse_blocked_reason");
  const submit = async () => {
    if (!chosen) return;
    try {
      const res = await reverse({ entity, ...access.writableOnly({ period: chosen.periodId }) }).unwrap();
      toast.success(res.message || "Release undone.");
      setPeriod("");
      setDenied(null);
      onClose();
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };
  return (
    <ConfirmActionModal
      open={open} onOpenChange={(o) => !o && onClose()}
      title="Undo a month's release?"
      description="Reverses every release journal dated in the month you pick, every branch's. Its shares go back to Deferred income and wait to be released again. A closed month keeps its releases."
      confirmText="Undo release" destructive loading={isLoading} onConfirm={submit} confirmDisabled={!chosen}
    >
      <AccessField access={access} name="period" label="Month" required errors={denied}>
        <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month" disabled={!months.length}>
          <option value="" disabled>{isFetching ? "Loading releases" : months.length ? "Select a month" : "No release can be undone"}</option>
          {months.map((m) => (
            <option key={m.periodId} value={String(m.periodId)} disabled={!!m.blockedReason}>
              {m.blockedReason
                ? `${m.name}: cannot be undone`
                : `${m.name}: ${showAmount ? `${formatMoney(m.amount, currency)} in ` : ""}${m.journals} ${m.journals === 1 ? "journal" : "journals"}`}
            </option>
          ))}
        </NativeSelect>
        {showReason ? blocked.map((m) => (
          <span key={m.periodId} className="mt-1 block font-mont text-[11px] text-gray-05">{m.blockedReason}</span>
        )) : null}
      </AccessField>
    </ConfirmActionModal>
  );
}
