/**
 * Receivables → Customer Invoices. Design topology in the house theme: KPI cards
 * (invoiced / collected / collection rate / overdue), status tabs with counts,
 * search, a Customer-avatar table with a derived status pill, and a totals footer.
 * Keeps the detail drawer + the write-off action.
 */

import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Search, ArrowUp, ArrowDown, Layers, Plus } from "lucide-react";
import { DataTable, Money, ConfirmActionModal, InfoHint, TabStrip, toArray, kpiValueClass, type Column, type TabStripItem } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useGetInvoicesQuery, useGetInvoiceSummaryQuery, useWriteOffInvoiceMutation } from "@/redux/services/finance/ar-api";
import type { Invoice } from "@/redux/services/finance/ar-types";
import { InvoiceDetailDrawer } from "./invoice-detail-drawer";
import { BatchGenerateModal } from "./batch-generate-modal";
import { NewInvoiceDrawer } from "./new-invoice-drawer";
import { todayISO } from "@/utils/posting-window";

const TABS = [
  { key: "", label: "All" }, { key: "draft", label: "Draft" }, { key: "issued", label: "Issued" },
  { key: "partial", label: "Partial" }, { key: "paid", label: "Paid" }, { key: "overdue", label: "Overdue" },
] as const;
const STATUS_PILL: Record<string, string> = {
  DRAFT: "bg-gray-03/60 text-gray-05", ISSUED: "bg-blue-50 text-blue-700",
  PARTIAL: "bg-amber-50 text-amber-700", PAID: "bg-green-01/10 text-green-01",
  OVERDUE: "bg-destructive/10 text-destructive",
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", ISSUED: "Issued", PARTIAL: "Partially Paid", PAID: "Paid", OVERDUE: "Overdue",
};

function derivedStatus(i: Invoice): string {
  if (i.status === "DRAFT") return "DRAFT";
  if (i.status !== "POSTED") return i.status;
  if (i.payment_status === "PAID") return "PAID";
  if (i.due_date && i.due_date < todayISO()) return "OVERDUE";
  if (i.payment_status === "PARTIAL") return "PARTIAL";
  return "ISSUED";
}
const pctChange = (arr: number[]) => {
  const a = arr[arr.length - 1], b = arr[arr.length - 2];
  return b ? ((a - b) / Math.abs(b)) * 100 : null;
};

function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[10px] font-semibold text-primary">{init || "-"}</span>;
}

function Kpi({ label, value, delta, deltaIsPoints }: {
  label: string; value: string; delta: number | null; deltaIsPoints?: boolean;
}) {
  const up = (delta ?? 0) >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className={cn("mt-2 font-mont font-semibold tabular-nums text-black-01", kpiValueClass(value))}>{value}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {delta == null ? <span className="font-mont text-[11px] text-gray-05">-</span> : (
          <span className={cn("inline-flex items-center gap-0.5 font-mont text-[11px] font-semibold", up ? "text-green-01" : "text-destructive")}>
            <Icon className="size-3" />{up ? "+" : ""}{delta.toFixed(1)}{deltaIsPoints ? "pp" : "%"}
          </span>
        )}
        <span className="font-mont text-[11px] text-gray-05">vs prior month</span>
      </div>
    </div>
  );
}

export function InvoicesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [bucket, setBucket] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [writeOff, setWriteOff] = useState(false);
  const [reason, setReason] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_CREATE_INVOICE), () => setNewOpen(true));

  const params = useMemo(() => ({ entity, page, ...(bucket ? { bucket } : {}), ...(search ? { search } : {}) }), [entity, page, bucket, search]);
  const { data, isLoading, isFetching, isError, refetch } = useGetInvoicesQuery(params);
  const summaryQ = useGetInvoiceSummaryQuery({ entity, ...(search ? { search } : {}) });
  const summary = summaryQ.data?.data;
  const [doWriteOff, { isLoading: writingOff }] = useWriteOffInvoiceMutation();

  const rows = toArray<Invoice>(data?.data);
  const pg = data?.pagination;
  const count = (key: string) => key ? (summary?.by_status?.[key as "draft"] ?? 0) : (summary?.totals.count ?? summary?.by_status?.total ?? 0);

  const inv = summary?.monthly.map((m) => m.invoiced) ?? [];
  const col = summary?.monthly.map((m) => m.collected) ?? [];
  const rate = summary?.monthly.map((m) => (m.invoiced ? (m.collected / m.invoiced) * 100 : 0)) ?? [];

  const submitWriteOff = async () => {
    if (!selected) return;
    try {
      const res = await doWriteOff({ id: selected.id, entity, narration: reason, reason }).unwrap();
      toast.success(res.message || ("invoice_id" in res.data ? "Write-off request created." : "Invoice written off."));
      setWriteOff(false); setReason(""); setSelected(null);
    } catch { /* central */ }
  };

  const bucketTabs: TabStripItem<string>[] = TABS.map((t) => ({
    value: t.key,
    label: <>{t.label} <span className="ml-1 opacity-70">{count(t.key)}</span></>,
  }));

  const columns: Column<Invoice>[] = [
    { header: "Invoice No.", cell: (r) => <span className="font-semibold">{r.document_number}</span> },
    { header: "Customer", cell: (r) => (
      <span className="inline-flex items-center gap-2">
        <Initials name={r.customer_name} />
        <span className="font-medium text-gray-01">{r.customer_name}</span>
      </span>
    ) },
    { header: "Invoice date", cell: (r) => <span className="tabular-nums">{r.invoice_date}</span> },
    { header: "Due date", cell: (r) => <span className="tabular-nums">{r.due_date ?? "-"}</span> },
    { header: "Total", align: "right", cell: (r) => <Money kobo={r.total} currency={currency} align="right" /> },
    { header: "Paid", align: "right", cell: (r) => r.amount_paid ? <Money kobo={r.amount_paid} currency={currency} align="right" /> : <span className="text-gray-05">-</span> },
    { header: "Balance", align: "right", cell: (r) => <Money kobo={r.balance_due} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => { const s = derivedStatus(r); return <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", STATUS_PILL[s] ?? "bg-gray-03/60 text-gray-05")}>{STATUS_LABEL[s] ?? s}</span>; } },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="font-mont text-lg font-semibold text-gray-01">Customer Invoices</h1>
          <InfoHint ariaLabel="About customer invoices">Customer invoices debit Accounts Receivable and credit revenue on posting. A payment is recorded against the invoice; the AR control account must equal the sum of open invoice balances - a tie reconciled at period close.</InfoHint>
        </div>
        <p className="mt-0.5 font-mont text-xs text-gray-05">Accounts receivable for the selected entity.</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total invoiced" value={formatMoney(summary?.kpis.total_invoiced.kobo ?? 0, currency)} delta={pctChange(inv)} />
        <Kpi label="Total collected" value={formatMoney(summary?.kpis.total_collected.kobo ?? 0, currency)} delta={pctChange(col)} />
        <Kpi label="Collection rate" value={`${(summary?.kpis.collection_rate ?? 0).toFixed(1)}%`} delta={rate.length > 1 ? rate[rate.length - 1] - rate[rate.length - 2] : null} deltaIsPoints />
        <Kpi label="Overdue balance" value={formatMoney(summary?.kpis.overdue_balance.kobo ?? 0, currency)} delta={null} />
      </div>

      {/* The bucket strip sizes to its tabs, so search and the actions share its line. */}
      <div className="flex flex-wrap items-center gap-2">
        <TabStrip
          items={bucketTabs}
          value={bucket}
          onChange={(next) => { setBucket(next); setPage(1); }}
          ariaLabel="Invoice status"
        />
        <div className="relative w-full min-w-0 sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} placeholder="Search invoice no / customer" className="h-9 w-full pl-8 font-mont text-sm" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Screen params, not export filter ids: the backend binding is what knows `bucket=overdue` is a due-date window. */}
          <QuickExportButton
            screen="finance.invoices"
            params={{ bucket, search }}
            entity={entity}
            typeface="geist"
            defaultName="Customer invoices"
          />
          <Can permission={P.FIN_GENERATE_FEE_STRUCTURE}>
            <Button variant="outline" onClick={() => setBatchOpen(true)} className="gap-1.5">
              <Layers className="size-4" /> Batch generate
            </Button>
          </Can>
          <Can permission={P.FIN_CREATE_INVOICE}>
            <Button onClick={() => setNewOpen(true)} className="gap-1.5">
              <Plus className="size-4" /> New invoice
            </Button>
          </Can>
        </div>
      </div>

      <div data-guide="finance-invoices.list">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          onRowClick={setSelected}
          emptyTitle="No invoices" emptyMessage="No invoices match these filters."
          page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage} />
      </div>

      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-4 py-2.5 font-mont text-xs text-gray-05">
          <span>{summary.totals.count} invoices</span>
          <span className="flex gap-4">
            <span>Total <span className="font-semibold text-black-01">{formatMoney(summary.totals.total.kobo, currency)}</span></span>
            <span>Outstanding <span className="font-semibold text-black-01">{formatMoney(summary.totals.outstanding.kobo, currency)}</span></span>
          </span>
        </div>
      )}

      <InvoiceDetailDrawer
        id={selected?.id ?? null}
        entity={entity}
        currency={currency}
        onClose={() => setSelected(null)}
        onWriteOff={() => setWriteOff(true)}
      />

      <BatchGenerateModal open={batchOpen} onOpenChange={setBatchOpen} entity={entity} />
      <NewInvoiceDrawer open={newOpen} onOpenChange={setNewOpen} entity={entity} currency={currency} />

      <ConfirmActionModal
        open={writeOff}
        onOpenChange={setWriteOff}
        title="Write off invoice balance?"
        description={`Books the outstanding balance of ${selected?.document_number} as bad debt.`}
        confirmText="Write off"
        destructive
        loading={writingOff}
        confirmDisabled={!reason.trim()}
        onConfirm={submitWriteOff}
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for write-off (required)" className="bg-white" />
      </ConfirmActionModal>
    </div>
  );
}
