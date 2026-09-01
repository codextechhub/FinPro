// Balance Sheet - rebuilt to the Vision prototype in the house theme. A two-column
// Statement of Financial Position: Assets on the left; Liabilities & Equity on the
// right, each grouped into IFRS sections (current / non-current) with subtotals, and
// a balances banner (Assets = Liabilities + Equity). Rows are IFRS presentation lines
// from the backend; money + is_balanced come straight from the endpoint; export is the
// real backend CSV/XLSX/PDF.

import { useMemo, useState } from "react";
import { Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { Money } from "@/components/finance-ui";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { downloadReportExport } from "@/utils/finance-export";
import { useGetBalanceSheetQuery } from "@/redux/services/finance/reports-api";
import type { BalanceSheetSection } from "@/redux/services/finance/reports-types";

const BAND: Record<string, string> = {
  asset: "bg-blue-50 text-blue-700",
  liability: "bg-amber-50 text-amber-700",
  equity: "bg-violet-50 text-violet-700",
};
// A titled panel wrapping a balance-sheet column's rows. Declared at module
// scope so it isn't recreated (and its subtree remounted) on every render.
function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn(INFORMATION_CARD_SURFACE, "overflow-hidden rounded-md")}>
      <div className="border-b border-white-02 px-4 py-2.5 font-mont text-sm font-semibold text-gray-01">{title}</div>
      <table className="w-full"><tbody>{children}</tbody></table>
    </div>
  );
}

export function BalanceSheetReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const [asOf, setAsOf] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const { data, isLoading, isFetching, isError, refetch } = useGetBalanceSheetQuery({ entity, as_of: asOf });
  const d = data?.data;
  const byKey = useMemo(() => Object.fromEntries((d?.sections ?? []).map((s) => [s.key, s])), [d]);

  if (isLoading) return <LoadingState />;
  if (isError || !d) return <ErrorState onRetry={refetch} />;

  // A section's band + its IFRS line rows + a subtotal row (skips empty sections).
  const section = (s: BalanceSheetSection | undefined, tone: keyof typeof BAND) => {
    if (!s || !s.groups.length) return null;
    return (
      <>
        <tr className={cn("font-mont text-[11px] font-semibold uppercase tracking-wide", BAND[tone])}>
          <td className="px-4 py-1.5" colSpan={2}>{s.label}</td>
        </tr>
        {s.groups.map((g) => (
          <tr key={g.line} className="border-t border-white-02 font-mont text-sm">
            <td className="px-4 py-2 text-gray-01">{g.label}</td>
            <td className="px-4 py-2 text-right tabular-nums text-black-01"><Money kobo={g.amount.kobo} currency={currency} align="right" /></td>
          </tr>
        ))}
        <tr className="border-t border-gray-03 bg-gray-03/30 font-mont text-sm font-semibold text-gray-01">
          <td className="px-4 py-2">Total {s.label.toLowerCase()}</td>
          <td className="px-4 py-2 text-right tabular-nums"><Money kobo={s.total.kobo} currency={currency} align="right" /></td>
        </tr>
      </>
    );
  };

  const grandRow = (label: string, kobo: number) => (
    <tr className="border-t-2 border-white-02 bg-white-02/50 font-mont text-[15px] font-bold text-black-01">
      <td className="px-4 py-2.5">{label}</td>
      <td className="px-4 py-2.5 text-right tabular-nums"><Money kobo={kobo} currency={currency} align="right" /></td>
    </tr>
  );

  const liabEquity = d.total_liabilities.kobo + d.total_equity.kobo;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 max-w-full items-center gap-2 font-mont text-xs text-gray-05">
          <span className="shrink-0">As of</span>
          <div className="w-fit max-w-full overflow-hidden rounded-md">
            <DatePickerInput
              id="balance-sheet-as-of"
              aria-label="As of date"
              required
              value={asOf}
              onChange={(event) => {
                if (event.target.value) setAsOf(event.target.value);
              }}
              className="h-9 w-auto max-w-full gap-2 overflow-hidden border border-white-02 px-2.5 font-mont text-xs font-medium"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((f) => (
            <button key={f} onClick={() => downloadReportExport("/finance/reports/balance-sheet/", { entity, as_of: asOf }, f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:border-primary hover:text-primary">
              <Download className="size-3.5" /> {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-4 lg:grid-cols-2", isFetching && "opacity-60")}>
        <Column title="Assets">
          {section(byKey["current_assets"], "asset")}
          {section(byKey["non_current_assets"], "asset")}
          {grandRow("TOTAL ASSETS", d.total_assets.kobo)}
        </Column>

        <Column title="Liabilities & Equity">
          {section(byKey["current_liabilities"], "liability")}
          {section(byKey["non_current_liabilities"], "liability")}
          <tr className="border-t border-gray-03 bg-gray-03/30 font-mont text-sm font-semibold text-gray-01">
            <td className="px-4 py-2">Total liabilities</td>
            <td className="px-4 py-2 text-right tabular-nums"><Money kobo={d.total_liabilities.kobo} currency={currency} align="right" /></td>
          </tr>
          {section(byKey["equity"], "equity")}
          {grandRow("TOTAL LIAB. & EQUITY", liabEquity)}
        </Column>
      </div>

      <div className={cn("flex items-center gap-2 rounded-md px-4 py-2.5 font-mont text-sm font-medium",
        d.is_balanced ? "bg-green-01/10 text-green-01" : "bg-destructive/10 text-destructive")}>
        {d.is_balanced ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        {d.is_balanced
          ? <span>Balance sheet balances · {formatMoney(d.total_assets.kobo, currency)} = {formatMoney(d.total_liabilities.kobo, currency)} + {formatMoney(d.total_equity.kobo, currency)}</span>
          : <span>Out of balance by {formatMoney(Math.abs(d.difference.kobo), currency)} - investigate before filing.</span>}
      </div>
    </div>
  );
}
