// Reports & month-end (§6.9) - one page per statement / the period-close list,
// driven by the :section route param.

import { type ReactNode } from "react";
import { DEFAULT_REPORTS_SECTION, type ReportsSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity, InfoHint } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { IncomeStatementReport } from "./income-statement-tab";
import { BalanceSheetReport } from "./balance-sheet-tab";
import { CashFlowReport } from "./cash-flow-tab";
import { EquityReport } from "./equity-tab";
import { TrialBalanceReport } from "./trial-balance-tab";
import { AnalyticsSliceReport } from "./analytics-slice-tab";
import { PeriodsTab } from "./periods-tab";
import { PageShell } from "@/components/layout/page-shell";

const LABELS: Record<string, string> = {
  "trial-balance": "Trial Balance", "income-statement": "Income Statement (P&L)",
  "balance-sheet": "Balance Sheet", "cash-flow": "Cash Flow",
  "changes-in-equity": "Changes in Equity", analytics: "Cost & Dimension Analysis",
  periods: "Periods & Close",
};

// Optional explainer shown as an ⓘ beside the page title, per section.
const TITLE_HINT: Record<string, ReactNode> = {
  "income-statement": (
    <>The P&amp;L tells you whether the entity is making or losing money - revenue (what was earned or invoiced) less the expenses of running it. The difference is <span className="font-semibold">net income</span>, which closes to Retained Earnings at year-end.</>
  ),
  analytics: (
    <>Net posted activity per account, grouped by one analytical axis - a <span className="font-semibold">cost centre</span> or a <span className="font-semibold">dimension</span> (e.g. fund, project). Only lines tagged on that axis are shown. Net is debit − credit, so it reads naturally for both sides of the books.</>
  ),
  "balance-sheet": (
    <>The fundamental accounting equation: <span className="font-semibold">Assets = Liabilities + Equity</span>. Both sides must balance. The balance sheet is a snapshot at a point in time - unlike the P&L, which covers a period.</>
  ),
  "cash-flow": (
    <>Where cash actually came from and went - the <span className="font-semibold">direct method</span>: every posted transaction that moved cash, grouped into operating, investing and financing. Opening cash plus the net change equals closing cash.</>
  ),
  "changes-in-equity": (
    <>How each equity component moved over the period: <span className="font-semibold">opening + profit + contributions − distributions = closing</span>. Closing equity reconciles to the balance sheet.</>
  ),
};

/** `section` comes from the route table; see console-sections.ts. */
export default function ReportsPage({ section = DEFAULT_REPORTS_SECTION }: {
  section?: ReportsSection;
}) {
  const { code: entity, currency } = useActiveEntity();

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={`finance-reports.${section}.workspace`}>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-mont text-lg font-semibold text-gray-01">{LABELS[section] ?? "Reports & Month-End"}</h1>
            {TITLE_HINT[section] ? <InfoHint ariaLabel={`About ${LABELS[section] ?? "financial reports"}`}>{TITLE_HINT[section]}</InfoHint> : null}
          </div>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Financial statements (exportable) and the period-close checklist.</p>
        </div>
        {!entity ? (
          <EmptyState title="Select an entity" />
        ) : section === "income-statement" ? (
          <IncomeStatementReport entity={entity} currency={currency} />
        ) : section === "balance-sheet" ? (
          <BalanceSheetReport entity={entity} currency={currency} />
        ) : section === "cash-flow" ? (
          <CashFlowReport entity={entity} currency={currency} />
        ) : section === "changes-in-equity" ? (
          <EquityReport entity={entity} currency={currency} />
        ) : section === "analytics" ? (
          <AnalyticsSliceReport entity={entity} currency={currency} />
        ) : section === "periods" ? (
          <PeriodsTab entity={entity} />
        ) : (
          <TrialBalanceReport entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
