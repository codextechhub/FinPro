/**
 * Receivables → Receipts & Allocation. Customer receipts (manual + gateway) and
 * how much of each is applied to invoices. Prototype shape: KPIs (received today /
 * this week / unallocated / count), status + method filters, an avatar table with
 * each receipt's unallocated amount + status, Export, Record receipt, and a row-
 * click allocation drawer.
 */
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { Search, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { DataTable, TabStrip, toArray, type Column, type TabStripItem } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useGetPaymentsQuery, useGetPaymentSummaryQuery } from "@/redux/services/finance/ar-api";
import type { Payment } from "@/redux/services/finance/ar-types";
import { openPaymentReceipt } from "@/utils/finance-documents";
import { RecordReceiptDrawer } from "./record-receipt-drawer";
import { PaymentAllocationDrawer } from "./payment-allocation-drawer";

const STATUS_TABS = [
  { key: "", label: "All" }, { key: "ALLOCATED", label: "Allocated" },
  { key: "PARTIAL", label: "Partial" }, { key: "UNALLOCATED", label: "Unallocated" },
  { key: "REFUNDED", label: "Refunded" },
] as const;
const STATUS_PILL: Record<string, string> = {
  ALLOCATED: "bg-green-01/10 text-green-01", PARTIAL: "bg-blue-50 text-blue-700",
  UNALLOCATED: "bg-amber-50 text-amber-700", REFUNDED: "bg-gray-03/60 text-gray-01",
};
const STATUS_LABEL: Record<string, string> = {
  ALLOCATED: "Allocated", PARTIAL: "Partial", UNALLOCATED: "Unallocated",
  REFUNDED: "Refunded",
};
const METHODS = ["BANK_TRANSFER", "CASH", "CARD", "CHEQUE", "ONLINE", "OTHER"];
const methodLabel = (m: string) => m.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm focus:border-primary focus:outline-none";

function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[10px] font-semibold text-primary">{init || "-"}</span>;
}
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-xl font-semibold tabular-nums text-black-01">{value}</p>
      {hint && <p className="mt-0.5 font-mont text-[11px] text-gray-05">{hint}</p>}
    </div>
  );
}

export function ReceiptsAllocationTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_RECORD_PAYMENT), () => setNewOpen(true));
  const [selected, setSelected] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  // All filters are server-side; reset to page 1 when any of them changes.
  // Adjust during render (not an effect) so the reset lands in the same pass.
  const filterKey = `${search} ${status} ${method}`;
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }

  const listParams = useMemo(() => ({ entity, page, ...(search ? { search } : {}), ...(status ? { status } : {}), ...(method ? { method } : {}) }), [entity, page, search, status, method]);
  const { data, isLoading, isFetching, isError, refetch } = useGetPaymentsQuery(listParams);
  const { data: summaryRes } = useGetPaymentSummaryQuery({ entity, ...(search ? { search } : {}), ...(method ? { method } : {}) });
  const rows = toArray<Payment>(data?.data);
  const pg = data?.pagination;
  const sum = summaryRes?.data;
  const counts = sum?.status_counts ?? {};

  const openReceipt = async (id: number) => {
    try {
      await openPaymentReceipt(id, entity);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the receipt PDF.");
    }
  };

  const statusTabs: TabStripItem<string>[] = STATUS_TABS.map((t) => ({
    value: t.key,
    label: <>{t.label} <span className="ml-1 opacity-70">{t.key ? (counts[t.key] ?? 0) : (sum?.count ?? 0)}</span></>,
  }));

  const columns: Column<Payment>[] = [
    { header: "Receipt No.", cell: (p) => <span className="font-semibold">{p.document_number}</span> },
    { header: "Date", cell: (p) => <span className="tabular-nums text-gray-05">{p.payment_date}</span> },
    { header: "Customer", cell: (p) => <span className="inline-flex items-center gap-2"><Initials name={p.customer_name} /><span className="font-medium text-gray-01">{p.customer_name}</span></span> },
    { header: "Method", cell: (p) => <span className="rounded bg-gray-03/40 px-2 py-0.5 font-mont text-[11px] text-gray-01">{methodLabel(p.method)}</span> },
    { header: "Amount", align: "right", cell: (p) => <span className="block text-right tabular-nums">{formatMoney(p.amount, currency)}</span> },
    // Credit *remaining*, not merely unallocated. A receipt whose cash has been
    // refunded has nothing left to apply, and showing the gross unapplied figure here
    // is what made a refunded receipt look like available money.
    { header: "Unallocated", align: "right", cell: (p) => (p.credit_remaining ? (
      <span className="block text-right font-medium tabular-nums text-amber-700">{formatMoney(p.credit_remaining, currency)}</span>
    ) : p.refunded_amount ? (
      <span className="block text-right tabular-nums text-gray-05" title={`${formatMoney(p.refunded_amount, currency)} refunded to the customer`}>
        {formatMoney(0, currency)}
      </span>
    ) : <span className="block text-right text-gray-05">-</span>) },
    { header: "Refunded", align: "right", cell: (p) => (p.refunded_amount
      ? <span className="block text-right tabular-nums text-gray-01">{formatMoney(p.refunded_amount, currency)}</span>
      : <span className="block text-right text-gray-05">-</span>) },
    { header: "Status", cell: (p) => <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", STATUS_PILL[p.allocation_status])}>{STATUS_LABEL[p.allocation_status]}</span> },
    { header: "", align: "right", cell: (p) => (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void openReceipt(p.id); }}
        className="inline-flex items-center gap-1 rounded-md border border-gray-03 px-2 py-1 font-mont text-[11px] text-gray-01 hover:bg-gray-03"
      >
        <Printer className="size-3.5" /> PDF
      </button>
    ) },
  ];

  return (
    <div className="space-y-4" data-guide="finance-receipts.workspace">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-receipts.summary">
        <Kpi label="Received today" value={formatMoney(sum?.today.kobo ?? 0, currency)} />
        <Kpi label="This week" value={formatMoney(sum?.week.kobo ?? 0, currency)} hint="Last 7 days" />
        <Kpi
          label="Unallocated"
          value={formatMoney(sum?.unallocated.kobo ?? 0, currency)}
          hint={sum?.refunded.kobo
            ? `Sitting unapplied · ${formatMoney(sum.refunded.kobo, currency)} refunded out`
            : "Sitting unapplied"}
        />
        <Kpi label="Receipts" value={String(sum?.count ?? 0)} />
      </div>

      {/* The status strip sizes to its tabs, so the filters and actions share its line. */}
      <div className="flex flex-wrap items-center gap-2">
        <TabStrip items={statusTabs} value={status} onChange={setStatus} ariaLabel="Allocation status" />
        <div className="relative w-full min-w-0 sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search receipt / customer / ref" className="h-9 w-full pl-8 font-mont text-sm" />
        </div>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls} aria-label="Method">
          <option value="">All methods</option>
          {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Server-side export: the same filters over the whole set, not the 25 rows on this page. */}
          <QuickExportButton
            screen="finance.receipts"
            params={{ search, status, method }}
            entity={entity}
            typeface="geist"
            defaultName="Customer receipts"
          />
          <Can permission={P.FIN_RECORD_PAYMENT}>
            <Button onClick={() => setNewOpen(true)} className="gap-1.5" data-guide="finance-receipts.record"><Plus className="size-4" /> Record receipt</Button>
          </Can>
        </div>
      </div>

      <div data-guide="finance-receipts.list">
        <DataTable columns={columns} rows={rows} rowKey={(p) => p.id}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          onRowClick={(p) => setSelected(p.id)}
          page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
          emptyTitle="No receipts" emptyMessage="Recorded receipts will appear here." />
      </div>

      <RecordReceiptDrawer open={newOpen} onOpenChange={setNewOpen} entity={entity} currency={currency}
        onCreated={(id) => setSelected(id)} />
      <PaymentAllocationDrawer id={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}
