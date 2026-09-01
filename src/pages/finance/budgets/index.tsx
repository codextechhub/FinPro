// Budgets, fixed assets & tax (§6.8) - one page per sub-section (route-driven).

import { DEFAULT_BUDGETS_SECTION, type BudgetsSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { BudgetsTab } from "./budgets-tab";
import { AssetsTab } from "./assets-tab";
import { TaxTab } from "./tax-tab";
import { PageShell } from "@/components/layout/page-shell";

const META: Record<string, { title: string; sub: string }> = {
  budgets: { title: "Budgets & Forecasts", sub: "Compare planned vs actual spending - find your overruns before close does." },
  assets: { title: "Fixed Assets", sub: "The fixed-asset register: acquisition, depreciation and net book value." },
  tax: { title: "Tax Remittance", sub: "Tax obligations and filings - amounts due, paid and outstanding." },
};

/** `section` comes from the route table; see console-sections.ts. */
export default function BudgetsAssetsTaxPage({ section = DEFAULT_BUDGETS_SECTION }: {
  section?: BudgetsSection;
}) {
  const { code: entity, currency } = useActiveEntity();
  const meta = META[section] ?? { title: "Budgets, Assets & Tax", sub: "" };

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={`finance-${section}.workspace`}>
        <div data-guide={`finance-${section}.heading`}>
          <h1 className="font-mont text-lg font-semibold text-gray-01">{meta.title}</h1>
          {meta.sub ? <p className="mt-0.5 font-mont text-xs text-gray-05">{meta.sub}</p> : null}
        </div>
        {!entity ? (
          <EmptyState title="Select an entity" />
        ) : section === "assets" ? (
          <AssetsTab entity={entity} currency={currency} />
        ) : section === "tax" ? (
          <TaxTab entity={entity} currency={currency} />
        ) : (
          <BudgetsTab entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
