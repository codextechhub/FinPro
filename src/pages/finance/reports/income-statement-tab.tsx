/**
 * Income Statement (P&L) - rebuilt to the Vision prototype in the house theme. The
 * P&L is revenue less expenses → net income (which closes to Retained Earnings at
 * year-end). Fiscal-year scoped, with optional Budget + Variance and Prior-year
 * comparison columns (toggled on when the backend has that data). Money + the
 * comparison figures come straight from the endpoint; export is the real backend
 * CSV/XLSX/PDF.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Money } from "@/components/finance-ui";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { downloadReportExport } from "@/utils/finance-export";
import { useGetIncomeStatementQuery } from "@/redux/services/finance/reports-api";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import type { IncomeStatementLine, IncomeStatementTotals } from "@/redux/services/finance/reports-types";

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

function CompareToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 font-mont text-xs text-gray-01">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-3.5 accent-primary" />
      {label}
    </label>
  );
}

// Canonical report-table header (matches Trial Balance / the rest of the console).
const thBase = "px-3 py-2 font-mont text-xs font-semibold text-gray-01";
// Favourable variance reads positive (revenue over / expense under budget) → green.
function Variance({ kobo, currency }: { kobo: number; currency?: string | null }) {
  if (!kobo) return <span className="text-gray-04">-</span>;
  return <span className={cn("font-semibold tabular-nums", kobo > 0 ? "text-green-01" : "text-destructive")}>
    {kobo < 0 ? "−" : ""}{formatMoney(Math.abs(kobo), currency)}
  </span>;
}

export function IncomeStatementReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const [period, setPeriod] = useState("");          // "" = year to date, else fiscal period id
  const [wantBudget, setWantBudget] = useState(true);
  const [wantPrior, setWantPrior] = useState(true);

  const { data: periodsData } = useGetPeriodsQuery({ entity });
  const periods = useMemo(() => [...(periodsData?.data ?? [])]
    .sort((a, b) => (a.fiscal_year - b.fiscal_year) || (a.period_no - b.period_no)), [periodsData]);

  const { data, isLoading, isFetching, isError, refetch } = useGetIncomeStatementQuery({ entity, ...(period ? { period } : {}) });
  const d = data?.data;

  if (isLoading) return <LoadingState />;
  if (isError || !d) return <ErrorState onRetry={refetch} />;

  const showBudget = d.has_budget && wantBudget;
  const showPrior = d.has_prior_year && wantPrior;
  const colCount = 2 + (showBudget ? 2 : 0) + (showPrior ? 1 : 0);
  const periodLabel = d.period || (d.fiscal_year ? `${d.fiscal_year} fiscal year` : "Year to date");

  const numCell = "px-3 py-2 text-right tabular-nums";
  const muted = "text-gray-05";

  const line = (r: IncomeStatementLine) => (
    <tr key={r.account_id} className="border-t border-white-02 font-mont text-sm">
      <td className="px-3 py-2"><span className="tabular-nums text-gray-05">{r.code}</span> <span className="text-gray-01">{r.name}</span></td>
      <td className={cn(numCell, "font-medium text-black-01")}><Money kobo={r.amount.kobo} currency={currency} align="right" /></td>
      {showBudget ? <td className={cn(numCell, muted)}>{r.budget ? <Money kobo={r.budget.kobo} currency={currency} align="right" /> : "-"}</td> : null}
      {showBudget ? <td className={numCell}><Variance kobo={r.variance?.kobo ?? 0} currency={currency} /></td> : null}
      {showPrior ? <td className={cn(numCell, muted)}>{r.prior_year ? <Money kobo={r.prior_year.kobo} currency={currency} align="right" /> : "-"}</td> : null}
    </tr>
  );

  const band = (label: string, tone: "rev" | "exp") => (
    <tr className={cn("font-mont text-[11px] font-semibold uppercase tracking-wide",
      tone === "rev" ? "bg-green-01/10 text-green-01" : "bg-rose-50 text-rose-700")}>
      <td className="px-3 py-1.5" colSpan={colCount}>{label}</td>
    </tr>
  );

  const totalRow = (label: string, t: IncomeStatementTotals, opts?: { net?: boolean }) => (
    <tr className={cn("border-t border-white-02 font-mont", opts?.net
      ? "border-t-2 bg-white-02/50 text-[15px] font-bold text-black-01"
      : "bg-gray-03/30 text-sm font-semibold text-gray-01")}>
      <td className="px-3 py-2.5">{label}</td>
      <td className={cn(numCell, "tabular-nums")}><Money kobo={t.amount.kobo} currency={currency} align="right" /></td>
      {showBudget ? <td className={cn(numCell, muted)}>{t.budget ? <Money kobo={t.budget.kobo} currency={currency} align="right" /> : "-"}</td> : null}
      {showBudget ? <td className={numCell}><Variance kobo={t.variance?.kobo ?? 0} currency={currency} /></td> : null}
      {showPrior ? <td className={cn(numCell, muted)}>{t.prior_year ? <Money kobo={t.prior_year.kobo} currency={currency} align="right" /> : "-"}</td> : null}
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={period} onChange={setPeriod} className="w-44">
            <option value="">Year to date</option>
            {periods.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </Select>
          {d.has_budget ? <CompareToggle label="vs Budget" checked={wantBudget} onChange={setWantBudget} /> : null}
          {d.has_prior_year ? <CompareToggle label={`vs Prior year${d.prior_fiscal_year ? ` (${d.prior_fiscal_year})` : ""}`} checked={wantPrior} onChange={setWantPrior} /> : null}
        </div>
        <div className="flex items-center gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <button key={f} onClick={() => downloadReportExport("/finance/reports/income-statement/", { entity, period: period || undefined }, f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:border-primary hover:text-primary">
              <Download className="size-3.5" /> {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(INFORMATION_CARD_SURFACE, "overflow-x-auto rounded-md")}>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F1F1F1] text-left">
              <th className={thBase}>Account</th>
              <th className={cn(thBase, "text-right")}>{periodLabel}</th>
              {showBudget ? <th className={cn(thBase, "text-right")}>Budget</th> : null}
              {showBudget ? <th className={cn(thBase, "text-right")}>Variance</th> : null}
              {showPrior ? <th className={cn(thBase, "text-right")}>Prior year</th> : null}
            </tr>
          </thead>
          <tbody className={cn(isFetching && "opacity-60")}>
            {band("Revenue", "rev")}
            {d.income.length ? d.income.map(line) : <tr><td colSpan={colCount} className="px-3 py-4 text-center font-mont text-sm text-gray-05">No revenue in this period.</td></tr>}
            {totalRow("Total revenue", d.totals.income)}
            {band("Expenses", "exp")}
            {d.expense.length ? d.expense.map(line) : <tr><td colSpan={colCount} className="px-3 py-4 text-center font-mont text-sm text-gray-05">No expenses in this period.</td></tr>}
            {totalRow("Total expenses", d.totals.expense)}
          </tbody>
          <tfoot>
            {totalRow("Net income", d.totals.net, { net: true })}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
