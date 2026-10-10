// Expenses & petty cash (§6.6) - one page per sub-section (route-driven).
// A reader without a section's view key, arriving by a typed or bookmarked
// address, is told so instead of being shown an empty list that invites them
// to create the first record.

import { DEFAULT_EXPENSES_SECTION, type ExpensesSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity, InfoHint } from "@/components/finance-ui";
import { ExpenseClaimsTab } from "./expense-claims-tab";
import { PettyCashTab } from "./petty-cash-tab";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { FINANCE_HELP } from "../screen-help";
import { EmptyState } from "@/components/finance-ui/states";
import { noAccessMessage } from "@/components/finance-ui/no-access";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../../permissions";

/** `section` comes from the route table; see console-sections.ts. */
export default function ExpensesPage({ section = DEFAULT_EXPENSES_SECTION }: {
  section?: ExpensesSection;
}) {
  const { code: entity, currency } = useActiveEntity();
  const isPettyCash = section === "petty-cash";
  const { can } = useCan();
  const canView = can(isPettyCash ? P.FIN_VIEW_PETTY_CASH : P.FIN_VIEW_EXPENSE_CLAIMS);

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={isPettyCash ? "finance-petty-cash.workspace" : "finance-expense-claims.workspace"}>
        <div data-guide={isPettyCash ? "finance-petty-cash.heading" : "finance-expense-claims.heading"}>
          <div className="flex items-center gap-1.5">
            <h1 className="font-mont text-lg font-semibold text-gray-01">{isPettyCash ? "Petty Cash" : "Expense Claims"}</h1>
            {isPettyCash
              ? <InfoHint ariaLabel="About petty-cash floats">{FINANCE_HELP["petty-cash"]}</InfoHint>
              : <InfoHint ariaLabel="About expense claims">{FINANCE_HELP.claims}</InfoHint>}
          </div>
          <p className="mt-0.5 font-mont text-xs text-gray-05">{isPettyCash ? "Petty-cash floats, vouchers and returns to the bank." : "Out-of-pocket spending by staff that needs reimbursement."}</p>
        </div>
        {!entity ? (
          <NoEntityState />
        ) : !canView ? (
          <EmptyState
            title={isPettyCash ? "No petty cash access" : "No expense claims access"}
            message={noAccessMessage(isPettyCash ? "view petty cash" : "view expense claims")}
          />
        ) : isPettyCash ? (
          <PettyCashTab entity={entity} currency={currency} />
        ) : (
          <ExpenseClaimsTab entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
