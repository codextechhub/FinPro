// Collections (§6.4) - gateway cash-in and virtual accounts, one page per
// sub-section (route-driven).

import { DEFAULT_COLLECTIONS_SECTION, type CollectionsSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { useActiveEntity } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../../permissions";
import { EmptyState } from "@/components/finance-ui/states";
import { CollectionsTab } from "./collections-tab";
import { VirtualAccountsTab } from "./virtual-accounts-tab";
import { PageShell } from "@/components/layout/page-shell";

/** `section` comes from the route table; see console-sections.ts. */
export default function CollectionsPage({ section = DEFAULT_COLLECTIONS_SECTION }: {
  section?: CollectionsSection;
}) {
  const { code: entity, currency } = useActiveEntity();
  const isVA = section === "virtual-accounts";
  // Both tabs read the payments engine, which is a separate module from
  // finance: a finance grant does not carry payments.collection.view with it.
  // The tabs fetch on mount, so an unentitled caller met two 403s and a red
  // toast where a sentence belongs.
  const { can } = useCan();
  const canCollections = can(P.PAY_VIEW_COLLECTIONS);

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01" data-guide={isVA ? "finance-virtual-accounts.workspace" : "finance-collections.workspace"}>
        <div data-guide={isVA ? "finance-virtual-accounts.heading" : "finance-collections.heading"}>
          <h1 className="font-mont text-lg font-semibold text-gray-01">{isVA ? "Virtual Accounts" : "Collections"}</h1>
          <p className="mt-0.5 font-mont text-xs text-gray-05">{isVA ? "Dedicated funding accounts that auto-reconcile inbound transfers." : "Money in - gateway checkouts and their settlement."}</p>
        </div>
        {!entity ? (
          <EmptyState title="Select an entity" message="Choose a ledger entity to view collections." />
        ) : !canCollections ? (
          <EmptyState title="No collections access" message="Money in is read through the payments module, which needs payments.collection.view." />
        ) : isVA ? (
          <VirtualAccountsTab entity={entity} currency={currency} />
        ) : (
          <CollectionsTab entity={entity} currency={currency} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
