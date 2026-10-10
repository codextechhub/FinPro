// Reports & month-end (§6.9) - one page per statement / the period-close list,
// driven by the :section route param.

import { useState } from "react";
import { DEFAULT_REPORTS_SECTION, type ReportsSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity, InfoHint } from "@/components/finance-ui";
import { IncomeStatementReport } from "./income-statement-tab";
import { BalanceSheetReport } from "./balance-sheet-tab";
import { CashFlowReport } from "./cash-flow-tab";
import { EquityReport } from "./equity-tab";
import { StatutoryPackReport } from "./statutory-pack-tab";
import { TrialBalanceReport } from "./trial-balance-tab";
import { AnalyticsSliceReport } from "./analytics-slice-tab";
import { PeriodsTab, PERIODS_DESCRIPTION } from "./periods-tab";
import { SealsReport, SEALS_DESCRIPTION } from "./seals-tab";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { ShowArchivedToggle } from "@/components/finance-ui/archived-years";
import { FINANCE_HELP } from "../screen-help";

const LABELS: Record<string, string> = {
  "trial-balance": "Trial Balance", "income-statement": "Income Statement (P&L)",
  "balance-sheet": "Balance Sheet", "cash-flow": "Cash Flow",
  "changes-in-equity": "Changes in Equity", analytics: "Cost & Dimension Analysis",
  "statutory-pack": "Statutory Pack",
  periods: "Periods & Close",
  seals: "Closed figures",
};

/**
 * One subtitle per section, because each section is its own report: a sentence
 * covering the whole reporting area describes none of them. The fallback exists
 * only for a section added here without one.
 */
const DESCRIPTIONS: Record<string, string> = {
  "trial-balance": "Every account's closing debit and credit for the period, proving the ledger balances.",
  "income-statement": "Income less expense over the period, down to net profit or loss.",
  "balance-sheet": "Assets, liabilities and equity as they stand on a single date.",
  "cash-flow": "Where cash came from and where it went, split into operating, investing and financing.",
  "changes-in-equity": "How each equity component moved from opening to closing balance.",
  "statutory-pack": "The IFRS for SMEs statements prepared together for the school's annual filing.",
  analytics: "Net posted activity per account, sliced by one cost centre or dimension axis.",
  periods: PERIODS_DESCRIPTION,
  seals: SEALS_DESCRIPTION,
};
const AREA_DESCRIPTION = "Financial statements (exportable) and the period-close checklist.";

/** `section` comes from the route table; see console-sections.ts. */
export default function ReportsPage({ section = DEFAULT_REPORTS_SECTION }: {
  section?: ReportsSection;
}) {
  const { code: entity, currency } = useActiveEntity();
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={`finance-reports.${section}.workspace`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">{LABELS[section] ?? "Reports & Month-End"}</h1>
              <InfoHint ariaLabel={`About ${LABELS[section] ?? "financial reports"}`}>{FINANCE_HELP[section]}</InfoHint>
            </div>
            <p className="mt-0.5 max-w-2xl font-mont text-xs text-gray-05">{DESCRIPTIONS[section] ?? AREA_DESCRIPTION}</p>
          </div>
          {/* Section actions land on the title line; display:contents keeps the slot itself out of the layout. */}
          {section === "periods" ? <div ref={setHeaderSlot} className="contents" /> : null}
          {/* The statements pick their period from a list that leaves archived years out until asked. */}
          {section !== "periods" && section !== "seals" ? <ShowArchivedToggle entity={entity} /> : null}
        </div>
        {!entity ? (
          <NoEntityState />
        ) : section === "income-statement" ? (
          <IncomeStatementReport entity={entity} currency={currency} />
        ) : section === "balance-sheet" ? (
          <BalanceSheetReport entity={entity} currency={currency} />
        ) : section === "cash-flow" ? (
          <CashFlowReport entity={entity} currency={currency} />
        ) : section === "changes-in-equity" ? (
          <EquityReport entity={entity} currency={currency} />
        ) : section === "statutory-pack" ? (
          <StatutoryPackReport entity={entity} currency={currency} />
        ) : section === "analytics" ? (
          <AnalyticsSliceReport entity={entity} currency={currency} />
        ) : section === "periods" ? (
          <PeriodsTab entity={entity} headerSlot={headerSlot} />
        ) : section === "seals" ? (
          <SealsReport entity={entity} currency={currency} />
        ) : (
          <TrialBalanceReport entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
