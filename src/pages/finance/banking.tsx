/**
 * Banking & reconciliation (§6.5), redesigned to the Vision prototype in the
 * house theme: KPIs, a bank-accounts table (account number FLS-masked, Primary
 * badge, book balance, last reconciled), and a tabbed detail drawer
 * (Transactions · Statement lines · Statements · Reconciliations · Settings)
 * with Book/Statement/Unreconciled metric cards, Import statement and
 * Auto-reconcile.
 *
 * Honest adaptations: the prototype's "Cash books / petty cash" lives on the
 * separate Petty Cash screen; USD-position / cash-on-hand KPIs (FX + petty cash)
 * are dropped. We store statement *lines*, grouped under imported Statements.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useActionParam } from "@/hooks/use-action-param";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Plus, Search, Trash2, Upload, RefreshCw, ListChecks, FileText, History, Settings as SettingsIcon, ArrowLeftRight, ChevronDown, Rows3, FileSpreadsheet, Download, Pencil } from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { DataTable, DetailDrawer, Money, StatusPill, FormField, AccountPicker, CurrencyPicker, InfoHint, ConfirmActionModal, TabStrip, useActiveEntity, toArray, type Column, type TabStripItem } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { EmptyState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ImportWizard from "@/components/custom/import-wizard";
import {
  ImportCancelDialog,
  ImportProcessDrawer,
} from "@/components/custom/bulk-import-drawer";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import { isStripped } from "@/utils/fls";
import {
  useGetBankAccountsQuery, useGetBankAccountQuery, useCreateBankAccountMutation,
  useUpdateBankAccountMutation, useGetStatementLinesQuery, useImportStatementMutation,
  useAutoReconcileMutation, useUploadBankStatementBatchMutation,
  useDownloadBankStatementTemplateMutation, useGetBankStatementQuery,
  useUpdateBankStatementMutation, useDeleteBankStatementLineMutation,
} from "@/redux/services/finance/ops-api";
import type { BankAccount, BankStatementDetail } from "@/redux/services/finance/ops-types";
import { useCancelImportBatchMutation } from "@/redux/services/dashboard/import-api";
import { baseApi } from "@/redux/services/base-api";
import { useAppDispatch } from "@/redux/store";
import { routesPath } from "@/routes/routes-path";
import { todayISO } from "@/utils/posting-window";
import { PageShell } from "@/components/layout/page-shell";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "-");
const partialMask = (n: string) => {
  const s = n.replace(/\s+/g, "");
  return s.length <= 4 ? s : `${s.slice(0, 4)} **** ${s.slice(-4)}`;
};
// Detail-drawer subtitle keeps the full (sensitive) number; the list uses partial.
const maskedNumber = (a: { account_number?: string; _stripped_fields?: string[] }) =>
  isStripped(a, "account_number") ? "••••" : (a.account_number || "-");
const listAcctNo = (a: { account_number?: string; _stripped_fields?: string[] }) =>
  isStripped(a, "account_number") ? "••••" : (a.account_number ? partialMask(a.account_number) : "-");

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-xl font-semibold tabular-nums text-black-01">{value}</p>
      {hint && <p className="mt-0.5 font-mont text-[11px] text-gray-05">{hint}</p>}
    </div>
  );
}

export default function BankingPage() {
  const { code: entity, currency } = useActiveEntity();
  const [selected, setSelected] = useState<BankAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_CREATE_BANK_ACCOUNT), () => setCreating(true));
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim().toLowerCase(), 250);

  const { data, isLoading, isFetching, isError, refetch } = useGetBankAccountsQuery(
    { entity: entity! }, { skip: !entity });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const filtered = useMemo(() => !search ? rows : rows.filter((a) =>
    a.name.toLowerCase().includes(search) || (a.bank_name || "").toLowerCase().includes(search)
    || (a.gl_account || "").toLowerCase().includes(search)
    || (a.account_number || "").toLowerCase().includes(search)), [rows, search]);

  const kpis = useMemo(() => {
    const total = rows.reduce((s, a) => s + (a.book_balance || 0), 0);
    const active = rows.filter((a) => a.is_active).length;
    const unrec = rows.reduce((s, a) => s + (a.unreconciled_count || 0), 0);
    const last = rows.map((a) => a.last_reconciled_at).filter(Boolean).sort().pop() ?? null;
    return { total, active, unrec, last };
  }, [rows]);

  const columns: Column<BankAccount>[] = [
    { header: "Account", cell: (a) => (
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-01">{a.name}</span>
          {a.is_primary ? <span className={cn(PILL, "bg-blue-50 text-blue-700")}>Primary</span> : null}
          {a.is_primary_collection ? <span className={cn(PILL, "bg-green-01/10 text-green-01")}>Collection</span> : null}
        </div>
        <div className="mt-0.5 font-mont text-[11px] tabular-nums text-gray-05">A/C {listAcctNo(a)}</div>
      </div>
    ) },
    { header: "GL", cell: (a) => <span className="tabular-nums text-gray-05">{a.gl_account}</span> },
    { header: "Currency", cell: (a) => a.currency ?? "-" },
    { header: "Book balance", align: "right", cell: (a) => <Money kobo={a.book_balance} currency={currency} align="right" /> },
    { header: "Last reconciled", cell: (a) => <span className="tabular-nums text-gray-05">{fmtDate(a.last_reconciled_at)}</span> },
    { header: "Status", cell: (a) => <StatusPill status={a.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  if (!entity) {
    return <FinanceShell><PageShell><EmptyState title="Select an entity" /></PageShell></FinanceShell>;
  }

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Bank Accounts</h1>
              <InfoHint ariaLabel="About bank accounts">Each bank account maps 1:1 to a GL cash account - the ledger's book balance. Import the bank's statement and reconcile to explain every difference (in-flight items, charges); auto-reconcile pairs lines by amount and date.</InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">Bank accounts, statement import and reconciliation.</p>
          </div>
          <Can permission={P.FIN_CREATE_BANK_ACCOUNT}>
            <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New bank account</Button>
          </Can>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Total bank balance" value={formatMoney(kpis.total, currency)} hint="Across active accounts" />
          <Kpi label="Active accounts" value={String(kpis.active)} />
          <Kpi label="Unreconciled lines" value={String(kpis.unrec)} hint="Awaiting a match" />
          <Kpi label="Last reconciled" value={fmtDate(kpis.last)} />
        </div>

        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, bank or GL" className="h-9 bg-white pl-8 font-mont" />
        </div>

        <DataTable
          columns={columns} rows={filtered} rowKey={(a) => a.id}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          onRowClick={setSelected}
          emptyTitle={search ? "No matching accounts" : "No bank accounts"}
          emptyMessage={search ? "Try a different search." : "Add a bank account to import statements and reconcile."}
        />
      </PageShell>

      <BankAccountDrawer account={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
      <CreateBankAccountModal open={creating} onClose={() => setCreating(false)} entity={entity} />
    </FinanceShell>
  );
}

const TABS = [
  { key: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { key: "lines", label: "Statement lines", icon: ListChecks },
  { key: "statements", label: "Statements", icon: FileText },
  { key: "reconciliations", label: "Reconciliations", icon: History },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

/** Drawer sections for the tab strip, built once so the sliding bar re-measures only when the active tab changes. */
const TAB_ITEMS: TabStripItem<(typeof TABS)[number]["key"]>[] = TABS.map((t) => ({
  value: t.key,
  label: <><t.icon className="size-3.5" /> {t.label}</>,
}));

function MetricCard({ label, kobo, currency, danger }: { label: string; kobo: number; currency?: string | null; danger?: boolean }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-base font-semibold tabular-nums", danger && kobo !== 0 ? "text-destructive" : "text-black-01")}>{formatMoney(kobo, currency)}</p>
    </div>
  );
}

function BankAccountDrawer({ account, entity, currency, onClose }: { account: BankAccount | null; entity: string; currency?: string | null; onClose: () => void }) {
  const { can } = useCan();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("transactions");
  const [importing, setImporting] = useState<"manual" | "bulk" | null>(null);
  const [editingStatement, setEditingStatement] = useState<number | null>(null);
  const { data } = useGetBankAccountQuery(account ? { id: account.id, entity } : skipToken);
  const detail = data?.data;
  const [reconcile, { isLoading: reconciling }] = useAutoReconcileMutation();
  if (!account) return null;

  const m = detail?.metrics;
  const doReconcile = async () => {
    try {
      const res = await reconcile({ id: account.id, entity }).unwrap();
      toast.success(res.message || "Auto-reconcile complete.");
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open={!!account} onOpenChange={(o) => (o ? undefined : onClose())}
        title={account.name}
        description={`${account.bank_name || "-"} · ${account.gl_account} · ${maskedNumber(account)}`}
        widthClass="sm:max-w-3xl"
        footer={
          <>
            <StatusPill status={account.is_active ? "ACTIVE" : "INACTIVE"} />
            <div className="flex-1" />
            <Can permission={P.FIN_IMPORT_BANK}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5">
                    <Upload className="size-4" /> Import statement
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => setImporting("manual")} className="cursor-pointer">
                    <Rows3 className="size-4" />
                    Manual import
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setImporting("bulk")} className="cursor-pointer">
                    <FileSpreadsheet className="size-4" />
                    Bulk import
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
            <Can permission={P.FIN_RECONCILE_BANK}>
              <Button onClick={doReconcile} disabled={reconciling} className="gap-1.5"><RefreshCw className="size-4" />{reconciling ? "Reconciling…" : "Auto-reconcile"}</Button>
            </Can>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Book balance" kobo={m?.book_balance ?? account.book_balance} currency={currency} />
            <MetricCard label="Statement balance" kobo={m?.statement_balance ?? 0} currency={currency} />
            <MetricCard label="Unreconciled diff" kobo={m?.unreconciled_diff ?? 0} currency={currency} danger />
          </div>

          <TabStrip
            items={TAB_ITEMS}
            value={tab}
            onChange={setTab}
            variant="underline"
            ariaLabel="Bank account sections"
            className="w-full gap-1"
            buttonClassName="inline-flex items-center gap-1.5 px-3 py-2 font-semibold"
          />

          {tab === "transactions" && <TransactionsTab detail={detail} currency={currency} />}
          {tab === "lines" && <StatementLinesTab id={account.id} entity={entity} currency={currency} />}
          {tab === "statements" && (
            <StatementsTab
              detail={detail}
              currency={currency}
              canEdit={can(P.FIN_IMPORT_BANK)}
              onEdit={setEditingStatement}
            />
          )}
          {tab === "reconciliations" && <ReconciliationsTab detail={detail} currency={currency} />}
          {tab === "settings" && <SettingsTab account={account} entity={entity} canEdit={can(P.FIN_UPDATE_BANK_ACCOUNT)} />}
        </div>
      </DetailDrawer>

      {importing === "manual" ? (
        <ImportStatementDrawer id={account.id} entity={entity} onClose={() => setImporting(null)} />
      ) : null}
      {importing === "bulk" ? (
        <BulkImportStatementDrawer
          id={account.id}
          entity={entity}
          onClose={() => setImporting(null)}
        />
      ) : null}
      {editingStatement !== null ? (
        <EditStatementDrawer
          id={account.id}
          statementId={editingStatement}
          entity={entity}
          currency={currency}
          onClose={() => setEditingStatement(null)}
        />
      ) : null}
    </>
  );
}

function TransactionsTab({ detail, currency }: { detail?: { transactions: import("@/redux/services/finance/ops-types").BankTransaction[] }; currency?: string | null }) {
  const txns = detail?.transactions ?? [];
  if (txns.length === 0) return <EmptyState title="No transactions" message="Posted movements on this account's GL appear here." />;
  return (
    <div className="overflow-hidden rounded-md border border-white-02">
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={thCls}>Date</th><th className={thCls}>Description</th><th className={thCls}>Reference</th>
          <th className={cn(thCls, "text-right")}>Debit</th><th className={cn(thCls, "text-right")}>Credit</th>
          <th className={cn(thCls, "text-right")}>Balance</th><th className={thCls} />
        </tr></thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id}>
              <td className={cn(tdCls, "tabular-nums text-gray-05")}>{fmtDate(t.date)}</td>
              <td className={tdCls}>{t.description}</td>
              <td className={cn(tdCls, "tabular-nums text-gray-05")}>{t.reference || "-"}</td>
              <td className={cn(tdCls, "text-right tabular-nums")}>{t.debit ? <span className="text-black-01">{formatMoney(t.debit, currency)}</span> : <span className="text-gray-05">-</span>}</td>
              <td className={cn(tdCls, "text-right tabular-nums text-green-01")}>{t.credit ? formatMoney(t.credit, currency) : <span className="text-gray-05">-</span>}</td>
              <td className={cn(tdCls, "text-right tabular-nums font-medium")}>{formatMoney(t.running_balance, currency)}</td>
              <td className={cn(tdCls, "text-center")}>{t.matched ? <span title="Reconciled" className="text-green-01">✓</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatementLinesTab({ id, entity, currency }: { id: number; entity: string; currency?: string | null }) {
  const { can } = useCan();
  const { data, isFetching } = useGetStatementLinesQuery({ id, entity });
  const [deleting, setDeleting] = useState<import("@/redux/services/finance/ops-types").BankStatementLine | null>(null);
  const [deleteLine, { isLoading: isDeleting }] = useDeleteBankStatementLineMutation();
  const lines = useMemo(() => toArray(data?.data), [data]);
  const canDelete = can(P.FIN_IMPORT_BANK);
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const response = await deleteLine({ id: deleting.id, entity }).unwrap();
      toast.success(response.message || "Statement line deleted.");
      setDeleting(null);
    } catch { /* central */ }
  };
  if (isFetching && lines.length === 0) return <p className="font-mont text-sm text-gray-05">Loading…</p>;
  if (lines.length === 0) return <EmptyState title="No statement lines" message="Import a statement to begin reconciling." />;
  return (
    <>
      <div className="overflow-hidden rounded-md border border-white-02">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={thCls}>Date</th><th className={thCls}>Description</th><th className={thCls}>Reference</th>
            <th className={cn(thCls, "text-right")}>Amount</th><th className={thCls}>Status</th>
            {canDelete ? <th className={thCls} /> : null}
          </tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className={cn(tdCls, "tabular-nums text-gray-05")}>{l.txn_date}</td>
                <td className={tdCls}>{l.description || "-"}</td>
                <td className={cn(tdCls, "tabular-nums text-gray-05")}>{l.reference || "-"}</td>
                <td className={cn(tdCls, "text-right tabular-nums", l.amount < 0 ? "text-destructive" : "text-black-01")}>{formatMoney(l.amount, currency)}</td>
                <td className={tdCls}><StatusPill status={l.status} /></td>
                {canDelete ? (
                  <td className={cn(tdCls, "text-right")}>
                    <button
                      type="button"
                      onClick={() => setDeleting(l)}
                      disabled={!l.can_delete}
                      title={l.delete_block_reason || "Delete statement line"}
                      aria-label={`Delete statement line ${l.description || l.reference || l.id}`}
                      className="rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmActionModal
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete statement line?"
        description="This removes the incorrect unreconciled line and recalculates the statement closing balance. If it is the final line, the empty statement is also removed. The deletion remains recorded in the finance audit trail."
        confirmText="Delete line"
        destructive
        loading={isDeleting}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function StatementsTab({
  detail,
  currency,
  canEdit,
  onEdit,
}: {
  detail?: { statements: import("@/redux/services/finance/ops-types").BankStatement[] };
  currency?: string | null;
  canEdit: boolean;
  onEdit: (statementId: number) => void;
}) {
  const sts = detail?.statements ?? [];
  if (sts.length === 0) return <EmptyState title="No statements" message="Imported statement batches appear here." />;
  return (
    <div className="overflow-hidden rounded-md border border-white-02">
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={thCls}>Statement date</th><th className={thCls}>Period</th>
          <th className={cn(thCls, "text-right")}>Opening</th><th className={cn(thCls, "text-right")}>Closing</th>
          <th className={cn(thCls, "text-right")}>Lines</th><th className={thCls}>Status</th>
          {canEdit ? <th className={thCls} /> : null}
        </tr></thead>
        <tbody>
          {sts.map((s) => (
            <tr key={s.id}>
              <td className={cn(tdCls, "tabular-nums")}>{fmtDate(s.statement_date)}</td>
              <td className={tdCls}>{s.period_label || "-"}</td>
              <td className={cn(tdCls, "text-right tabular-nums")}>{formatMoney(s.opening_balance, currency)}</td>
              <td className={cn(tdCls, "text-right tabular-nums font-medium")}>{formatMoney(s.closing_balance, currency)}</td>
              <td className={cn(tdCls, "text-right tabular-nums text-gray-05")}>{s.line_count}</td>
              <td className={tdCls}><span className={cn(PILL, s.status === "RECONCILED" ? "bg-green-01/10 text-green-01" : "bg-amber-50 text-amber-700")}>{s.status_display}</span></td>
              {canEdit ? (
                <td className={cn(tdCls, "text-right")}>
                  <button
                    type="button"
                    onClick={() => onEdit(s.id)}
                    disabled={!s.can_edit}
                    title={s.edit_block_reason || "Edit statement"}
                    aria-label={`Edit statement ${s.period_label || s.statement_date}`}
                    className="rounded p-1.5 text-gray-05 hover:bg-gray-03 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconciliationsTab({ detail, currency }: { detail?: { reconciliations: import("@/redux/services/finance/ops-types").BankReconciliationRun[] }; currency?: string | null }) {
  const recs = detail?.reconciliations ?? [];
  if (recs.length === 0) return <EmptyState title="No reconciliations yet" message="Each Auto-reconcile run is recorded here for audit." />;
  return (
    <div className="overflow-hidden rounded-md border border-white-02">
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={thCls}>Date</th><th className={cn(thCls, "text-right")}>Book</th>
          <th className={cn(thCls, "text-right")}>Statement</th><th className={cn(thCls, "text-right")}>Diff</th>
          <th className={cn(thCls, "text-right")}>Matched</th><th className={thCls}>Status</th><th className={thCls}>By</th>
        </tr></thead>
        <tbody>
          {recs.map((r) => (
            <tr key={r.id}>
              <td className={cn(tdCls, "tabular-nums")}>{fmtDate(r.created_at)}</td>
              <td className={cn(tdCls, "text-right tabular-nums")}>{formatMoney(r.book_balance, currency)}</td>
              <td className={cn(tdCls, "text-right tabular-nums")}>{formatMoney(r.statement_balance, currency)}</td>
              <td className={cn(tdCls, "text-right tabular-nums", r.difference !== 0 ? "text-destructive" : "")}>{formatMoney(r.difference, currency)}</td>
              <td className={cn(tdCls, "text-right tabular-nums text-gray-05")}>{r.matched_count}</td>
              <td className={tdCls}><span className={cn(PILL, r.status === "BALANCED" ? "bg-green-01/10 text-green-01" : "bg-amber-50 text-amber-700")}>{r.status_display}</span></td>
              <td className={cn(tdCls, "text-gray-05")}>{r.performed_by_name || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab({ account, entity, canEdit }: { account: BankAccount; entity: string; canEdit: boolean }) {
  const [name, setName] = useState(account.name);
  const [bankName, setBankName] = useState(account.bank_name);
  const [accountNumber, setAccountNumber] = useState(account.account_number ?? "");
  const [currency, setCurrency] = useState(account.currency ?? "");
  const [active, setActive] = useState(account.is_active);
  const [primary, setPrimary] = useState(account.is_primary);
  const [primaryCollection, setPrimaryCollection] = useState(account.is_primary_collection);
  const [update, { isLoading }] = useUpdateBankAccountMutation();
  const numberStripped = isStripped(account, "account_number");

  const save = async () => {
    try {
      const res = await update({
        id: account.id, entity, name: name.trim(), bank_name: bankName.trim(),
        ...(numberStripped ? {} : { account_number: accountNumber.trim() }),
        currency: currency || undefined, is_active: active, is_primary: primary,
        is_primary_collection: primaryCollection,
      }).unwrap();
      toast.success(res.message || "Bank account updated.");
    } catch { /* central */ }
  };

  return (
    <div className="space-y-4">
      <FormField label="Account name" required><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className="bg-white" /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Bank name"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={!canEdit} className="bg-white" /></FormField>
        <FormField label="Account number">
          <Input value={numberStripped ? "••••" : accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={!canEdit || numberStripped} className="bg-white font-mont" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Currency"><CurrencyPicker value={currency} onChange={setCurrency} disabled={!canEdit} /></FormField>
        <div className="flex items-end gap-4 pb-2">
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!canEdit} className="accent-primary" /> Active</label>
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} disabled={!canEdit} className="accent-primary" /> Primary</label>
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={primaryCollection} onChange={(e) => setPrimaryCollection(e.target.checked)} disabled={!canEdit} className="accent-primary" /> Collection</label>
        </div>
      </div>
      {canEdit ? (
        <div className="flex justify-end"><Button disabled={isLoading || !name.trim()} onClick={save}>{isLoading ? "Saving…" : "Save changes"}</Button></div>
      ) : null}
    </div>
  );
}

type CorrectionRow = {
  id?: number;
  txn_date: string;
  description: string;
  amount: string;
  reference: string;
  external_id: string;
};

function EditStatementDrawer({
  id,
  statementId,
  entity,
  currency,
  onClose,
}: {
  id: number;
  statementId: number;
  entity: string;
  currency?: string | null;
  onClose: () => void;
}) {
  const { data, isFetching } = useGetBankStatementQuery({ id, statementId, entity });
  const statement = data?.data;

  return (
    <DetailDrawer
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Edit statement"
      description="Correct a manually imported statement before reconciliation."
      widthClass="sm:max-w-3xl"
    >
      {isFetching && !statement ? (
        <p className="font-mont text-sm text-gray-05">Loading statement…</p>
      ) : statement ? (
        <EditStatementForm
          key={statement.id}
          id={id}
          entity={entity}
          statement={statement}
          currency={currency}
          onClose={onClose}
        />
      ) : null}
    </DetailDrawer>
  );
}

function EditStatementForm({
  id,
  entity,
  statement,
  currency,
  onClose,
}: {
  id: number;
  entity: string;
  statement: BankStatementDetail;
  currency?: string | null;
  onClose: () => void;
}) {
  const [statementDate, setStatementDate] = useState(statement.statement_date);
  const [periodLabel, setPeriodLabel] = useState(statement.period_label);
  const [opening, setOpening] = useState(String(statement.opening_balance / 100));
  const [rows, setRows] = useState<CorrectionRow[]>(
    statement.lines.map((line) => ({
      id: line.id,
      txn_date: line.txn_date,
      description: line.description,
      reference: line.reference,
      amount: String(line.amount / 100),
      external_id: line.external_id,
    })),
  );
  const [update, { isLoading }] = useUpdateBankStatementMutation();

  const setRow = (index: number, patch: Partial<CorrectionRow>) => {
    setRows((current) => current.map((row, i) => (
      i === index ? { ...row, ...patch } : row
    )));
  };
  const validRows = rows.filter(
    (row) => row.txn_date && row.amount.trim() !== "" && !Number.isNaN(Number(row.amount)),
  );
  const openingKobo = opening.trim() && !Number.isNaN(Number(opening))
    ? Math.round(Number(opening) * 100)
    : 0;
  const closingKobo = openingKobo + validRows.reduce(
    (total, row) => total + Math.round(Number(row.amount) * 100),
    0,
  );
  const canSave = (
    statement.can_edit
    && statementDate
    && opening.trim() !== ""
    && !Number.isNaN(Number(opening))
    && validRows.length === rows.length
    && rows.length > 0
  );

  const save = async () => {
    if (!canSave) return;
    try {
      const response = await update({
        id,
        statementId: statement.id,
        entity,
        statement_date: statementDate,
        period_label: periodLabel.trim() || undefined,
        opening_balance: openingKobo,
        lines: rows.map((row) => ({
          ...(row.id ? { id: row.id } : {}),
          txn_date: row.txn_date,
          description: row.description.trim() || undefined,
          reference: row.reference.trim() || undefined,
          amount: Math.round(Number(row.amount) * 100),
          external_id: row.external_id || undefined,
        })),
      }).unwrap();
      toast.success(response.message || "Bank statement corrected.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <div className="space-y-4">
      {!statement.can_edit && statement.edit_block_reason ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 font-mont text-xs text-amber-900 ring-1 ring-amber-200">
          {statement.edit_block_reason}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Statement date" required>
          <Input type="date" value={statementDate} onChange={(event) => setStatementDate(event.target.value)} disabled={!statement.can_edit} className="bg-white font-mont" />
        </FormField>
        <FormField label="Period label">
          <Input value={periodLabel} onChange={(event) => setPeriodLabel(event.target.value)} disabled={!statement.can_edit} placeholder="e.g. Apr 2026" className="bg-white" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Opening balance" required>
          <Input type="number" value={opening} onChange={(event) => setOpening(event.target.value)} disabled={!statement.can_edit} className="bg-white font-mont" />
        </FormField>
        <FormField label="Calculated closing balance">
          <div className="flex h-9 items-center rounded-md border border-gray-03 bg-gray-03 px-3 font-mont text-sm font-medium tabular-nums text-gray-01">
            {formatMoney(closingKobo, currency)}
          </div>
        </FormField>
      </div>
      <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
        The closing balance is recalculated as opening balance plus all corrected statement lines. Every correction is recorded in the finance audit trail.
      </p>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Lines</p>
          <Button
            variant="outline"
            size="sm"
            disabled={!statement.can_edit}
            onClick={() => setRows((current) => [
              ...current,
              {
                txn_date: statementDate,
                description: "",
                reference: "",
                amount: "",
                external_id: "",
              },
            ])}
            className="gap-1.5"
          >
            <Plus className="size-3.5" /> Add line
          </Button>
        </div>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id ?? `new-${index}`} className="flex items-end gap-2 rounded-md border border-white-02 bg-white p-2.5">
              <div className="grid flex-1 grid-cols-12 gap-2">
                <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Date</p><Input type="date" value={row.txn_date} onChange={(event) => setRow(index, { txn_date: event.target.value })} disabled={!statement.can_edit} className="bg-white font-mont text-sm" /></div>
                <div className="col-span-4"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Description</p><Input value={row.description} onChange={(event) => setRow(index, { description: event.target.value })} disabled={!statement.can_edit} className="bg-white text-sm" /></div>
                <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Reference</p><Input value={row.reference} onChange={(event) => setRow(index, { reference: event.target.value })} disabled={!statement.can_edit} className="bg-white font-mont text-sm" /></div>
                <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Amount</p><Input type="number" value={row.amount} onChange={(event) => setRow(index, { amount: event.target.value })} disabled={!statement.can_edit} className="bg-white font-mont text-sm" /></div>
              </div>
              <button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} disabled={!statement.can_edit || rows.length <= 1} className="mb-0.5 shrink-0 rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-30" aria-label="Remove line"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !canSave} onClick={save}>
          {isLoading ? "Saving…" : "Save corrections"}
        </Button>
      </div>
    </div>
  );
}

type ImportRow = { txn_date: string; description: string; amount: string; reference: string };
const emptyRow = (): ImportRow => ({ txn_date: todayISO(), description: "", amount: "", reference: "" });

function ImportStatementDrawer({ id, entity, onClose }: { id: number; entity: string; onClose: () => void }) {
  const [periodLabel, setPeriodLabel] = useState("");
  const [opening, setOpening] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([emptyRow()]);
  const [dupWarning, setDupWarning] = useState<number>(0);   // suspected dupes held back on last attempt
  const [doImport, { isLoading }] = useImportStatementMutation();

  const setRow = (i: number, patch: Partial<ImportRow>) => setRows((s) => s.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const valid = rows.filter((r) => r.txn_date && r.amount.trim() !== "" && !Number.isNaN(Number(r.amount)));

  const submit = async (force = false) => {
    try {
      const res = await doImport({
        id, entity, force,
        period_label: periodLabel.trim() || undefined,
        opening_balance: opening.trim() ? Math.round(Number(opening) * 100) : undefined,
        lines: valid.map((r) => ({
          txn_date: r.txn_date, description: r.description.trim() || undefined,
          reference: r.reference.trim() || undefined, amount: Math.round(Number(r.amount) * 100),
        })),
      }).unwrap();
      const held = res.data?.suspected_duplicates?.length ?? 0;
      // Some rows look like duplicates of existing lines - keep the drawer open and
      // let the user decide to import them anyway (force), rather than double a charge.
      if (held > 0 && !force) {
        setDupWarning(held);
        toast.warning(res.message || `${held} suspected duplicate(s) held back.`);
        return;
      }
      toast.success(res.message || "Statement imported.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Import statement" description="Add statement lines for this account, then Auto-reconcile."
      widthClass="sm:max-w-3xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        {dupWarning > 0 && (
          <Button variant="outline" disabled={isLoading} onClick={() => submit(true)} className="border-amber-300 text-amber-700 hover:bg-amber-50">
            {isLoading ? "Importing…" : "Import anyway"}
          </Button>
        )}
        <Button disabled={isLoading || valid.length === 0} onClick={() => submit(false)} className="gap-1.5"><Upload className="size-4" />{isLoading ? "Importing…" : `Import ${valid.length} line(s)`}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Amount is signed in naira from your side: <span className="font-medium">positive = money in</span>, negative = money out. Lines group under one statement (closing = opening + Σ amounts).
        </p>
        {dupWarning > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 font-mont text-[11px] text-amber-900 ring-1 ring-amber-200">
            <span className="font-semibold">{dupWarning} line(s) look like duplicates</span> of statement lines already on this account and were <span className="font-semibold">held back</span> to avoid doubling a charge. If they're genuinely new, use <span className="font-semibold">Import anyway</span>.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Period label"><Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. Apr 2026" className="bg-white" /></FormField>
          <FormField label="Opening balance (₦)"><Input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" className="bg-white font-mont" /></FormField>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Lines</p>
            <Button variant="outline" size="sm" onClick={() => setRows((s) => [...s, emptyRow()])} className="gap-1.5"><Plus className="size-3.5" /> Add line</Button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-end gap-2 rounded-md border border-white-02 bg-white p-2.5">
                <div className="grid flex-1 grid-cols-12 gap-2">
                  <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Date</p><Input type="date" value={r.txn_date} onChange={(e) => setRow(i, { txn_date: e.target.value })} className="bg-white font-mont text-sm" /></div>
                  <div className="col-span-4"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Description</p><Input value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} className="bg-white text-sm" /></div>
                  <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Reference</p><Input value={r.reference} onChange={(e) => setRow(i, { reference: e.target.value })} className="bg-white font-mont text-sm" /></div>
                  <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Amount (₦)</p><Input type="number" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} placeholder="0.00" className="bg-white font-mont text-sm" /></div>
                </div>
                <button type="button" onClick={() => setRows((s) => s.filter((_, idx) => idx !== i))} disabled={rows.length <= 1} className="mb-0.5 shrink-0 rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-30" aria-label="Remove line"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
}

function BulkImportStatementDrawer({ id, entity, onClose }: { id: number; entity: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [statementDate, setStatementDate] = useState(todayISO());
  const [periodLabel, setPeriodLabel] = useState("");
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [notes, setNotes] = useState("");
  const [batchId, setBatchId] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [uploadBatch, { isLoading: uploading }] = useUploadBankStatementBatchMutation();
  const [downloadTemplate, { isLoading: downloading }] = useDownloadBankStatementTemplateMutation();
  const [cancelBatch, { isLoading: cancelling }] = useCancelImportBatchMutation();

  const amountsValid = [opening, closing].every(
    (value) => value.trim() !== "" && Number.isFinite(Number(value)),
  );
  const canUpload = !!file && !!statementDate && amountsValid && !uploading;
  const returnToUpload = () => {
    setBatchId(null);
    setFile(null);
  };
  const startAnother = () => {
    setBatchId(null);
    setFile(null);
    setStatementDate(todayISO());
    setPeriodLabel("");
    setOpening("");
    setClosing("");
    setNotes("");
  };

  const requestCancel = () => {
    if (batchId) {
      setCancelOpen(true);
      return;
    }
    onClose();
  };

  const confirmCancel = async () => {
    if (!batchId) return;
    try {
      await cancelBatch(batchId).unwrap();
      toast.success("Import cancelled.");
      onClose();
    } catch {
      // The shared API interceptor owns the failure message; keep the workflow open.
    }
  };

  const abandonBatch = async (currentBatchId: number) => {
    try {
      await cancelBatch(currentBatchId).unwrap();
      return true;
    } catch {
      return false;
    }
  };

  const handleFinished = () => {
    dispatch(baseApi.util.invalidateTags([
      "FinanceBankAccounts",
      "FinanceStatementLines",
    ]));
  };

  const viewDetails = (currentBatchId: number) => {
    onClose();
    navigate(routesPath.PROTECTED.DATA_IMPORTS.BATCHES.VIEW(String(currentBatchId)));
  };

  const upload = async () => {
    if (!canUpload || !file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("statement_date", statementDate);
    formData.append("opening_balance", opening.trim());
    formData.append("closing_balance", closing.trim());
    if (periodLabel.trim()) formData.append("period_label", periodLabel.trim());
    if (notes.trim()) formData.append("notes", notes.trim());

    try {
      const result = await uploadBatch({ id, entity, formData }).unwrap();
      setBatchId(result.data.id);
      toast.success("Statement uploaded. Review the validation checks before publishing.");
    } catch { /* central */ }
  };

  const download = async (format: "csv" | "xlsx") => {
    try {
      const url = await downloadTemplate({ id, entity, format }).unwrap();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bank_statement_template.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch { /* central */ }
  };

  return (
    <>
    <ImportProcessDrawer
      open
      title="Bulk import statement"
      description="Upload the bank statement template, review the checks, then publish."
    >
      {batchId ? (
        <ImportWizard
          initialBatchId={batchId}
          onAbandonBatch={abandonBatch}
          onBackFromInitialBatch={returnToUpload}
          onNewImport={startAnother}
          onFinished={handleFinished}
          onComplete={viewDetails}
          onReturn={onClose}
          returnLabel="Return to bank account"
          onCancel={requestCancel}
        />
      ) : (
        <div className="space-y-5 rounded-md border border-white-02 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-03 bg-gray-03 px-4 py-3">
            <div>
              <p className="font-mont text-xs font-semibold text-gray-01">Use the statement template</p>
              <p className="mt-0.5 font-mont text-[11px] text-gray-05">Copy the bank export into the standard columns before uploading.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={downloading} onClick={() => download("xlsx")} className="gap-1.5">
                <Download className="size-3.5" /> Excel template
              </Button>
              <Button variant="outline" size="sm" disabled={downloading} onClick={() => download("csv")} className="gap-1.5">
                <Download className="size-3.5" /> CSV template
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Statement date" required>
              <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="bg-white font-mont" />
            </FormField>
            <FormField label="Period label">
              <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. Apr 2026" className="bg-white" />
            </FormField>
            <FormField label="Opening balance (₦)" required>
              <Input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" className="bg-white font-mont" />
            </FormField>
            <FormField label="Closing balance (₦)" required>
              <Input type="number" step="0.01" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="0.00" className="bg-white font-mont" />
            </FormField>
          </div>

          <FormField label="Statement file" required>
            <Input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="bg-white font-mont"
            />
          </FormField>
          <FormField label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional note for this import"
              className="w-full rounded-md border border-white-02 bg-white px-3 py-2 font-mont text-sm"
            />
          </FormField>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={uploading} onClick={requestCancel}>Cancel</Button>
            <Button disabled={!canUpload} onClick={upload} className="gap-1.5">
              <Upload className="size-4" />
              {uploading ? "Uploading…" : "Continue to import wizard"}
            </Button>
          </div>
        </div>
      )}
    </ImportProcessDrawer>
    <ImportCancelDialog
      open={cancelOpen}
      cancelling={cancelling}
      onOpenChange={setCancelOpen}
      onConfirm={() => { void confirmCancel(); }}
    />
    </>
  );
}

function CreateBankAccountModal({ open, onClose, entity }: { open: boolean; onClose: () => void; entity: string }) {
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [glAccount, setGlAccount] = useState("");
  const [currency, setCurrency] = useState("");
  const [active, setActive] = useState(true);
  const [primary, setPrimary] = useState(false);
  const [primaryCollection, setPrimaryCollection] = useState(false);
  const [create, { isLoading }] = useCreateBankAccountMutation();

  const reset = () => { setName(""); setBankName(""); setAccountNumber(""); setGlAccount(""); setCurrency(""); setActive(true); setPrimary(false); setPrimaryCollection(false); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    try {
      const res = await create({
        entity, name: name.trim(), bank_name: bankName.trim() || undefined,
        account_number: accountNumber.trim() || undefined, gl_account: glAccount,
        currency: currency || undefined, is_active: active, is_primary: primary,
        is_primary_collection: primaryCollection,
      }).unwrap();
      toast.success(res.message || "Bank account created.");
      close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New bank account" description="Link a real bank account to a GL cash account for statement import and reconciliation."
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !name.trim() || !glAccount} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Creating…" : "Create account"}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          The GL cash account is the ledger's book balance for this bank account (1:1). Money still only moves through journals - this adds the banking metadata and anchors reconciliation.
        </p>
        <FormField label="Account name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GTBank Operations" className="bg-white" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Bank name"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" className="bg-white" /></FormField>
          <FormField label="Account number"><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="0123456789" className="bg-white font-mont" /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="GL cash account" required><AccountPicker entity={entity} value={glAccount} onChange={setGlAccount} postableOnly accountType="ASSET" placeholder="Cash / bank account" /></FormField>
          <FormField label="Currency"><CurrencyPicker value={currency} onChange={setCurrency} /></FormField>
        </div>
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /> Active</label>
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} className="accent-primary" /> Primary operating account</label>
          <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={primaryCollection} onChange={(e) => setPrimaryCollection(e.target.checked)} className="accent-primary" /> Print on invoices/receipts</label>
        </div>
      </div>
    </DetailDrawer>
  );
}
