/**
 * Trial Balance - rebuilt to the Vision prototype in the house theme. The TB is the
 * balanced list of every account's net position; it's the input to the Income Statement
 * (income/expense) and Balance Sheet (asset/liability/equity), so an imbalance is
 * investigated before any other statement. KPIs + a period filter + account-type filter +
 * an optional compare-to-prior-period column (fetched as a second real TB call and merged
 * by account). Money + is_balanced come straight from the endpoint; export is the real
 * backend CSV/XLSX/PDF.
 */

import { useMemo, useState, type ReactNode } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { Download } from "lucide-react";
import { Money, KpiCard, InfoHint } from "@/components/finance-ui";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { downloadReportExport } from "@/utils/finance-export";
import { useGetTrialBalanceQuery } from "@/redux/services/finance/reports-api";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import type { TrialBalanceRow } from "@/redux/services/finance/reports-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const TYPE_STYLE: Record<string, string> = {
  ASSET: "bg-blue-50 text-blue-700",
  LIABILITY: "bg-amber-50 text-amber-700",
  EQUITY: "bg-violet-50 text-violet-700",
  INCOME: "bg-green-01/10 text-green-01",
  EXPENSE: "bg-rose-50 text-rose-700",
};
function TypePill({ t }: { t: string }) {
  return <span className={cn(PILL, TYPE_STYLE[t] ?? "bg-gray-02 text-gray-01")}>{t.charAt(0) + t.slice(1).toLowerCase()}</span>;
}

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const netOf = (r: TrialBalanceRow) => r.debit.kobo - r.credit.kobo;
const signed = (kobo: number, currency?: string | null) => `${kobo < 0 ? "−" : ""}${formatMoney(Math.abs(kobo), currency)}`;

export function TrialBalanceReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const [period, setPeriod] = useState("");      // "" = all periods, else fiscal period id
  const [acctType, setAcctType] = useState("");
  const [compare, setCompare] = useState(false);

  const { data: periodsData } = useGetPeriodsQuery({ entity });
  const periods = useMemo(() => [...(periodsData?.data ?? [])]
    .sort((a, b) => (a.fiscal_year - b.fiscal_year) || (a.period_no - b.period_no)), [periodsData]);

  // The prior fiscal period = the one immediately before the selected one.
  const priorId = useMemo(() => {
    if (!period) return null;
    const i = periods.findIndex((p) => String(p.id) === period);
    return i > 0 ? String(periods[i - 1].id) : null;
  }, [period, periods]);
  const comparing = compare && !!period && !!priorId;

  const { data, isLoading, isFetching, isError, refetch } = useGetTrialBalanceQuery({ entity, ...(period ? { period } : {}) });
  const prior = useGetTrialBalanceQuery(comparing ? { entity, period: priorId! } : skipToken);

  const tb = data?.data;
  const priorNetByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prior.data?.data.rows ?? []) m.set(r.code, netOf(r));
    return m;
  }, [prior.data]);

  const rows = useMemo(() => (tb?.rows ?? []).filter((r) => !acctType || r.account_type === acctType), [tb, acctType]);

  if (isLoading) return <LoadingState />;
  if (isError || !tb) return <ErrorState onRetry={refetch} />;

  const periodLabel = periods.find((p) => String(p.id) === period)?.name;
  const priorLabel = periods.find((p) => String(p.id) === priorId)?.name;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        <span className="font-mont text-sm font-semibold text-gray-01">Trial balance</span>
        <InfoHint ariaLabel="About the trial balance">
          The trial balance always totals equal - every debit has a matching credit. It's the input to the <span className="font-semibold">Income Statement</span> (income &amp; expense) and the <span className="font-semibold">Balance Sheet</span> (asset, liability &amp; equity); investigate any imbalance here before producing those.
        </InfoHint>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total debit" value={formatMoney(tb.total_debit.kobo, currency)} foot={periodLabel || "All periods"} />
        <KpiCard label="Total credit" value={formatMoney(tb.total_credit.kobo, currency)} foot={periodLabel || "All periods"} />
        <KpiCard label="Status" value={tb.is_balanced ? "Balanced" : "Out of balance"} tone={tb.is_balanced ? "live" : "alert"} foot={tb.is_balanced ? "Debits = Credits" : "Needs investigation"} />
        <KpiCard label="Accounts" value={String(rows.length)} foot={acctType ? `${acctType.toLowerCase()} only` : "with a balance"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onChange={(v) => { setPeriod(v); if (!v) setCompare(false); }} className="w-44">
            <option value="">All periods</option>
            {periods.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </Select>
          <Select value={acctType} onChange={setAcctType} className="w-40">
            <option value="">All account types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
          </Select>
          {period && priorId ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5 font-mont text-xs text-gray-01">
              <input type="checkbox" checked={comparing} onChange={(e) => setCompare(e.target.checked)} className="size-3.5 accent-primary" />
              Compare to prior period
            </label>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <button key={f} onClick={() => downloadReportExport("/finance/reports/trial-balance/", { entity, period: period || undefined }, f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:border-primary hover:text-primary">
              <Download className="size-3.5" /> {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(INFORMATION_CARD_SURFACE, "overflow-x-auto rounded-md")}>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F1F1F1] text-left font-mont text-xs font-semibold text-gray-01">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Credit</th>
              {comparing ? <><th className="px-3 py-2 text-right">Prior ({priorLabel})</th><th className="px-3 py-2 text-right">Change</th></> : null}
            </tr>
          </thead>
          <tbody className={cn(isFetching && "opacity-60")}>
            {rows.map((r) => {
              const cur = netOf(r);
              const pri = priorNetByCode.get(r.code) ?? 0;
              // Compare the balance's magnitude on its own side, so the figures line
              // up with the Debit/Credit columns (no confusing net-sign mismatch).
              const change = Math.abs(cur) - Math.abs(pri);
              return (
                <tr key={r.account_id} className="border-t border-white-02 font-mont text-sm">
                  <td className="px-3 py-2 tabular-nums text-gray-05">{r.code}</td>
                  <td className="px-3 py-2 font-medium text-gray-01">{r.name}</td>
                  <td className="px-3 py-2"><TypePill t={r.account_type} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.debit.kobo ? <Money kobo={r.debit.kobo} currency={currency} align="right" /> : "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.credit.kobo ? <Money kobo={r.credit.kobo} currency={currency} align="right" /> : "-"}</td>
                  {comparing ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-05">{pri ? formatMoney(Math.abs(pri), currency) : "-"}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", change > 0 ? "text-green-01" : change < 0 ? "text-destructive" : "text-gray-04")}>{change ? signed(change, currency) : "-"}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={comparing ? 7 : 5} className="px-3 py-10 text-center font-mont text-sm text-gray-05">No accounts with a balance{acctType ? ` of type ${acctType.toLowerCase()}` : ""}.</td></tr> : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white-02 bg-white-02/40 font-mont text-sm font-semibold">
              <td className="px-3 py-2.5" colSpan={3}>
                Total
                <span className={cn("ml-2", PILL, tb.is_balanced ? "bg-green-01/10 text-green-01" : "bg-destructive/10 text-destructive")}>{tb.is_balanced ? "Balanced ✓" : "Out of balance"}</span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums"><Money kobo={tb.total_debit.kobo} currency={currency} align="right" /></td>
              <td className="px-3 py-2.5 text-right tabular-nums"><Money kobo={tb.total_credit.kobo} currency={currency} align="right" /></td>
              {comparing ? <><td /><td /></> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
