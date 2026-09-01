// Cost & Dimension Analysis (analytics slice) - net activity per account, bucketed by one
// analytical axis: a cost centre or a registered dimension. Reads posted journal lines
// (the trial balance can't answer "per bucket"). Axis + period + account-type filters,
// KPIs, a bucket-grouped table with per-bucket subtotals, and the real backend export.

import { useMemo, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { KpiCard } from "@/components/finance-ui";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { downloadReportExport } from "@/utils/finance-export";
import { useGetAnalyticsSliceQuery } from "@/redux/services/finance/reports-api";
import { useGetPeriodsQuery, useGetDimensionsQuery } from "@/redux/services/finance/setup-api";
import { toArray } from "@/redux/services/finance/api-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const TYPE_STYLE: Record<string, string> = {
  ASSET: "bg-blue-50 text-blue-700", LIABILITY: "bg-amber-50 text-amber-700",
  EQUITY: "bg-violet-50 text-violet-700", INCOME: "bg-green-01/10 text-green-01",
  EXPENSE: "bg-rose-50 text-rose-700",
};
const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const cap = (t: string) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const signed = (kobo: number, currency?: string | null) => `${kobo < 0 ? "−" : ""}${formatMoney(Math.abs(kobo), currency)}`;

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

export function AnalyticsSliceReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const [axis, setAxis] = useState("cost_center");
  const [period, setPeriod] = useState("");
  const [acctType, setAcctType] = useState("");

  const { data: periodsData } = useGetPeriodsQuery({ entity });
  const periods = useMemo(() => [...(periodsData?.data ?? [])]
    .sort((a, b) => (a.fiscal_year - b.fiscal_year) || (a.period_no - b.period_no)), [periodsData]);

  const { data: dimsData } = useGetDimensionsQuery({ entity });
  const dims = toArray(dimsData?.data).filter((d) => d.is_active);

  const params = { entity, axis, ...(period ? { period } : {}), ...(acctType ? { account_type: acctType } : {}) };
  const { data, isLoading, isFetching, isError, refetch } = useGetAnalyticsSliceQuery(params);
  const sl = data?.data;

  // Group rows by bucket (rows arrive sorted by bucket then code).
  const groups = useMemo(() => {
    type SliceRow = NonNullable<typeof sl>["rows"][number];
    const m = new Map<string, SliceRow[]>();
    for (const r of sl?.rows ?? []) {
      if (!m.has(r.bucket)) m.set(r.bucket, []);
      m.get(r.bucket)!.push(r);
    }
    return [...m.entries()];
  }, [sl]);

  if (isLoading) return <LoadingState />;
  if (isError || !sl) return <ErrorState onRetry={refetch} />;

  const periodLabel = periods.find((p) => String(p.id) === period)?.name;
  const axisLabel = axis === "cost_center" ? "Cost centre" : (dims.find((d) => d.code === axis)?.name || axis);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Axis" value={axisLabel} foot={periodLabel || "All periods"} />
        <KpiCard label="Buckets" value={String(Object.keys(sl.bucket_totals).length)} foot="Distinct values" />
        <KpiCard label="Accounts" value={String(sl.rows.length)} foot={acctType ? `${acctType.toLowerCase()} only` : "with activity"} />
        <KpiCard label="Total net" value={signed(sl.total_net.kobo, currency)} foot="Debit − credit" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={axis} onChange={setAxis} className="w-44">
            <option value="cost_center">Cost centre</option>
            {dims.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </Select>
          <Select value={period} onChange={setPeriod} className="w-40">
            <option value="">All periods</option>
            {periods.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </Select>
          <Select value={acctType} onChange={setAcctType} className="w-40">
            <option value="">All account types</option>
            {TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <button key={f} onClick={() => downloadReportExport("/finance/reports/analytics-slice/", { entity, axis, period: period || undefined, account_type: acctType || undefined }, f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:border-primary hover:text-primary">
              <Download className="size-3.5" /> {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(INFORMATION_CARD_SURFACE, "overflow-x-auto rounded-md", isFetching && "opacity-60")}>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F1F1F1] text-left font-mont text-xs font-semibold text-gray-01">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          {groups.map(([bucket, rows]) => (
            <tbody key={bucket} className="border-t-4 border-white-02/60">
              <tr className="bg-white-02/40 font-mont text-xs font-semibold text-gray-01">
                <td className="px-3 py-2" colSpan={3}>{bucket}</td>
                <td className="px-3 py-2 text-right tabular-nums">{signed(sl.bucket_totals[bucket]?.kobo ?? 0, currency)}</td>
              </tr>
              {rows.map((r) => (
                <tr key={`${bucket}-${r.account_id}`} className="border-t border-white-02 font-mont text-sm">
                  <td className="px-3 py-2 tabular-nums text-gray-05">{r.code}</td>
                  <td className="px-3 py-2 font-medium text-gray-01">{r.name}</td>
                  <td className="px-3 py-2"><span className={cn(PILL, TYPE_STYLE[r.account_type] ?? "bg-gray-02 text-gray-01")}>{cap(r.account_type)}</span></td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.net.kobo < 0 ? "text-destructive" : "text-black-01")}>{signed(r.net.kobo, currency)}</td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t-2 border-white-02 bg-white-02/40 font-mont text-sm font-semibold">
              <td className="px-3 py-2.5" colSpan={3}>Total net</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{signed(sl.total_net.kobo, currency)}</td>
            </tr>
          </tfoot>
        </table>
        {!sl.rows.length ? <p className="px-3 py-10 text-center font-mont text-sm text-gray-05">No posted activity for this axis{acctType ? ` of type ${acctType.toLowerCase()}` : ""}.</p> : null}
      </div>
    </div>
  );
}
