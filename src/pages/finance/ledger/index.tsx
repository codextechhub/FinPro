// General Ledger / Journal Entries (§6.2) - design topology in the house theme:
// status tabs with counts, source + period filters, search, a Total-Debit /
// Created-By table, and a posted-total footer. Read-only list + detail drawer +
// the Reverse action; Direct Entry is the only raw-lines post ("New journal").

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Plus, Search } from "lucide-react";
import { FinanceShell } from "../finance-shell";
import { DataTable, InfoHint, Money, StatusPill, useActiveEntity, type Column } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { Can } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "../../../host";
import { useDebounce } from "@/hooks/use-debounce";
import { useActionParam } from "@/hooks/use-action-param";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "@/permissions";
import { useGetJournalsQuery, useGetJournalSummaryQuery } from "@/redux/services/finance/gl-api";
import type { JournalListItem, JournalSource, JournalStatus } from "@/redux/services/finance/gl-types";
import { DirectEntryDrawer } from "./direct-entry-drawer";
import { JournalDetailDrawer } from "./journal-detail-drawer";
import { PageShell } from "@/components/layout/page-shell";

const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm text-black-01 focus:border-primary focus:outline-none";
const SOURCES: JournalSource[] = ["MANUAL", "SALES", "PURCHASE", "BANK", "PAYROLL", "CLOSING", "OPENING", "FX", "SYSTEM"];
const STATUS_TABS: { key: JournalStatus; label: string }[] = [
  { key: "DRAFT", label: "Drafts" },
  { key: "PENDING_APPROVAL", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "POSTED", label: "Posted" },
  { key: "REVERSED", label: "Reversed" },
  { key: "CANCELLED", label: "Cancelled" },
];
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "this-month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (preset === "last-month") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (preset === "ytd") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  return { from: "", to: "" };
}

export default function GeneralLedgerPage() {
  const [searchParams] = useSearchParams();
  const { code: entity, currency } = useActiveEntity();
  const [status, setStatus] = useState<JournalStatus | "">("");
  const [source, setSource] = useState<JournalSource | "">("");
  const [preset, setPreset] = useState("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const search = useDebounce(searchInput.trim(), 350);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [directOpen, setDirectOpen] = useState(false);
  useActionParam("new", () => setDirectOpen(true));

  const range = preset === "custom" ? custom : presetRange(preset);
  const filters = useMemo(() => ({
    entity: entity!,
    ...(source ? { source } : {}),
    ...(range.from ? { date_from: range.from } : {}),
    ...(range.to ? { date_to: range.to } : {}),
    ...(search ? { search } : {}),
  }), [entity, source, range.from, range.to, search]);

  const { data, isLoading, isFetching, isError, refetch } = useGetJournalsQuery(
    { ...filters, page, ...(status ? { status } : {}) }, { skip: !entity },
  );
  const summaryQ = useGetJournalSummaryQuery(filters, { skip: !entity });
  const summary = summaryQ.data?.data;
  const rows = data?.data ?? [];
  const pg = data?.pagination;

  const count = (key?: JournalStatus) => key ? (summary?.by_status?.[key] ?? 0) : (summary?.total ?? 0);

  const columns: Column<JournalListItem>[] = [
    { header: "Journal No.", cell: (j) => <span className="font-semibold">{j.document_number}</span> },
    { header: "Date", cell: (j) => j.date },
    { header: "Period", cell: (j) => j.period ?? "-" },
    { header: "Source", cell: (j) => cap(j.source) },
    { header: "Reference", cell: (j) => <span className="block max-w-xs truncate text-gray-01">{j.narration || j.reference || "-"}</span> },
    { header: "Total Debit", align: "right", cell: (j) => <Money kobo={j.total_debit} currency={currency} align="right" /> },
    { header: "Status", cell: (j) => <StatusPill status={j.status} /> },
    { header: "Created By", cell: (j) => (
      <span className="inline-flex items-center gap-2">
        <UserAvatar userId={j.created_by_id ?? undefined} name={j.created_by} className="size-6" fallbackClassName="text-[9px] font-semibold" />
        <span className="text-gray-01">{j.created_by}</span>
      </span>
    ) },
  ];

  if (!entity) {
    return (
      <FinanceShell>
        <PageShell><EmptyState title="Select an entity" message="Choose a ledger entity to view its journals." /></PageShell>
      </FinanceShell>
    );
  }

  const tabBtn = (active: boolean) => cn(
    "rounded-md px-3 py-1.5 font-mont text-xs font-semibold",
    active ? "bg-primary text-white" : "text-gray-05 hover:bg-gray-50 hover:text-gray-01",
  );

  return (
    <FinanceShell>
      <PageShell className="space-y-4 text-black-01" data-guide="finance-ledger.workspace">
        <div data-guide="finance-ledger.header" className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Journal Entries</h1>
              <InfoHint ariaLabel="About journal entries">
                Every journal must balance: total debits = total credits. Most come from subsystems automatically (invoices, payroll, bank); the Manual source is for adjustments, accruals and corrections. Posted journals are read-only.
              </InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">The general ledger - every financial mutation lands here as a balanced Dr/Cr posting.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* The screen lists one row per ENTRY; the postings dataset produces
                one row per LINE, so the row count in the drawer will exceed what
                is on screen. That is the dataset a trial balance needs. */}
            <QuickExportButton
              screen="finance.gl_postings"
              params={{ status, source, date_from: range.from, date_to: range.to, search }}
              entity={entity}
              typeface="geist"
              defaultName="General ledger postings"
            />
            <Can permission={P.FIN_POST_DIRECT_ENTRY}>
              <Button data-guide="finance-ledger.new-journal" onClick={() => setDirectOpen(true)} className="gap-1.5"><Plus className="size-4" /> New journal</Button>
            </Can>
          </div>
        </div>

        {/* Status tabs with counts */}
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-white-02 bg-white p-1">
          <button onClick={() => { setStatus(""); setPage(1); }} className={tabBtn(status === "")}>All <span className="ml-1 opacity-70">{count()}</span></button>
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => { setStatus(t.key); setPage(1); }} className={tabBtn(status === t.key)}>
              {t.label} <span className="ml-1 opacity-70">{count(t.key)}</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
            <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} placeholder="Search journal no / reference" className="h-9 w-64 pl-8 font-mont text-sm" />
          </div>
          <select value={source} onChange={(e) => { setSource(e.target.value as JournalSource | ""); setPage(1); }} className={selectCls} aria-label="Source">
            <option value="">All sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
          </select>
          <select value={preset} onChange={(e) => { setPreset(e.target.value); setPage(1); }} className={selectCls} aria-label="Period">
            <option value="all">All time</option>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom range</option>
          </select>
          {preset === "custom" && (
            <>
              <Input type="date" value={custom.from} onChange={(e) => { setCustom((c) => ({ ...c, from: e.target.value })); setPage(1); }} aria-label="From" className="h-9 w-36 bg-white" />
              <Input type="date" value={custom.to} onChange={(e) => { setCustom((c) => ({ ...c, to: e.target.value })); setPage(1); }} aria-label="To" className="h-9 w-36 bg-white" />
            </>
          )}
        </div>

        <DataTable
          columns={columns} rows={rows} rowKey={(j) => j.id}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          onRowClick={(j) => setSelected(j.id)}
          emptyTitle="No journals" emptyMessage="No journal entries match these filters."
          page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        />

        {summary && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-4 py-2.5 font-mont text-xs text-gray-05">
            <span>{summary.total} entries</span>
            <span className="flex gap-4">
              <span>Posted total: <span className="font-semibold text-black-01">{formatMoney(summary.posted_total.kobo, currency)}</span></span>
              <span>Reversed total: <span className="font-semibold text-black-01">{formatMoney(summary.reversed_total.kobo, currency)}</span></span>
            </span>
          </div>
        )}
      </PageShell>

      <DirectEntryDrawer open={directOpen} onClose={() => setDirectOpen(false)} entity={entity} currency={currency} />
      <JournalDetailDrawer journalId={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
    </FinanceShell>
  );
}
