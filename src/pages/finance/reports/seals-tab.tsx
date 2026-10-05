/**
 * Reports & Close > Sealed Figures: prove the closed months and years have not
 * moved.
 *
 * Every month close, month lock and year close stores each account's balance
 * per branch and a checksum over the period's ledger lines, chained to the seal
 * before it. This screen asks the server to recompute every current seal from
 * the ledger and compare: it lists each closed month and year as matching, or
 * names the balances that moved, what was sealed and what the ledger says now.
 * Nothing is written and nothing is repaired; it is the auditor's check.
 *
 * A seal covers every branch's figures, so the server keeps the check for a
 * reader who covers the whole school. A branch's own bursar is told so here
 * rather than sent to a refusal. The check recomputes the whole ledger, so it
 * runs when asked, not on every visit.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";

import { Money, useReaderBranchLens } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/finance-ui/states";
import { noAccessMessage } from "@/components/finance-ui/no-access";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLazyVerifySealsQuery } from "@/redux/services/finance/records-api";
import { useGetFiscalYearsQuery } from "@/redux/services/finance/ops-api";
import { toArray } from "@/redux/services/finance/api-types";
import type { SealCheck, SealVerification } from "@/redux/services/finance/records-types";
import { P } from "../../../permissions";
import { useReaderReach } from "../../../host";
import { useDates } from "../../../lib/display-prefs";
import { isForbidden } from "../../../lib/api-errors";

export const SEALS_DESCRIPTION = "Every closed month and year, recomputed from the ledger and compared with the figures sealed when it closed.";

const KIND_LABEL: Record<string, string> = {
  PERIOD_CLOSED: "Month closed",
  PERIOD_LOCKED: "Month locked",
  YEAR_CLOSED: "Year closed",
};

/** The one-line verdict above the list. */
export function sealVerdict(result: Pick<SealVerification, "ok" | "checked" | "mismatches" | "chain_breaks">): string {
  if (result.checked === 0) return "Nothing is sealed yet. A month is sealed when it is closed.";
  const things = (n: number) => `${n} sealed ${n === 1 ? "month or year" : "months and years"}`;
  if (result.ok) return `All ${things(result.checked)} still match the ledger.`;
  const parts = [];
  if (result.mismatches) parts.push(`${result.mismatches} of ${things(result.checked)} differ from the ledger.`);
  if (result.chain_breaks.length) {
    parts.push(`${result.chain_breaks.length} ${result.chain_breaks.length === 1 ? "seal does" : "seals do"} not follow the seal before it.`);
  }
  return parts.join(" ");
}

const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs";

function Differences({ check, showBranch, currency }: { check: SealCheck; showBranch: boolean; currency?: string | null }) {
  if (!check.differences.length) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-white-02">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr>
            {showBranch ? <th className={thCls}>Branch</th> : null}
            <th className={thCls}>Account</th>
            <th className={cn(thCls, "text-right")}>Sealed debit</th>
            <th className={cn(thCls, "text-right")}>Sealed credit</th>
            <th className={cn(thCls, "text-right")}>Debit now</th>
            <th className={cn(thCls, "text-right")}>Credit now</th>
          </tr>
        </thead>
        <tbody>
          {check.differences.map((row) => (
            <tr key={`${row.branch_id ?? "none"}-${row.account_id}`}>
              {showBranch ? <td className={cn(tdCls, "text-gray-05")}>{row.branch_name ?? "No branch"}</td> : null}
              <td className={cn(tdCls, "text-gray-01")}><span className="tabular-nums text-gray-05">{row.account_code}</span> {row.account_name}</td>
              <td className={cn(tdCls, "text-right")}><Money kobo={row.sealed.debit.kobo} currency={currency} align="right" /></td>
              <td className={cn(tdCls, "text-right")}><Money kobo={row.sealed.credit.kobo} currency={currency} align="right" /></td>
              <td className={cn(tdCls, "text-right font-semibold")}><Money kobo={row.now.debit.kobo} currency={currency} align="right" /></td>
              <td className={cn(tdCls, "text-right font-semibold")}><Money kobo={row.now.credit.kobo} currency={currency} align="right" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckRow({ check, showBranch, currency }: { check: SealCheck; showBranch: boolean; currency?: string | null }) {
  const dates = useDates();
  return (
    <li className={cn("rounded-md border bg-white p-3", check.ok ? "border-white-02" : "border-red-200 bg-red-50/40")}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mont text-sm font-semibold text-gray-01">{check.label}</p>
          <p className="mt-0.5 font-mont text-[11px] text-gray-05">
            {KIND_LABEL[check.kind] ?? check.kind} · sealed {dates.dateTime(check.sealed_at)} · {check.line_count} ledger {check.line_count === 1 ? "line" : "lines"}
            {check.line_count_now !== check.line_count ? `, ${check.line_count_now} now` : ""}
          </p>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-0.5 font-mont text-[11px] font-medium",
          check.ok ? "bg-green-01/10 text-green-01" : "bg-destructive/10 text-destructive",
        )}>
          {check.ok ? <CheckCircle2 className="size-3" /> : <TriangleAlert className="size-3" />}
          {check.ok ? "Matches" : "Differs"}
        </span>
      </div>
      {check.summary ? <p className="mt-2 font-mont text-xs leading-5 text-gray-01">{check.summary}</p> : null}
      <Differences check={check} showBranch={showBranch} currency={currency} />
    </li>
  );
}

export function SealsReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const { wholeSchool } = useReaderReach();
  const showBranch = useReaderBranchLens().applies;
  const allowed = can(P.FIN_VIEW_SEALS) && wholeSchool;
  const [year, setYear] = useState("");
  const yearsQ = useGetFiscalYearsQuery({ entity, include_archived: "true" }, { skip: !allowed });
  const years = useMemo(
    () => [...toArray(yearsQ.data?.data)].sort((a, b) => b.year - a.year),
    [yearsQ.data],
  );
  const [verify, result] = useLazyVerifySealsQuery();

  if (!can(P.FIN_VIEW_SEALS)) {
    return <EmptyState title="No access to sealed figures" message={noAccessMessage("verify the sealed figures")} />;
  }
  if (!wholeSchool) {
    return <ForbiddenState message="Only a school-wide reader can see the sealed figures, because they cover every branch." />;
  }

  const run = () => { void verify({ entity, ...(year ? { fiscal_year: Number(year) } : {}) }); };
  const data = result.data?.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Fiscal year"
          value={year}
          onChange={(event) => setYear(event.target.value)}
          className="h-9 w-full rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none sm:w-48"
        >
          <option value="">Every closed year</option>
          {years.map((row) => <option key={row.id} value={row.year}>FY {row.year}{row.is_archived ? " · Archived" : ""}</option>)}
        </select>
        <Button onClick={run} disabled={result.isFetching} className="w-full gap-1.5 sm:w-auto">
          <ShieldCheck className="size-4" />{result.isFetching ? "Checking…" : "Verify sealed figures"}
        </Button>
      </div>

      {result.isFetching ? (
        <LoadingState rows={4} label="Recomputing the sealed figures…" />
      ) : result.isError ? (
        isForbidden(result.error)
          ? <ForbiddenState message="Only a school-wide reader can see the sealed figures, because they cover every branch." />
          : <ErrorState onRetry={run} />
      ) : !data ? (
        <div className="rounded-md border border-white-02 bg-white">
          <EmptyState title="Not checked yet" message="Run the check to recompute every closed month and year from the ledger and compare it with its seal." />
        </div>
      ) : (
        <>
          <div role="status" className={cn(
            "flex items-start gap-2.5 rounded-md px-4 py-3 ring-1",
            data.ok ? "bg-green-01/5 ring-green-01/25" : "bg-destructive/5 ring-destructive/25",
          )}>
            {data.ok
              ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-01" />
              : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
            <p className={cn("font-mont text-sm font-semibold", data.ok ? "text-gray-01" : "text-destructive")}>{sealVerdict(data)}</p>
          </div>
          {data.checks.length ? (
            <ul className="space-y-2">
              {[...data.checks].sort((a, b) => Number(a.ok) - Number(b.ok)).map((check) => (
                <CheckRow key={check.seal_id} check={check} showBranch={showBranch} currency={currency} />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
