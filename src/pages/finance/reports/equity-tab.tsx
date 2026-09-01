// Statement of Changes in Equity - rebuilt to the Vision prototype in the house
// theme. A matrix: one column per equity component (+ a Total equity column), with the
// movement walk down the rows - Opening balance → Profit for the period → Contributions
// → Distributions → Closing balance. Our backend gives each component's net
// contributions; we split it by sign into the Contributions (in) and Distributions
// (out) rows. Money + reconciliation come straight from the endpoint; export is real.

import { useMemo, useState, type ReactNode } from "react";
import { Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { Money } from "@/components/finance-ui";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { downloadReportExport } from "@/utils/finance-export";
import { useGetChangesInEquityQuery } from "@/redux/services/finance/reports-api";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import type { EquityColumn } from "@/redux/services/finance/reports-types";

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

// The synthetic unclosed-P&L column reads cleaner as "Current year earnings" (matches
// the Balance Sheet); booked equity accounts keep their name.
const colLabel = (c: EquityColumn) => (c.key === "retained_earnings" ? "Current year earnings" : c.label);

export function EquityReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const [period, setPeriod] = useState("");   // "" = year to date, else fiscal period id

  const { data: periodsData } = useGetPeriodsQuery({ entity });
  const periods = useMemo(() => [...(periodsData?.data ?? [])]
    .sort((a, b) => (a.fiscal_year - b.fiscal_year) || (a.period_no - b.period_no)), [periodsData]);

  const { data, isLoading, isFetching, isError, refetch } = useGetChangesInEquityQuery({ entity, ...(period ? { period } : {}) });
  const d = data?.data;

  if (isLoading) return <LoadingState />;
  if (isError || !d) return <ErrorState onRetry={refetch} />;

  const cols = d.columns;
  const sum = (f: (c: EquityColumn) => number) => cols.reduce((s, c) => s + f(c), 0);
  const contribOf = (c: EquityColumn) => (c.contributions.kobo > 0 ? c.contributions.kobo : 0);
  const distribOf = (c: EquityColumn) => (c.contributions.kobo < 0 ? c.contributions.kobo : 0);

  const th = "px-4 py-2 font-mont text-xs font-semibold text-gray-01";
  const cell = "px-4 py-2 text-right tabular-nums";
  // A movement cell: "-" for zero, otherwise the money (optionally tinted).
  const amt = (kobo: number, tint?: "profit") => kobo === 0
    ? <span className="text-gray-04">-</span>
    : <span className={cn("tabular-nums", tint === "profit" && kobo > 0 ? "text-green-01" : "text-black-01")}><Money kobo={kobo} currency={currency} align="right" /></span>;

  // One movement row across all component columns + the Total column.
  const row = (label: string, valueOf: (c: EquityColumn) => number, total: number, opts?: { bold?: boolean; band?: boolean; tint?: "profit" }) => (
    <tr className={cn("border-t border-white-02 font-mont text-sm",
      opts?.band ? "border-t-2 bg-violet-50/50 font-bold text-black-01" : opts?.bold ? "bg-gray-03/30 font-semibold text-gray-01" : "text-gray-01")}>
      <td className="px-4 py-2">{label}</td>
      {cols.map((c) => <td key={c.key} className={cell}>{amt(valueOf(c), opts?.tint)}</td>)}
      <td className={cn(cell, "font-semibold")}>{amt(total, opts?.tint)}</td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={period} onChange={setPeriod} className="w-44">
          <option value="">Year to date</option>
          {periods.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </Select>
        <div className="flex items-center gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <button key={f} onClick={() => downloadReportExport("/finance/reports/changes-in-equity/", { entity, period: period || undefined }, f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:border-primary hover:text-primary">
              <Download className="size-3.5" /> {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(INFORMATION_CARD_SURFACE, "overflow-x-auto rounded-md", isFetching && "opacity-60")}>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F1F1F1] text-left">
              <th className={th}>Component</th>
              {cols.map((c) => <th key={c.key} className={cn(th, "text-right")}>{colLabel(c)}</th>)}
              <th className={cn(th, "text-right")}>Total equity</th>
            </tr>
          </thead>
          <tbody>
            {row("Opening balance", (c) => c.opening.kobo, d.total_opening.kobo, { bold: true })}
            {row("Profit for the period", (c) => c.profit.kobo, d.total_profit.kobo, { tint: "profit" })}
            {row("Contributions", contribOf, sum(contribOf))}
            {row("Distributions", distribOf, sum(distribOf))}
            {row("Closing balance", (c) => c.closing.kobo, d.total_closing.kobo, { band: true })}
          </tbody>
        </table>
      </div>

      <div className={cn("flex items-center gap-2 rounded-md px-4 py-2.5 font-mont text-sm font-medium",
        d.is_reconciled ? "bg-green-01/10 text-green-01" : "bg-destructive/10 text-destructive")}>
        {d.is_reconciled ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        {d.is_reconciled
          ? <span>Reconciles to balance-sheet equity · {formatMoney(d.total_closing.kobo, currency)}</span>
          : <span>Closing equity {formatMoney(d.total_closing.kobo, currency)} doesn't match the balance sheet ({formatMoney(d.balance_sheet_equity.kobo, currency)}).</span>}
      </div>
    </div>
  );
}
