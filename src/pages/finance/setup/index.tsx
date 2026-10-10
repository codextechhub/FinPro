// Setup & entity (§6.1) - entities, chart of accounts, periods; one page per
// sub-section (route-driven).

import { useState } from "react";
import { DEFAULT_SETUP_SECTION, type SetupSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity, InfoHint } from "@/components/finance-ui";
import { EntitiesTab } from "./entities-tab";
import { AccountsTab } from "./accounts-tab";
import { PeriodsTab, PERIODS_DESCRIPTION } from "../reports/periods-tab";
import { CurrenciesTab } from "./currencies-tab";
import { TaxCodesTab } from "./tax-codes-tab";
import { CostCentersTab } from "./cost-centers-tab";
import { DimensionsTab } from "./dimensions-tab";
import { TaxTablesTab } from "./tax-tables-tab";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { FINANCE_HELP } from "../screen-help";

const LABELS: Record<string, string> = {
  entities: "Entities", accounts: "Chart of Accounts", periods: "Periods",
  currencies: "Currencies & FX", "tax-codes": "Tax Codes", "cost-centers": "Cost Centres",
  dimensions: "Dimensions", "tax-tables": "Tax Tables",
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
  "tax-tables": "PAYE bands and reliefs for each tax year, PAYE states and pension fund administrators.",
};
const AREA_DESCRIPTION = "Ledger entities, chart of accounts, periods and reference data.";

/** `section` comes from the route table; see console-sections.ts. */
export default function SetupPage({ section = DEFAULT_SETUP_SECTION }: {
  section?: SetupSection;
}) {
  const { code: entity } = useActiveEntity();
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const needsEntity = (node: React.ReactNode) => (entity ? node : <NoEntityState />);

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide="finance-setup.workspace">
        <div data-guide="finance-setup.heading" className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">{LABELS[section] ?? "Setup & Entity"}</h1>
              <InfoHint ariaLabel={`About ${LABELS[section] ?? "finance setup"}`}>{FINANCE_HELP[section]}</InfoHint>
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
          : section === "tax-tables" ? <TaxTablesTab />
          : <EntitiesTab />}
      </PageShell>
    </FinanceShell>
  );
}
