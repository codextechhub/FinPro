/**
 * Small pieces shared by the receivables screens that sit beside the invoice
 * cycle: payer payments, credit transfers, deferred income, the doubtful-debt
 * provision and deposits.
 *
 * `useBranchColumn` is the one place those screens decide whether a branch is
 * worth showing. At a school with one branch every row is that branch's, so the
 * column and the per-branch breakdowns are left out; at a school with several
 * they name the branch, read from the app's own branch list.
 */

import { useMemo } from "react";
import { Info } from "lucide-react";

import { useReaderBranchLens } from "@/components/finance-ui";
import { useBranches } from "../../../host";

/** A KPI tile in the receivables screens' own look. */
export function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-xl font-semibold tabular-nums text-black-01">{value}</p>
      {hint ? <p className="mt-0.5 font-mont text-[11px] text-gray-05">{hint}</p> : null}
    </div>
  );
}

/** A labelled value in a detail drawer. */
export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 break-words font-mont text-sm font-semibold tabular-nums text-black-01">{children}</div>
    </div>
  );
}

/** A quiet explanatory note: what a screen does, or why an action is not offered. */
export function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const cls = tone === "warn"
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-white-02 bg-gray-01/5 text-gray-05";
  return (
    <p className={`flex gap-2 rounded-md border px-3 py-2 font-mont text-xs leading-5 ${cls}`}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Whether rows should name their branch, and the name for an id. */
export function useBranchColumn() {
  const show = useReaderBranchLens().applies;
  const { data } = useBranches();
  const names = useMemo(
    () => new Map((data ?? []).map((b) => [Number(b.id), b.name])),
    [data],
  );
  return {
    show,
    name: (id: number | null | undefined, fallback?: string | null) =>
      fallback || (id == null ? "No branch" : names.get(id) ?? `Branch ${id}`),
  };
}

/** Plain-words label for a provision band's threshold. */
export function bandLabel(overDays: number | string): string {
  return `Over ${Number(overDays)} days`;
}

/** A rate in basis points as a percentage, without trailing zeros. */
export function bpsToPercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}
