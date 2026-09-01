// Payments (§6.Payments) - single payouts, payout batches, settlement
// reconciliation (gateway vs bank), and the gateway transactions log.
// Beneficiary details are FLS-masked unless payments.payout.view_sensitive.
import { DEFAULT_PAYMENTS_SECTION, type PaymentsSection } from "./console-sections";
import { FinanceShell } from "./finance-shell";
import { PayoutsTab } from "./payouts-tab";
import { BatchesTab } from "./batches-tab";
import { SettlementTab } from "./settlement-tab";
import { TransactionsTab } from "./transactions-tab";
import { WebhooksTab } from "./webhooks-tab";
import { useActiveEntity } from "@/components/finance-ui";
import { EmptyState } from "@/components/finance-ui/states";
import { PageShell } from "@/components/layout/page-shell";

/** `section` comes from the route table; see console-sections.ts. */
export default function PaymentsPage({ section = DEFAULT_PAYMENTS_SECTION }: {
  section?: PaymentsSection;
}) {
  const { code: entity, currency } = useActiveEntity();
  const { label, subtitle } = section === "batches"
    ? { label: "Payout Batches", subtitle: "Assemble a batch of payouts and submit them in one run." }
    : section === "settlement"
    ? { label: "Settlement", subtitle: "Reconcile gateway settlements against the bank." }
    : section === "transactions"
    ? { label: "Transactions Log", subtitle: "Unified ledger of all collections, payouts and settlements." }
    : section === "webhooks"
    ? { label: "Needs Attention", subtitle: "Provider events that did not make it into the books." }
    : { label: "Payouts", subtitle: "Money out - single disbursements to recipients." };

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={`finance-payments-${section}.workspace`}>
        <div data-guide={`finance-payments-${section}.heading`}>
          <h1 className="font-mont text-lg font-semibold text-gray-01">{label}</h1>
          <p className="mt-0.5 font-mont text-xs text-gray-05">{subtitle}</p>
        </div>
        {!entity ? (
          <EmptyState title="Select an entity" />
        ) : section === "batches" ? (
          <BatchesTab entity={entity} currency={currency} />
        ) : section === "settlement" ? (
          <SettlementTab entity={entity} currency={currency} />
        ) : section === "transactions" ? (
          <TransactionsTab entity={entity} currency={currency} />
        ) : section === "webhooks" ? (
          <WebhooksTab entity={entity} currency={currency} />
        ) : (
          <PayoutsTab entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
