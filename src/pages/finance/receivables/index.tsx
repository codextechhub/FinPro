// Receivables (§6.3). One page per sub-section, driven by the :section route
// param (the sidebar navigates between them - no in-page tabs).

import { DEFAULT_RECEIVABLES_SECTION, type ReceivablesSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity, InfoHint } from "@/components/finance-ui";
import { InvoicesTab } from "./invoices-tab";
import { CreditNotesTab } from "./credit-notes-tab";
import { RefundsTab } from "./refunds-tab";
import { ConcessionsTab } from "./concessions-tab";
import { PaymentPlansTab } from "./payment-plans-tab";
import { DunningTab } from "./dunning-tab";
import { CustomersTab } from "./customers-tab";
import { FeeStructuresTab } from "./fee-structures-tab";
import { ReceiptsAllocationTab } from "./receipts-allocation-tab";
import { PayerPaymentsTab } from "./payer-payments-tab";
import { CreditTransfersTab } from "./credit-transfers-tab";
import { DeferredIncomeTab } from "./deferred-income-tab";
import { ProvisionsTab } from "./provisions-tab";
import { DepositsTab } from "./deposits-tab";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { FINANCE_HELP } from "../screen-help";

const LABELS: Record<string, string> = {
  invoices: "Customer Invoices", "credit-notes": "Credit / Debit Notes", refunds: "Refunds & Write-offs",
  concessions: "Concessions / Fee Waivers", "payment-plans": "Payment Plans", dunning: "Dunning / Reminders",
  customers: "Customers", "fee-structures": "Fee Structures", receipts: "Receipts & Allocation",
  "payer-payments": "Payer Payments", "credit-transfers": "Credit Transfers",
  "deferred-income": "Deferred Income", provisions: "Doubtful Debts", deposits: "Deposits",
};
const SUBTITLES: Record<string, string> = {
  receipts: "Record money received and apply it to open invoices.",
  "credit-notes": "Adjust customer balances against issued invoices.",
  refunds: "Return credit balances to the bank, or write off bad debt to expense.",
  "payment-plans": "Spread invoice balances into scheduled installments.",
  concessions: "Waivers, discounts and scholarships that reduce customer balances.",
  dunning: "Overdue follow-up - aging buckets, reminder queue and policies.",
  "fee-structures": "Billing templates that drive invoice generation.",
  "payer-payments": "One payment from a parent or sponsor, shared across the customers they pay for.",
  "credit-transfers": "Move one customer's unused credit to another, with a second person's approval.",
  "deferred-income": "Fees billed before the period they pay for, released to income month by month.",
  provisions: "The allowance for debts that may not be paid, worked out from how old they are.",
  deposits: "Refundable deposits held for customers, returned when they leave or forfeited when unclaimed.",
};
/** `section` comes from the route table; see console-sections.ts. */
export default function ReceivablesPage({ section = DEFAULT_RECEIVABLES_SECTION }: {
  section?: ReceivablesSection;
}) {
  const { code: entity, currency } = useActiveEntity();

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={`finance-receivables.${section}.workspace`}>
        {(section !== "invoices" || !entity) && (
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">{LABELS[section] ?? "Receivables"}</h1>
              <InfoHint ariaLabel={`About ${LABELS[section] ?? "Receivables"}`}>{FINANCE_HELP[section]}</InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">{SUBTITLES[section] ?? "Accounts receivable for the selected entity."}</p>
          </div>
        )}
        {!entity ? (
          <NoEntityState message="Choose a ledger entity to view receivables." />
        ) : section === "credit-notes" ? (
          <CreditNotesTab entity={entity} currency={currency} />
        ) : section === "refunds" ? (
          <RefundsTab entity={entity} currency={currency} />
        ) : section === "concessions" ? (
          <ConcessionsTab entity={entity} currency={currency} />
        ) : section === "payment-plans" ? (
          <PaymentPlansTab entity={entity} currency={currency} />
        ) : section === "dunning" ? (
          <DunningTab entity={entity} currency={currency} />
        ) : section === "customers" ? (
          <CustomersTab entity={entity} currency={currency} />
        ) : section === "fee-structures" ? (
          <FeeStructuresTab entity={entity} currency={currency} />
        ) : section === "receipts" ? (
          <ReceiptsAllocationTab entity={entity} currency={currency} />
        ) : section === "payer-payments" ? (
          <PayerPaymentsTab entity={entity} currency={currency} />
        ) : section === "credit-transfers" ? (
          <CreditTransfersTab entity={entity} currency={currency} />
        ) : section === "deferred-income" ? (
          <DeferredIncomeTab entity={entity} currency={currency} />
        ) : section === "provisions" ? (
          <ProvisionsTab entity={entity} currency={currency} />
        ) : section === "deposits" ? (
          <DepositsTab entity={entity} currency={currency} />
        ) : (
          <InvoicesTab entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
