// Payments (§6.Payments) - single payouts, payout batches, settlement
// reconciliation (gateway vs bank), the gateway transactions log, held
// settlements and the platform's held-money checks.
// Beneficiary details follow Field Access on payments.payout in each tab.
import { DEFAULT_PAYMENTS_SECTION, type PaymentsSection } from "./console-sections";
import { paymentsHeadings } from "./payments-headings";
import { FinanceShell } from "./finance-shell";
import { PayoutsTab } from "./payouts-tab";
import { BatchesTab } from "./batches-tab";
import { SettlementTab } from "./settlement-tab";
import { TransactionsTab } from "./transactions-tab";
import { ProviderActivityTab } from "./provider-activity-tab";
import { WebhooksTab } from "./webhooks-tab";
import { HeldSettlementsTab, PlatformHeldSettlementsTab } from "./held-settlements-tab";
import { HeldReconciliationsTab } from "./held-reconciliations";
import { HeldCustodyScreen } from "./online-payments";
import { useActiveEntity } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { P } from "../../permissions";
import { platformName } from "../../host";

/**
 * `section` comes from the route table; see console-sections.ts.
 *
 * The platform's screens read every school at once and take no ledger entity:
 * Held Reconciliations always, and Held Settlements for a reader holding the
 * platform settlement key. A school's Held Settlements is its own list and
 * needs its books like every other tab. Payouts and Batches pay out of money
 * the platform holds, so at a school whose custody is DIRECT they show a notice
 * instead (see HeldCustodyScreen).
 */
export default function PaymentsPage({ section = DEFAULT_PAYMENTS_SECTION }: {
  section?: PaymentsSection;
}) {
  const { code: entity, currency } = useActiveEntity();
  const { can } = useCan();
  const headings = paymentsHeadings(platformName);
  const { label, subtitle } = headings[section] ?? headings.payouts;
  const platformHeld = section === "held-settlements" && can(P.PAY_VIEW_PLATFORM_SETTLEMENTS);
  const needsEntity = section !== "held-reconciliations" && !platformHeld;

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={`finance-payments-${section}.workspace`}>
        <div data-guide={`finance-payments-${section}.heading`}>
          <h1 className="font-mont text-lg font-semibold text-gray-01">{label}</h1>
          <p className="mt-0.5 font-mont text-xs text-gray-05">{subtitle}</p>
        </div>
        {section === "held-reconciliations" ? (
          <HeldReconciliationsTab />
        ) : platformHeld ? (
          <PlatformHeldSettlementsTab currency={currency} />
        ) : needsEntity && !entity ? (
          <NoEntityState />
        ) : section === "held-settlements" ? (
          <HeldSettlementsTab entity={entity!} currency={currency} />
        ) : section === "batches" ? (
          <HeldCustodyScreen entity={entity!}><BatchesTab entity={entity!} currency={currency} /></HeldCustodyScreen>
        ) : section === "settlement" ? (
          <SettlementTab entity={entity!} currency={currency} />
        ) : section === "transactions" ? (
          <TransactionsTab entity={entity!} currency={currency} />
        ) : section === "provider-activity" ? (
          <ProviderActivityTab entity={entity!} />
        ) : section === "webhooks" ? (
          <WebhooksTab entity={entity!} currency={currency} />
        ) : (
          <HeldCustodyScreen entity={entity!}><PayoutsTab entity={entity!} currency={currency} /></HeldCustodyScreen>
        )}
      </PageShell>
    </FinanceShell>
  );
}
