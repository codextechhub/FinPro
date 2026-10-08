/**
 * The four statements that make up the school's IFRS for SMEs filing.
 *
 * The pack is one filing for the whole school, so a reader whose reach covers
 * only some branches is stopped before the request. Every statement subtitle
 * comes from the response because the export uses those same strings. This
 * keeps a downloaded filing and the screen it came from on the same window.
 */

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Eye } from "lucide-react";

import { Money } from "@/components/finance-ui";
import { ForbiddenState, ErrorState, LoadingState } from "@/components/finance-ui/states";
import { ReportPeriodHeading } from "@/components/finance-ui/report-period-heading";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { cn } from "@/lib/utils";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import { toArray } from "@/redux/services/finance/api-types";
import { useGetStatutoryPackQuery } from "@/redux/services/finance/reports-api";
import type { BalanceSheetGroup, BalanceSheetSection, ReportMoney } from "@/redux/services/finance/reports-types";
import { viewReportExport } from "@/utils/finance-export";
import { useReaderReach } from "../../../host";
import { useDates } from "../../../lib/display-prefs";
import { isForbidden } from "../../../lib/api-errors";
import { includeArchivedArg, useShowArchived } from "@/components/finance-ui/archived-years";
import { periodParams } from "./period-params";
import { currentFiscalYearChoice, EQUITY_NO_PERIOD, incomeStatementNoPeriod } from "./report-period-words";
import { useDefaultFiscalYear } from "./use-default-fiscal-year";
import { STATUTORY_PACK_REACH_MESSAGE, statutoryPackRefusal } from "./statutory-pack-access";

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select
      aria-label="Reporting period"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none sm:w-56"
    >
      {children}
    </select>
  );
}

function StatementCard({ title, heading, children, testId }: {
  title: string;
  heading: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section data-testid={testId} className={cn(INFORMATION_CARD_SURFACE, "min-w-0 overflow-hidden rounded-md")}>
      <div className="border-b border-white-02 px-4 py-3">
        <h2 className="font-mont text-sm font-semibold text-gray-01">{title}</h2>
        <ReportPeriodHeading label={heading} fallback={heading} />
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "bg-[#F1F1F1] px-4 py-2 text-left font-mont text-xs font-semibold text-gray-01";
const td = "border-t border-white-02 px-4 py-2 font-mont text-sm text-gray-01";

function Amount({ value, currency }: { value: ReportMoney; currency?: string | null }) {
  return <Money kobo={value.kobo} currency={currency} align="right" />;
}

function GroupRows({ groups, currency }: { groups: BalanceSheetGroup[]; currency?: string | null }) {
  return groups.map((group) => (
    <tr key={group.line}>
      <td className={td}>{group.label}</td>
      <td className={cn(td, "text-right tabular-nums text-black-01")}><Amount value={group.amount} currency={currency} /></td>
    </tr>
  ));
}

function PositionRows({ sections, currency }: { sections: BalanceSheetSection[]; currency?: string | null }) {
  return sections.map((section) => (
    <Fragment key={section.key}>
      <tr className="bg-blue-50 font-mont text-[11px] font-semibold uppercase tracking-wide text-blue-700">
        <td className="px-4 py-1.5" colSpan={2}>{section.label}</td>
      </tr>
      <GroupRows groups={section.groups} currency={currency} />
      <tr className="border-t border-gray-03 bg-gray-03/30 font-mont text-sm font-semibold text-gray-01">
        <td className="px-4 py-2">Total {section.label.toLowerCase()}</td>
        <td className="px-4 py-2 text-right tabular-nums"><Amount value={section.total} currency={currency} /></td>
      </tr>
    </Fragment>
  ));
}

export function StatutoryPackReport({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const { wholeSchool } = useReaderReach();
  const [asOf, setAsOf] = useState(() => dates.today());
  const [span, setSpan] = useState("");
  const [showArchived] = useShowArchived();
  const periodsQuery = useGetPeriodsQuery(
    { entity, ...includeArchivedArg(showArchived) },
    { skip: !wholeSchool },
  );
  const periods = useMemo(() => [...toArray(periodsQuery.data?.data)]
    .sort((a, b) => (b.fiscal_year - a.fiscal_year) || (a.period_no - b.period_no)), [periodsQuery.data]);
  const years = useMemo(() => [...new Set(periods.map((period) => period.fiscal_year))], [periods]);
  const windowParams = span.startsWith("fy:")
    ? { fiscal_year: Number(span.slice(3)) }
    : periodParams(periods, span);
  const query = useGetStatutoryPackQuery(
    { entity, as_of: asOf, ...windowParams },
    { skip: !wholeSchool },
  );
  const data = query.data?.data;
  const defaultYear = useDefaultFiscalYear(span === "", data?.fiscal_year, !query.isFetching);

  if (!wholeSchool) return <ForbiddenState message={STATUTORY_PACK_REACH_MESSAGE} />;
  if (query.isLoading) return <LoadingState rows={8} label="Loading statutory pack…" />;
  if (isForbidden(query.error)) return <ForbiddenState message={statutoryPackRefusal(query.error)} />;
  if (query.isError || !data) return <ErrorState onRetry={query.refetch} />;

  const position = data.statement_of_financial_position;
  const income = data.income_statement;
  const cash = data.cash_flow;
  const equity = data.changes_in_equity;
  const exportParams = { entity, as_of: asOf, ...windowParams };
  const heading = data.headings;
  const positionHeading = heading.statement_of_financial_position || `as at ${dates.day(data.as_of)}`;
  const incomeHeading = heading.income_statement || data.period_label || incomeStatementNoPeriod(data.fiscal_year);
  const cashHeading = heading.cash_flow || data.period_label || incomeStatementNoPeriod(data.fiscal_year);
  const equityHeading = heading.changes_in_equity || data.period_label || EQUITY_NO_PERIOD;
  const totalLiabilitiesAndEquity = position.total_liabilities.kobo + position.total_equity.kobo;
  const activityLabel: Record<string, string> = {
    operating: "Operating activities",
    investing: "Investing activities",
    financing: "Financing activities",
  };

  return (
    <div className={cn("min-w-0 space-y-5", query.isFetching && "opacity-60")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
          <label className="min-w-0 font-mont text-xs text-gray-05">
            <span className="mb-1 block">Position as at</span>
            <DatePickerInput
              id="statutory-pack-as-of"
              aria-label="Position as at"
              required
              value={asOf}
              onChange={(event) => { if (event.target.value) setAsOf(event.target.value); }}
              className="h-9 w-full max-w-full border border-white-02 px-2.5 font-mont text-xs font-medium"
            />
          </label>
          <label className="min-w-0 font-mont text-xs text-gray-05">
            <span className="mb-1 block">Statement window</span>
            <Select value={span} onChange={setSpan}>
              <option value="">{currentFiscalYearChoice(defaultYear)}</option>
              <optgroup label="Whole fiscal year">
                {years.map((year) => <option key={year} value={`fy:${year}`}>FY {year} (whole year)</option>)}
              </optgroup>
              <optgroup label="One period">
                {periods.map((period) => <option key={period.id} value={String(period.id)}>{period.label}</option>)}
              </optgroup>
            </Select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((format) => (
            <button
              key={format}
              onClick={() => viewReportExport("/finance/reports/statutory-pack/", exportParams, format)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white-02 px-2.5 py-1.5 font-mont text-xs font-semibold text-gray-01 hover:border-primary hover:text-primary"
            >
              <Eye className="size-3.5" /> {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <StatementCard title="Statement of financial position" heading={positionHeading} testId="statutory-position">
        <table className="w-full min-w-[520px]">
          <thead><tr><th className={th}>IFRS for SMEs line</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
          <tbody><PositionRows sections={position.sections} currency={currency} /></tbody>
          <tfoot>
            <tr className="border-t-2 border-white-02 bg-white-02/50 font-mont text-sm font-bold text-black-01">
              <td className="px-4 py-2.5">Total assets</td><td className="px-4 py-2.5 text-right"><Amount value={position.total_assets} currency={currency} /></td>
            </tr>
            <tr className="border-t border-white-02 font-mont text-sm font-bold text-black-01">
              <td className="px-4 py-2.5">Total liabilities and equity</td><td className="px-4 py-2.5 text-right"><Money kobo={totalLiabilitiesAndEquity} currency={currency} align="right" /></td>
            </tr>
          </tfoot>
        </table>
      </StatementCard>

      <StatementCard title="Income statement" heading={incomeHeading} testId="statutory-income">
        <table className="w-full min-w-[520px]">
          <thead><tr><th className={th}>IFRS for SMEs line</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
          <tbody><GroupRows groups={income.lines} currency={currency} /></tbody>
          <tfoot><tr className="border-t-2 border-white-02 bg-white-02/50 font-mont text-sm font-bold text-black-01">
            <td className="px-4 py-2.5">Net income</td><td className="px-4 py-2.5 text-right"><Amount value={income.net_income} currency={currency} /></td>
          </tr></tfoot>
        </table>
      </StatementCard>

      <StatementCard title="Cash flow statement" heading={cashHeading} testId="statutory-cash-flow">
        <table className="w-full min-w-[520px]">
          <thead><tr><th className={th}>Activity</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
          <tbody>
            {Object.entries(cash.by_activity).map(([key, amount]) => (
              <tr key={key}><td className={td}>{activityLabel[key] ?? key}</td><td className={cn(td, "text-right")}><Amount value={amount} currency={currency} /></td></tr>
            ))}
            <tr><td className={td}>Net change in cash</td><td className={cn(td, "text-right font-semibold")}><Amount value={cash.net_change} currency={currency} /></td></tr>
            <tr><td className={td}>Cash at start of period</td><td className={cn(td, "text-right")}><Amount value={cash.opening_cash} currency={currency} /></td></tr>
          </tbody>
          <tfoot><tr className="border-t-2 border-white-02 bg-white-02/50 font-mont text-sm font-bold text-black-01">
            <td className="px-4 py-2.5">Cash at end of period</td><td className="px-4 py-2.5 text-right"><Amount value={cash.closing_cash} currency={currency} /></td>
          </tr></tfoot>
        </table>
      </StatementCard>

      <StatementCard title="Statement of changes in equity" heading={equityHeading} testId="statutory-equity">
        <table className="w-full min-w-[520px]">
          <thead><tr><th className={th}>Movement</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
          <tbody>
            {([
              ["Opening balance", equity.total_opening],
              ["Profit for the period", equity.total_profit],
              ["Contributions", equity.total_contributions],
              ["Transfers and distributions", equity.total_transfers],
            ] as [string, ReportMoney][]).map(([label, amount]) => (
              <tr key={label}><td className={td}>{label}</td><td className={cn(td, "text-right")}><Amount value={amount} currency={currency} /></td></tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-white-02 bg-white-02/50 font-mont text-sm font-bold text-black-01">
            <td className="px-4 py-2.5">Closing balance</td><td className="px-4 py-2.5 text-right"><Amount value={equity.total_closing} currency={currency} /></td>
          </tr></tfoot>
        </table>
      </StatementCard>

      {position.is_balanced && cash.is_reconciled && equity.is_reconciled ? (
        <div className="flex items-center gap-2 rounded-md bg-green-01/10 px-4 py-2.5 font-mont text-sm font-medium text-green-01">
          <CheckCircle2 className="size-4" /> The filing statements reconcile.
        </div>
      ) : null}
    </div>
  );
}
