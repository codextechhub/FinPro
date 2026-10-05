/**
 * Receivables → Customers / Payers. The AR sub-ledger party register in the
 * prototype's shape: KPI cards (total / receivable / in-credit / overdue), search
 * + status filter, an avatar table with each customer's net balance and status,
 * a server-side Export, New customer, and a rich detail drawer (with the Customer Statement tab).
 */
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { Search, Plus, FileUp } from "lucide-react";
import { DataTable, toArray, type Column } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useGetCustomersQuery, useGetCustomerSummaryQuery } from "@/redux/services/finance/ar-api";
import type { Customer } from "@/redux/services/finance/ar-types";
import { NewCustomerDrawer } from "./new-customer-drawer";
import { CustomerDetailDrawer } from "./customer-detail-drawer";
import { OpeningImportDrawer } from "./opening-import-drawer";

const STATUS_TABS = [
  { key: "", label: "All" }, { key: "ACTIVE", label: "Active" }, { key: "OVERDUE", label: "Overdue" },
  { key: "CREDIT", label: "In credit" }, { key: "INACTIVE", label: "Inactive" },
] as const;
const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-green-01/10 text-green-01", OVERDUE: "bg-destructive/10 text-destructive",
  CREDIT: "bg-blue-50 text-blue-700", INACTIVE: "bg-gray-03/60 text-gray-05",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", OVERDUE: "Overdue", CREDIT: "In credit", INACTIVE: "Inactive" };

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

const statusOf = (c: Customer) => (!c.is_active ? "INACTIVE" : c.account_status ?? "ACTIVE");

/**
 * The mark on a payer's row: "Pays for 2" when the account pays other
 * customers' bills (a parent paying for two children, a sponsor), counting only
 * the customers the reader can see; nothing for anyone else.
 */
export function payerLabel(count: number | undefined): string | null {
  return count && count > 0 ? `Pays for ${count}` : null;
}

export function CustomersTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_CREATE_CUSTOMER), () => setNewOpen(true));
  const [selected, setSelected] = useState<number | null>(null);

  // Filters are server-side; reset to page 1 whenever search or status changes.
  // Adjust during render (not an effect) so the reset lands in the same pass.
  const filterKey = `${search}\u0000${status}`;
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }

  const listParams = useMemo(() => ({ entity, page, ...(search ? { search } : {}), ...(status ? { status } : {}) }), [entity, page, search, status]);
  const { data, isLoading, isFetching, isError, refetch } = useGetCustomersQuery(listParams);
  const { data: summaryRes } = useGetCustomerSummaryQuery({ entity, ...(search ? { search } : {}) });
  const rows = toArray<Customer>(data?.data);
  const pg = data?.pagination;
  const sum = summaryRes?.data;
  const counts = sum?.status_counts ?? {};

  const columns: Column<Customer>[] = [
    { header: "Code", cell: (c) => <span className="font-semibold tabular-nums">{c.code}</span> },
    { header: "Customer", cell: (c) => {
      const payer = payerLabel(c.pays_for_count);
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Initials name={c.name} /><span className="font-medium text-gray-01">{c.name}</span>
          {payer ? <span className="rounded bg-blue-50 px-2 py-0.5 font-mont text-[11px] font-medium text-blue-700" title="This account pays other customers' bills">{payer}</span> : null}
        </span>
      );
    } },
    { header: "Contact", cell: (c) => <span className="text-gray-05">{c.billing_email || c.billing_phone || "-"}</span> },
    { header: "Balance", align: "right", cell: (c) => {
      const bal = c.balance ?? 0;
      if (bal === 0) return <span className="text-gray-05">-</span>;
      return bal < 0
        ? <span className="block text-right tabular-nums text-green-01">{formatMoney(-bal, currency)} cr</span>
        : <span className="block text-right tabular-nums">{formatMoney(bal, currency)}</span>;
    } },
    { header: "Status", cell: (c) => { const s = statusOf(c); return <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium", STATUS_PILL[s])}>{STATUS_LABEL[s]}</span>; } },
  ];

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total customers" value={String(sum?.total ?? 0)} />
        <Kpi label="Total receivable" value={formatMoney(sum?.receivable.kobo ?? 0, currency)} hint="Across open invoices" />
        <Kpi label="Customers in credit" value={String(sum?.on_credit ?? 0)} />
        <Kpi label="Overdue accounts" value={String(sum?.overdue ?? 0)} />
      </div>

      {/* status tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-white-02 bg-white p-1">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={cn("rounded-md px-3 py-1.5 font-mont text-xs font-semibold", status === t.key ? "bg-primary text-white" : "text-gray-05 hover:bg-gray-50 hover:text-gray-01")}>
            {t.label} <span className="ml-1 opacity-70">{t.key ? (counts[t.key] ?? 0) : (sum?.total ?? 0)}</span>
          </button>
        ))}
      </div>

      {/* search + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search code or name" className="h-9 w-64 pl-8 font-mont text-sm" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Was a client-side CSV of the current page that wrote billing_email
              and billing_phone straight out of the row. Those are `sensitive` on
              the customers dataset and need exports.sensitive_field.export - a
              gate a CSV built in the browser cannot apply. The server-side
              export both covers every matching row and honours the gate. */}
          <QuickExportButton
            screen="finance.customers"
            params={{ search, status }}
            entity={entity}
            typeface="geist"
            defaultName="Customer master"
          />
          <Can permission={P.FIN_IMPORT_OPENING_CUSTOMERS}>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5"><FileUp className="size-4" /> Import opening balances</Button>
          </Can>
          <Can permission={P.FIN_CREATE_CUSTOMER}>
            <Button onClick={() => setNewOpen(true)} className="gap-1.5"><Plus className="size-4" /> New customer</Button>
          </Can>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(c) => c.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={(c) => setSelected(c.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No customers" emptyMessage="Customers / payers will appear here." />

      <NewCustomerDrawer open={newOpen} onOpenChange={setNewOpen} entity={entity} />
      <OpeningImportDrawer open={importOpen} onClose={() => setImportOpen(false)} entity={entity} currency={currency} />
      <CustomerDetailDrawer id={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}
