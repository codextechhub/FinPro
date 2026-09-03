/**
 * Cash Flow Statement - rebuilt to the Vision prototype in the house theme. The
 * direct method: every posted journal that touches cash, classified into operating /
 * investing / financing, with each activity broken into its counter-account line items
 * (cash in +, cash out −). Ends on net change reconciling cash at start → cash at end.
 * Money + the reconciliation come straight from the endpoint; export is the real
 * backend CSV/XLSX/PDF.
 */

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { Money } from "@/components/finance-ui";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { downloadReportExport } from "@/utils/finance-export";
import { useGetCashFlowQuery } from "@/redux/services/finance/reports-api";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";

const BAND: Record<string, string> = {
  operating: "bg-green-01/10 text-green-01",
  investing: "bg-blue-50 text-blue-700",
  financing: "bg-violet-50 text-violet-700",
};
const ACTIVITIES: { key: string; label: string }[] = [
  { key: "operating", label: "Operating activities" },
  { key: "investing", label: "Investing activities" },
  { key: "financing", label: "Financing activities" },
];
const signed = (kobo: number, currency?: string | null) => `${kobo < 0 ? "−" : ""}${formatMoney(Math.abs(kobo), currency)}`;

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

export function CashFlowReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const [period, setPeriod] = useState("");   // "" = year to date, else fiscal period id

  const { data: periodsData } = useGetPeriodsQuery({ entity });
  const periods = useMemo(() => [...(periodsData?.data ?? [])]
    .sort((a, b) => (a.fiscal_year - b.fiscal_year) || (a.period_no - b.period_no)), [periodsData]);

  const { data, isLoading, isFetching, isError, refetch } = useGetCashFlowQuery({ entity, ...(period ? { period } : {}) });
  const d = data?.data;

  if (isLoading) return <LoadingState />;
  if (isError || !d) return <ErrorState onRetry={refetch} />;

  const numCell = "px-4 py-2 text-right tabular-nums";
  // A cash-out line (negative) reads red, like the prototype.
  const amountCell = (kobo: number) => (
    <span className={cn("tabular-nums", kobo < 0 ? "text-destructive" : "text-black-01")}>{signed(kobo, currency)}</span>
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
            <button key={f} onClick={() => downloadReportExport("/finance/reports/cash-flow/", { entity, period: period || undefined }, f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:border-primary hover:text-primary">
              <Download className="size-3.5" /> {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(INFORMATION_CARD_SURFACE, "overflow-x-auto rounded-md", isFetching && "opacity-60")}>
        <table className="w-full">
          <tbody>
            {ACTIVITIES.map(({ key, label }) => {
              const lines = d.activity_lines[key] ?? [];
              const subtotal = d.by_activity[key]?.kobo ?? 0;
              const verb = subtotal < 0 ? "used in" : "from";
              return (
                <Fragment key={key}>
                  <tr className={cn("font-mont text-[11px] font-semibold uppercase tracking-wide", BAND[key])}>
                    <td className="px-4 py-1.5" colSpan={2}>{label}</td>
                  </tr>
                  {lines.map((ln) => (
                    <tr key={`${key}-${ln.account_id}`} className="border-t border-white-02 font-mont text-sm">
                      <td className="px-4 py-2 text-gray-01">{ln.name}</td>
                      <td className={numCell}>{amountCell(ln.amount.kobo)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-03 bg-gray-03/30 font-mont text-sm font-semibold text-gray-01">
                    <td className="px-4 py-2">Net cash {verb} {key}</td>
                    <td className={numCell}>{amountCell(subtotal)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white-02 bg-white-02/50 font-mont text-[15px] font-bold text-black-01">
              <td className="px-4 py-2.5">Net {d.net_change.kobo < 0 ? "decrease" : "increase"} in cash</td>
              <td className={numCell}>{amountCell(d.net_change.kobo)}</td>
            </tr>
            <tr className="border-t border-white-02 font-mont text-sm text-gray-01">
              <td className="px-4 py-2">Cash at start of period</td>
              <td className={cn(numCell, "text-gray-05")}><Money kobo={d.opening_cash.kobo} currency={currency} align="right" /></td>
            </tr>
            <tr className="border-t border-white-02 font-mont text-sm font-semibold text-gray-01">
              <td className="px-4 py-2">Cash at end of period</td>
              <td className={numCell}><Money kobo={d.closing_cash.kobo} currency={currency} align="right" /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={cn("flex items-center gap-2 rounded-md px-4 py-2.5 font-mont text-sm font-medium",
        d.is_reconciled ? "bg-green-01/10 text-green-01" : "bg-destructive/10 text-destructive")}>
        {d.is_reconciled ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        {d.is_reconciled
          ? <span>Reconciles · {formatMoney(d.opening_cash.kobo, currency)} + {signed(d.net_change.kobo, currency)} = {formatMoney(d.closing_cash.kobo, currency)}</span>
          : <span>Does not reconcile - opening plus net change doesn't equal closing cash.</span>}
      </div>
    </div>
  );
}
