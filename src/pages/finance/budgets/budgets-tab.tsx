// Budgets & Forecasts - built on the real backend model (account × cost-centre ×
// period lines), in the house theme. A budget list (Code · Name · FY · Budgeted ·
// Actual YTD · Consumed · Status), a per-account × per-month variance heatmap, and a
// drawer that lets you build/edit a DRAFT's lines (auto-coded like an invoice) and,
// once approved, read its variance. Budget lines are income/expense GLs only.

import { useMemo, useState, type ReactNode } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Lock } from "lucide-react";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, AccountPicker, CostCenterPicker, InfoHint, ConfirmActionModal, toArray, type Column } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import {
  useGetBudgetsQuery, useGetBudgetQuery, useGetBudgetVarianceQuery, useGetBudgetHeatmapQuery, useGetFiscalYearsQuery,
  useCreateBudgetMutation, useUpdateBudgetMutation, useSetBudgetLinesMutation, useApproveBudgetMutation, useDeleteBudgetMutation,
} from "@/redux/services/finance/ops-api";
import type { Budget, BudgetLineInput } from "@/redux/services/finance/ops-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const PL_TYPES = "INCOME,EXPENSE";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-gray-03/60 text-gray-05", APPROVED: "bg-green-01/10 text-green-01",
  };
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={cn(PILL, map[status] ?? map.DRAFT)}>{label}</span>;
}

function compactNaira(kobo: number) {
  const n = (kobo || 0) / 100;
  const a = Math.abs(n);
  if (a >= 1e6) return `₦${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `₦${(n / 1e3).toFixed(0)}k`;
  return `₦${n.toFixed(0)}`;
}

function heatClass(ratio: number | null) {
  if (ratio == null) return "bg-white text-gray-05";
  if (ratio <= 0.9) return "bg-emerald-50 text-emerald-700";
  if (ratio <= 1.0) return "bg-amber-50 text-amber-700";
  if (ratio <= 1.2) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

function ConsumedBar({ pct }: { pct: number | null }) {
  const v = pct == null ? 0 : Math.min(pct, 100);
  const over = (pct ?? 0) > 100;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-03">
        <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-green-01")} style={{ width: `${v}%` }} />
      </div>
      <span className="w-10 text-right font-mont text-xs tabular-nums text-gray-05">{pct == null ? "-" : `${Math.round(pct)}%`}</span>
    </div>
  );
}

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

export function BudgetsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [heatmapId, setHeatmapId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetBudgetsQuery({ entity, page });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const activeHeatmapId = heatmapId ?? rows[0]?.id ?? null;

  const columns: Column<Budget>[] = [
    { header: "Code", cell: (b) => <span className="font-semibold tabular-nums text-gray-01">{b.code || "-"}</span> },
    { header: "Name", cell: (b) => b.name },
    { header: "Fiscal year", cell: (b) => <span className="tabular-nums text-gray-05">{b.fiscal_year}</span> },
    { header: "Budgeted", align: "right", cell: (b) => <Money kobo={b.budgeted_total ?? 0} currency={currency} align="right" /> },
    { header: "Actual YTD", align: "right", cell: (b) => <Money kobo={b.actual_ytd ?? 0} currency={currency} align="right" /> },
    { header: "Consumed", align: "right", cell: (b) => <ConsumedBar pct={b.consumed_pct ?? null} /> },
    { header: "Status", cell: (b) => <StatusPill status={b.status} /> },
  ];

  return (
    <div className="space-y-5" data-guide="finance-budgets.workbench">
      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="finance-budgets.controls">
        <p className="max-w-2xl font-mont text-xs text-gray-05">
          A budget is a plan in the same shape as your chart of accounts - one line per income/expense GL × cost centre × period. The system compares it to live postings; red cells in the heatmap are overruns.
        </p>
        <Can permission={P.FIN_CREATE_BUDGET}>
          <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New budget</Button>
        </Can>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(b) => b.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(b) => setSelectedId(b.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No budgets" emptyMessage="Create a budget for a fiscal year and add its lines." />

      {activeHeatmapId != null ? (
        <div className="rounded-md border border-white-02 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <h2 className="font-mont text-sm font-semibold text-gray-01">Variance heatmap</h2>
              <InfoHint ariaLabel="About the budget variance heatmap">Each cell is a GL account's actual spend in that period, coloured by how much of the budgeted amount it consumed. Variance is per account - actuals aren't tracked per cost centre.</InfoHint>
            </div>
            <Select value={String(activeHeatmapId)} onChange={(v) => setHeatmapId(Number(v))} className="w-64">
              {rows.map((b) => <option key={b.id} value={b.id}>{b.code ? `${b.code} · ${b.name}` : b.name}</option>)}
            </Select>
          </div>
          <Heatmap budgetId={activeHeatmapId} entity={entity} />
          <HeatLegend />
        </div>
      ) : null}

      <BudgetDrawer budgetId={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      <NewBudgetDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
    </div>
  );
}

function HeatLegend() {
  const items: [string, string][] = [["On track", "bg-emerald-50"], ["Approaching", "bg-amber-50"], ["Over budget", "bg-orange-100"], ["Severe overrun", "bg-red-100"]];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      {items.map(([label, cls]) => (
        <span key={label} className="inline-flex items-center gap-1.5 font-mont text-[11px] text-gray-05">
          <span className={cn("size-3 rounded-sm border border-white-02", cls)} /> {label}
        </span>
      ))}
    </div>
  );
}

function Heatmap({ budgetId, entity }: { budgetId: number; entity: string }) {
  const { data, isFetching, isError } = useGetBudgetHeatmapQuery({ id: budgetId, entity });
  const hm = data?.data;
  if (isError) return <p className="py-6 text-center font-mont text-xs text-destructive">Couldn't load the heatmap.</p>;
  if (isFetching && !hm) return <p className="py-6 text-center font-mont text-xs text-gray-05">Loading…</p>;
  if (!hm || hm.rows.length === 0) return <p className="py-6 text-center font-mont text-xs text-gray-05">No budget lines yet - add lines to see the variance heatmap.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(thCls, "sticky left-0 z-10 min-w-44")}>Account</th>
            {hm.periods.map((p) => <th key={p.period_no} className={cn(thCls, "text-right")}>{p.label}</th>)}
            <th className={cn(thCls, "text-right")}>YTD</th>
          </tr>
        </thead>
        <tbody>
          {hm.rows.map((r) => {
            const ytd = r.budget_total ? r.actual_total / r.budget_total : null;
            return (
              <tr key={r.account_id}>
                <td className={cn(tdCls, "sticky left-0 z-10 bg-white")}>
                  <span className="tabular-nums text-gray-05">{r.code}</span> <span className="text-black-01">{r.name}</span>
                </td>
                {hm.periods.map((p) => {
                  const cell = r.cells.find((c) => c.period_no === p.period_no);
                  const ratio = cell && cell.budget ? cell.actual / cell.budget : null;
                  const hasActual = !!cell && cell.actual !== 0;
                  return (
                    <td key={p.period_no} className={cn("border-t border-white-02 px-2 py-1.5 text-right font-mont text-[11px] tabular-nums", heatClass(ratio))}>
                      {hasActual ? compactNaira(cell!.actual) : <span className="text-gray-05">-</span>}
                    </td>
                  );
                })}
                <td className={cn(tdCls, "text-right")}>
                  <span className={cn("font-medium tabular-nums", ytd != null && ytd > 1 ? "text-destructive" : "text-gray-05")}>{ytd == null ? "-" : `${Math.round(ytd * 100)}%`}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Shared line editor (account × cost-centre × period × amount) ──────────────
type EditLine = { key: string; account: string; cost_center: string; period_no: number; amount: number };
const newLine = (): EditLine => ({ key: crypto.randomUUID(), account: "", cost_center: "", period_no: 1, amount: 0 });
const toInput = (r: EditLine): BudgetLineInput => ({ account: r.account, cost_center: r.cost_center || undefined, period_no: r.period_no, amount: r.amount });
const lineValid = (r: EditLine) => !!r.account && r.amount > 0;

function LinesEditor({ entity, currency, rows, setRows }: { entity: string; currency?: string | null; rows: EditLine[]; setRows: (fn: (r: EditLine[]) => EditLine[]) => void }) {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const setRow = (key: string, patch: Partial<EditLine>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Lines · income / expense GLs</p>
        <span className="font-mont text-[11px] text-gray-05">Total budgeted <span className="font-semibold tabular-nums text-black-01">{formatMoney(total, currency)}</span></span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-end gap-2 rounded-md border border-white-02 bg-white p-2.5">
            <div className="grid flex-1 grid-cols-12 gap-2">
              <div className="col-span-4"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Account</p><AccountPicker entity={entity} value={r.account} onChange={(v) => setRow(r.key, { account: v })} accountType={PL_TYPES} postableOnly placeholder="Income/expense account" /></div>
              <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Cost center</p><CostCenterPicker entity={entity} value={r.cost_center} onChange={(v) => setRow(r.key, { cost_center: v })} /></div>
              <div className="col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Period</p><Select value={String(r.period_no)} onChange={(v) => setRow(r.key, { period_no: Number(v) })} className="w-full">{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Period {i + 1}</option>)}</Select></div>
              <div className="col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Amount</p><MoneyInput valueKobo={r.amount} onChangeKobo={(k) => setRow(r.key, { amount: k })} currency={currency} className="[&_input]:h-9" /></div>
            </div>
            <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="mb-0.5 shrink-0 rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive"><Trash2 className="size-4" /></button>
          </div>
        ))}
        {rows.length === 0 ? <p className="rounded-md border border-dashed border-white-02 px-3 py-4 text-center font-mont text-[11px] text-gray-05">No lines yet - add one below.</p> : null}
      </div>
      <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, newLine()])} className="mt-2 gap-1.5"><Plus className="size-3.5" /> Add line</Button>
    </div>
  );
}

function NewBudgetDrawer({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [rows, setRows] = useState<EditLine[]>([newLine()]);
  const { data: fyData } = useGetFiscalYearsQuery({ entity, status: "OPEN" }, { skip: !open });
  const fys = useMemo(() => toArray(fyData?.data), [fyData]);
  const [create, { isLoading }] = useCreateBudgetMutation();

  // Reset the form each time the drawer opens, then default to the newest open
  // fiscal year once the list loads. Both adjust during render, not in effects.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setName(""); setYear(""); setRows([newLine()]); }
  }
  if (open && !year && fys.length) setYear(String(fys[0].year));

  const validRows = rows.filter(lineValid);
  const submit = async () => {
    try {
      const r = await create({ entity, name: name.trim(), fiscal_year: Number(year), lines: validRows.map(toInput) }).unwrap();
      toast.success(r.message || "Budget created.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : onClose())}
      title="New budget" description="Plan income & expense by account, cost centre and period." widthClass="sm:max-w-4xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !name.trim() || !year} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Creating…" : "Create budget"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operating budget · 2026/27" className="h-9 bg-white" /></FormField>
          <div>
            <p className="mb-1 font-mont text-xs text-gray-05">Fiscal year *</p>
            <Select value={year} onChange={setYear} className="w-full">
              <option value="" disabled>Select fiscal year</option>
              {fys.map((y) => <option key={y.id} value={y.year}>{y.year}{y.status !== "OPEN" ? ` (${y.status.toLowerCase()})` : ""}</option>)}
            </Select>
          </div>
        </div>
        <LinesEditor entity={entity} currency={currency} rows={rows} setRows={setRows} />
        <p className="rounded-md border border-gray-03 bg-gray-03/40 px-3 py-2 font-mont text-[11px] text-gray-05">A reference code is allocated on save. The budget is a draft you can keep editing until you approve it - approval locks the lines.</p>
      </div>
    </DetailDrawer>
  );
}

function BudgetDrawer({ budgetId, entity, currency, onClose }: { budgetId: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  // Fetch by id (not the paginated list) so the drawer works regardless of page.
  const { data: bd } = useGetBudgetQuery(budgetId != null ? { id: budgetId, entity } : skipToken);
  const budget = bd?.data ?? null;
  const isDraft = !!budget && budget.status === "DRAFT" && !budget.is_locked;

  if (budgetId == null || !budget) return null;
  return isDraft
    ? <DraftEditor key={budget.id} budget={budget} entity={entity} currency={currency} onClose={onClose} />
    : <VarianceView budget={budget} entity={entity} currency={currency} onClose={onClose} />;
}

function DraftEditor({ budget, entity, currency, onClose }: { budget: Budget; entity: string; currency?: string | null; onClose: () => void }) {
  const { can } = useCan();
  // The parent keys this component by budget id, so local edit state is
  // seeded once from props here and reset by remount when a different budget
  // is opened - no effect needed to re-sync.
  const [name, setName] = useState(budget.name);
  const [rows, setRows] = useState<EditLine[]>(() =>
    budget.lines.map((l) => ({ key: crypto.randomUUID(), account: l.account, cost_center: l.cost_center ?? "", period_no: l.period_no, amount: l.amount })));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [update] = useUpdateBudgetMutation();
  const [setLines, { isLoading: saving }] = useSetBudgetLinesMutation();
  const [approve, { isLoading: approving }] = useApproveBudgetMutation();
  const [remove, { isLoading: deleting }] = useDeleteBudgetMutation();

  const validRows = rows.filter(lineValid);
  const save = async () => {
    try {
      if (name.trim() && name.trim() !== budget.name) await update({ id: budget.id, entity, name: name.trim() }).unwrap();
      await setLines({ id: budget.id, entity, lines: validRows.map(toInput) }).unwrap();
      toast.success("Budget saved.");
      onClose();
    } catch { /* central */ }
  };
  const doApprove = async () => {
    try {
      if (name.trim() && name.trim() !== budget.name) await update({ id: budget.id, entity, name: name.trim() }).unwrap();
      await setLines({ id: budget.id, entity, lines: validRows.map(toInput) }).unwrap();
      const r = await approve({ id: budget.id, entity }).unwrap();
      toast.success(r.message || "Budget approved.");
      onClose();
    } catch { /* central */ }
  };
  const doDelete = async () => {
    try { const r = await remove({ id: budget.id, entity }).unwrap(); toast.success(r.message || "Budget deleted."); setConfirmDelete(false); onClose(); }
    catch { /* central */ }
  };

  return (
    <>
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={`Edit ${budget.code}`} description="Draft - editable until approved." widthClass="sm:max-w-4xl"
      footer={<>
        <StatusPill status={budget.status} />
        {can(P.FIN_DELETE_BUDGET) ? <Button variant="outline" disabled={deleting} onClick={() => setConfirmDelete(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Trash2 className="size-4" /> Delete</Button> : null}
        <div className="flex-1" />
        <Button variant="outline" disabled={saving} onClick={save} className="gap-1.5">{saving ? "Saving…" : "Save"}</Button>
        {can(P.FIN_APPROVE_BUDGET) ? <Button disabled={approving} onClick={doApprove} className="gap-1.5"><CheckCircle2 className="size-4" />{approving ? "Approving…" : "Save & approve"}</Button> : null}
      </>}>
      <div className="space-y-4">
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 bg-white" /></FormField>
        <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-05 sm:grid-cols-4">
          <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont">Code</p><p className="mt-1 font-mont text-xs font-semibold tabular-nums text-black-01">{budget.code}</p></div>
          <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont">Fiscal year</p><p className="mt-1 font-mont text-xs font-semibold tabular-nums text-black-01">{budget.fiscal_year}</p></div>
        </div>
        <LinesEditor entity={entity} currency={currency} rows={rows} setRows={setRows} />
      </div>
    </DetailDrawer>
    <ConfirmActionModal
      open={confirmDelete}
      onOpenChange={setConfirmDelete}
      title={`Delete ${budget.code}?`}
      description="Permanently removes this draft budget and its lines. Nothing is posted to the ledger, so no journal is affected. Approved budgets can't be deleted."
      confirmText="Delete budget"
      destructive
      loading={deleting}
      onConfirm={doDelete}
    />
    </>
  );
}

function VarianceView({ budget, entity, currency, onClose }: { budget: Budget; entity: string; currency?: string | null; onClose: () => void }) {
  const { data: vd } = useGetBudgetVarianceQuery({ id: budget.id, entity });
  const v = vd?.data;
  const budgeted = v?.total_budget.kobo ?? 0;
  const actual = v?.total_actual.kobo ?? 0;
  const remaining = budgeted - actual;
  const consumed = budgeted ? Math.round((actual * 100) / budgeted) : null;

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={`${budget.code} · ${budget.name}`} description={`FY ${budget.fiscal_year} · ${budget.lines.length} lines`} widthClass="sm:max-w-3xl"
      footer={<>
        <StatusPill status={budget.status} />
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 font-mont text-[11px] text-gray-05"><Lock className="size-3.5" /> Locked - figures frozen against the actuals</span>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Budgeted" kobo={budgeted} currency={currency} />
          <Metric label="Actual YTD" kobo={actual} currency={currency} />
          <Metric label="Variance (remaining)" kobo={remaining} currency={currency} tone={remaining < 0 ? "bad" : "good"} />
          <div className="rounded-md border border-white-02 bg-white p-3">
            <p className="font-mont text-[11px] text-gray-05">% Consumed</p>
            <p className={cn("mt-1 font-mont text-sm font-semibold tabular-nums", consumed != null && consumed > 100 ? "text-destructive" : "text-black-01")}>{consumed == null ? "-" : `${consumed}%`}</p>
          </div>
        </div>

        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Lines · actual vs budget</p>
          <div className="overflow-hidden rounded-md border border-white-02">
            <table className="w-full border-collapse">
              <thead><tr>
                <th className={thCls}>GL · Account</th>
                <th className={cn(thCls, "text-right")}>Budget</th><th className={cn(thCls, "text-right")}>Actual YTD</th>
                <th className={cn(thCls, "text-right")}>Variance</th><th className={cn(thCls, "text-right")}>Consumed</th>
              </tr></thead>
              <tbody>
                {(v?.rows ?? []).map((r) => {
                  const rem = r.budget.kobo - r.actual.kobo;
                  const pct = r.budget.kobo ? (r.actual.kobo * 100) / r.budget.kobo : null;
                  return (
                    <tr key={r.account_id}>
                      <td className={tdCls}><span className="tabular-nums text-gray-05">{r.code}</span> {r.name}</td>
                      <td className={cn(tdCls, "text-right tabular-nums")}>{formatMoney(r.budget.kobo, currency)}</td>
                      <td className={cn(tdCls, "text-right tabular-nums")}>{formatMoney(r.actual.kobo, currency)}</td>
                      <td className={cn(tdCls, "text-right tabular-nums", rem < 0 ? "text-destructive" : "text-green-01")}>{formatMoney(rem, currency)}</td>
                      <td className={cn(tdCls)}><ConsumedBar pct={pct} /></td>
                    </tr>
                  );
                })}
                {(v?.rows ?? []).length === 0 ? <tr><td className={cn(tdCls, "text-center text-gray-05")} colSpan={5}>No activity yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
}

function Metric({ label, kobo, currency, tone }: { label: string; kobo: number; currency?: string | null; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-sm font-semibold tabular-nums", tone === "bad" ? "text-destructive" : tone === "good" ? "text-green-01" : "text-black-01")}>{formatMoney(kobo, currency)}</p>
    </div>
  );
}
