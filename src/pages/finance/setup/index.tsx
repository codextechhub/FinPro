// Setup & entity (§6.1) - entities, chart of accounts, periods; one page per
// sub-section (route-driven).

import { useState } from "react";
import { DEFAULT_SETUP_SECTION, type SetupSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity, InfoHint } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { EntitiesTab } from "./entities-tab";
import { AccountsTab } from "./accounts-tab";
import { PeriodsTab, PERIODS_DESCRIPTION } from "../reports/periods-tab";
import { CurrenciesTab } from "./currencies-tab";
import { TaxCodesTab } from "./tax-codes-tab";
import { CostCentersTab } from "./cost-centers-tab";
import { DimensionsTab } from "./dimensions-tab";
import { PageShell } from "@/components/layout/page-shell";

const LABELS: Record<string, string> = {
  entities: "Entities", accounts: "Chart of Accounts", periods: "Periods",
  currencies: "Currencies & FX", "tax-codes": "Tax Codes", "cost-centers": "Cost Centres",
  dimensions: "Dimensions",
};

const HINTS: Record<string, string> = {
  entities: "A ledger entity is a self-contained set of books - its own chart of accounts, periods and document numbering. Switch entities with the top-bar picker; creating one provisions the chart of accounts and twelve open periods.",
  accounts: "The spine of the GL: every journal line maps to one account here. Five top-level types govern the equation Assets = Liabilities + Equity, and Net income = Income − Expense. CTRL marks control accounts that reconcile back to sub-ledgers (AR/AP).",
  periods: "Periods control when journals can post: open accepts postings, soft-closed blocks new journals (admins can edit), closed locks non-admins, locked is permanent. Click a period to run its month-end close.",
  currencies: "FX rates convert foreign-currency amounts to your base currency for the GL; unrealised gains/losses on foreign balances are recognised by the FX revaluation step at period close.",
  "tax-codes": "Tax codes attach rates and accounting rules to lines - a VAT code posts to VAT Payable; a WHT code reduces cash and credits WHT Payable. \"Recoverable\" marks input tax that offsets output tax.",
  "cost-centers": "Cost centres tag journal lines with the department or branch that owns the spend, so reports can slice income and expense by unit.",
  dimensions: "Dimensions are extra analytical axes (e.g. fund, project) you can tag on journal lines, each with a constrained value list. The Cost & Dimension Analysis report slices net activity per account by any axis.",
};

/**
 * One subtitle per section, because each section is its own screen: a sentence
 * covering the whole setup area describes none of them. The fallback exists only
 * for a section added here without one.
 */
const DESCRIPTIONS: Record<string, string> = {
  entities: "Each entity is a separate set of books, with its own accounts, periods and document numbering.",
  accounts: "The account spine every journal line posts to, across the five account types.",
  periods: PERIODS_DESCRIPTION,
  currencies: "Rates that convert foreign-currency amounts to base currency, and the revaluation they drive at close.",
  "tax-codes": "VAT and withholding codes, the rates they apply and the accounts they post to.",
  "cost-centers": "The departments and branches that own the spend, so reports can slice income and expense by unit.",
  dimensions: "Extra analytical axes such as fund or project, each with its own list of allowed values.",
};
const AREA_DESCRIPTION = "Ledger entities, chart of accounts, periods and reference data.";

/** `section` comes from the route table; see console-sections.ts. */
export default function SetupPage({ section = DEFAULT_SETUP_SECTION }: {
  section?: SetupSection;
}) {
  const { code: entity } = useActiveEntity();
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const needsEntity = (node: React.ReactNode) => (entity ? node : <EmptyState title="Select an entity" />);

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide="finance-setup.workspace">
        <div data-guide="finance-setup.heading" className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">{LABELS[section] ?? "Setup & Entity"}</h1>
              {HINTS[section] && <InfoHint ariaLabel={`About ${LABELS[section] ?? "finance setup"}`}>{HINTS[section]}</InfoHint>}
            </div>
            <p className="mt-0.5 max-w-2xl font-mont text-xs text-gray-05">{DESCRIPTIONS[section] ?? AREA_DESCRIPTION}</p>
          </div>
          {/* Section actions land on the title line; display:contents keeps the slot itself out of the layout. */}
          {section === "periods" ? <div ref={setHeaderSlot} className="contents" /> : null}
        </div>
        {section === "accounts" ? needsEntity(<AccountsTab entity={entity!} />)
          : section === "periods" ? needsEntity(<PeriodsTab entity={entity!} headerSlot={headerSlot} />)
          : section === "currencies" ? <CurrenciesTab />
          : section === "tax-codes" ? needsEntity(<TaxCodesTab entity={entity!} />)
          : section === "cost-centers" ? needsEntity(<CostCentersTab entity={entity!} />)
          : section === "dimensions" ? needsEntity(<DimensionsTab entity={entity!} />)
          : <EntitiesTab />}
      </PageShell>
    </FinanceShell>
  );
}
