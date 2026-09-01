// Needs Attention - inbound provider events that did not make it into the books.
//
// When a gateway webhook arrives and the booking fails (most often because no fiscal
// period is open for today), the processor records the failure and deliberately
// swallows the exception: the PSP has already been acked and its retries are
// idempotent, so re-raising would only produce a spurious 500. That is right for the
// provider and wrong for us - the customer's money has moved and nothing in the
// console said so. This screen is the "and then somebody notices" half.
//
// Replay re-runs the stored event against the body already on file. It is safe to
// press twice: the confirm services are idempotent on a terminal record.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, RotateCcw } from "lucide-react";
import { DataTable, KpiCard, toArray, type Column } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import {
  useGetWebhookEventsQuery,
  useGetWebhookSummaryQuery,
  useReplayWebhookEventMutation,
} from "@/redux/services/payments/payments-api";
import type { WebhookEvent } from "@/redux/services/payments/payments-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const fmtDateTime = (s?: string | null) =>
  (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-");

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  FAILED: { label: "Failed to book", cls: "bg-destructive/10 text-destructive" },
  IGNORED: { label: "Unmatched", cls: "bg-amber-50 text-amber-700" },
  PROCESSED: { label: "Booked", cls: "bg-green-01/10 text-green-01" },
  RECEIVED: { label: "Received", cls: "bg-blue-50 text-blue-700" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_PILL[status] ?? { label: status, cls: "bg-gray-02 text-gray-01" };
  return <span className={cn(PILL, s.cls)}>{s.label}</span>;
}

const FILTERS = [
  { key: "", label: "Needs attention" },
  { key: "FAILED", label: "Failed" },
  { key: "IGNORED", label: "Unmatched" },
  { key: "ALL", label: "All events" },
] as const;

export function WebhooksTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const [status, setStatus] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [page, setPage] = useState(1);
  const [replayingId, setReplayingId] = useState<number | null>(null);

  // Server-side filters; reset to page 1 during render so the reset lands in the
  // same pass rather than flashing an out-of-range page.
  const filterKey = `${status} ${search}`;
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }

  const params = useMemo(() => ({
    entity, page,
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  }), [entity, page, status, search]);
  const { data, isLoading, isFetching, isError, refetch } = useGetWebhookEventsQuery(params);
  const { data: summaryRes } = useGetWebhookSummaryQuery({ entity });
  const [replay, { isLoading: replaying }] = useReplayWebhookEventMutation();

  const rows = toArray<WebhookEvent>(data?.data);
  const pg = data?.pagination;
  const sum = summaryRes?.data;

  const doReplay = async (event: WebhookEvent) => {
    setReplayingId(event.id);
    try {
      const res = await replay({ id: event.id, entity }).unwrap();
      toast.success(res.message || "Webhook replayed.");
    } catch {
      /* central error handling */
    } finally {
      setReplayingId(null);
    }
  };

  const columns: Column<WebhookEvent>[] = [
    {
      header: "Received",
      cell: (e) => <span className="tabular-nums text-gray-05">{fmtDateTime(e.created_at)}</span>,
    },
    {
      header: "Reference",
      cell: (e) => (
        <span className="block max-w-[220px] truncate font-semibold" title={e.target_reference || e.provider_reference}>
          {e.target_reference || e.provider_reference || "-"}
        </span>
      ),
    },
    {
      header: "From",
      cell: (e) => <span className="text-gray-01">{e.customer_name || "-"}</span>,
    },
    {
      header: "Amount",
      align: "right",
      cell: (e) => (e.amount === null
        ? <span className="block text-right text-gray-05">-</span>
        : <span className="block text-right tabular-nums">{formatMoney(e.amount, currency)}</span>),
    },
    { header: "Status", cell: (e) => <StatusPill status={e.status} /> },
    {
      header: "Why",
      cell: (e) => (
        <span className="block max-w-[320px] truncate text-gray-01" title={e.error}>
          {e.error || "-"}
        </span>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (e) => (e.status === "PROCESSED" || !can(P.PAY_REPLAY_WEBHOOK) ? null : (
        <button
          type="button"
          disabled={replaying}
          onClick={(ev) => { ev.stopPropagation(); void doReplay(e); }}
          className="inline-flex items-center gap-1 rounded-md border border-gray-03 px-2 py-1 font-mont text-[11px] text-gray-01 hover:bg-gray-03 disabled:opacity-50"
        >
          <RotateCcw className={cn("size-3.5", replayingId === e.id && "animate-spin")} />
          {replayingId === e.id ? "Retrying…" : "Retry"}
        </button>
      )),
    },
  ];

  const waiting = sum?.needs_attention ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Needs attention"
          value={waiting}
          tone={waiting ? "alert" : "default"}
          foot={waiting
            ? "Money moved at the provider but is not in the books"
            : "Nothing waiting"}
        />
        <KpiCard label="Failed to book" value={sum?.failed ?? 0} foot="We tried and could not" />
        <KpiCard label="Unmatched" value={sum?.ignored ?? 0} foot="Nothing local to attach it to" />
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-md border border-white-02 bg-white p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key || "default"}
            onClick={() => setStatus(f.key)}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 font-mont text-xs font-semibold",
              status === f.key ? "bg-primary text-white" : "text-gray-05 hover:bg-gray-50 hover:text-gray-01",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search reference"
          className="h-9 w-64 font-mont text-sm"
        />
        <div className="ml-auto">
          <Button variant="outline" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={isLoading || isFetching}
        error={isError}
        onRetry={refetch}
        page={pg?.currentPage}
        totalPages={pg?.totalPages}
        onPageChange={setPage}
        emptyTitle="Nothing needs attention"
        emptyMessage="Every provider event so far has been booked. Failures would appear here."
      />
    </div>
  );
}
