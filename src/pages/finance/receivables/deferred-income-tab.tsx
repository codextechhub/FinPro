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
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Undo2 } from "lucide-react";
import {
  ConfirmActionModal, DataTable, FormField, Money, PostingDateField, toArray, type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useReaderReach } from "../../../host";
import { useDates } from "../../../lib/display-prefs";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import {
  useGetDeferredIncomeQuery, useReleaseDeferredIncomeMutation, useReverseDeferredIncomeMutation,
} from "@/redux/services/finance/fees-api";
import type { DeferredIncomeRelease } from "@/redux/services/finance/fees-types";
import { Kpi, Note, useBranchColumn } from "./fees-parts";

export function DeferredIncomeTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const { can } = useCan();
  const { wholeSchool } = useReaderReach();
  const branches = useBranchColumn();
  const { data, isLoading, isError, refetch } = useGetDeferredIncomeQuery({ entity });
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

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !summary) return <ErrorState onRetry={refetch} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kpi label="Waiting to be released" value={formatMoney(summary.pending, currency)} hint="Billed for months still to come" />
        <Kpi label="Released to income" value={formatMoney(summary.released, currency)} />
      </div>

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

      <Note>
        A month cannot be closed while its share is unreleased. The spread (evenly over each month, or all in the
        first month) is set under Settings, Receivables.
      </Note>

      <ReleaseModal open={releasing} onClose={() => setReleasing(false)} entity={entity} onDone={setLastRun} />
      <UndoModal open={undoing} onClose={() => setUndoing(false)} entity={entity} />
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

function UndoModal({ open, onClose, entity }: { open: boolean; onClose: () => void; entity: string }) {
  const dates = useDates();
  const { data } = useGetPeriodsQuery({ entity, status: "OPEN" }, { skip: !open });
  const periods = useMemo(() => toArray(data?.data).filter((p) => p.status === "OPEN"), [data]);
  const [period, setPeriod] = useState("");
  const [reverse, { isLoading }] = useReverseDeferredIncomeMutation();
  const chosen = periods.find((p) => String(p.id) === period);
  const submit = async () => {
    if (!chosen) return;
    try {
      const res = await reverse({ entity, period: chosen.id }).unwrap();
      toast.success(res.message || "Release undone.");
      setPeriod("");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open={open} onOpenChange={(o) => !o && onClose()}
      title="Undo a month's release?"
      description="Reverses every release journal dated in the month you pick. Its shares go back to Deferred income and wait to be released again. A closed month keeps its releases."
      confirmText="Undo release" destructive loading={isLoading} onConfirm={submit} confirmDisabled={!chosen}
    >
      <FormField label="Month" required>
        <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month">
          <option value="" disabled>Select an open month</option>
          {periods.map((p) => (
            <option key={p.id} value={String(p.id)}>{p.name} ({dates.day(p.start_date)} to {dates.day(p.end_date)})</option>
          ))}
        </NativeSelect>
      </FormField>
    </ConfirmActionModal>
  );
}
