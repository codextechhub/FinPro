/**
 * Between Branches: the screens a school with several branches uses when its
 * branches deal with each other. One page per section, driven by the route
 * table (see console-sections.ts `INTER_BRANCH_SECTIONS`).
 *
 * At a school with one branch there is no other branch to deal with: the menu
 * does not offer these screens, and an address typed by hand says so rather
 * than drawing empty lists. A reader without the section's view key is told
 * that, in place of a list the server would refuse.
 */

import { DEFAULT_INTER_BRANCH_SECTION, type InterBranchSection } from "../console-sections";
import { FinanceShell } from "../finance-shell";
import { InfoHint, useActiveEntity } from "@/components/finance-ui";
import { EmptyState, LoadingState } from "@/components/finance-ui/states";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { BalancesTab } from "./balances-tab";
import { CostRulesTab } from "./cost-rules-tab";
import { HeldReceiptsTab } from "./held-receipts-tab";
import { RechargesTab } from "./recharges-tab";
import { TransfersTab } from "./transfers-tab";
import { useInterBranchReader } from "./use-inter-branch";
import { noAccessMessage } from "@/components/finance-ui/no-access";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../../permissions";
import { FINANCE_HELP } from "../screen-help";

const HEADINGS: Record<InterBranchSection, { title: string; lead: string; hint: string }> = {
  transfers: {
    title: "Inter-branch Transfers",
    lead: "Money sent and asked for between branches, and everything else that passed between two of them.",
    hint: FINANCE_HELP["inter-branch-transfers"],
  },
  balances: {
    title: "Inter-branch Balances",
    lead: "What each pair of branches owes the other.",
    hint: FINANCE_HELP["inter-branch-balances"],
  },
  "held-receipts": {
    title: "Held Receipts",
    lead: "Money one branch collected for another branch's bills.",
    hint: FINANCE_HELP["held-receipts"],
  },
  recharges: {
    title: "Recharges",
    lead: "A cost one branch paid, shared with the branches it served.",
    hint: FINANCE_HELP.recharges,
  },
  "cost-rules": {
    title: "Shared Cost Rules",
    lead: "Whether a branch absorbs a cost it pays for others, or recharges it, and how.",
    hint: FINANCE_HELP["shared-cost-rules"],
  },
};

/** `section` comes from the route table; see console-sections.ts. */
export default function InterBranchPage({ section = DEFAULT_INTER_BRANCH_SECTION }: { section?: InterBranchSection }) {
  const { code: entity, currency } = useActiveEntity();
  const reader = useInterBranchReader();
  const { can } = useCan();
  const heading = HEADINGS[section];
  // The same key the menu gates each section on.
  const canView = section === "held-receipts" ? can(P.FIN_VIEW_PAYMENTS) : reader.keys.view;

  return (
    <FinanceShell>
      <PageShell className="space-y-5 text-black-01">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-mont text-lg font-semibold text-gray-01">{heading.title}</h1>
            <InfoHint ariaLabel={`About ${heading.title.toLowerCase()}`}>{heading.hint}</InfoHint>
          </div>
          <p className="mt-0.5 font-mont text-xs text-gray-05">{heading.lead}</p>
        </div>
        {!entity ? (
          <NoEntityState />
        ) : reader.isLoading && !reader.applies ? (
          <LoadingState rows={6} />
        ) : !reader.applies ? (
          <EmptyState title="One branch" message="This school runs one branch, so there is no other branch to send money to, share costs with or owe." />
        ) : !canView ? (
          <EmptyState title={`No ${heading.title.toLowerCase()} access`} message={noAccessMessage(`view ${heading.title.toLowerCase()}`)} />
        ) : section === "balances" ? (
          <BalancesTab entity={entity} currency={currency} />
        ) : section === "held-receipts" ? (
          <HeldReceiptsTab entity={entity} currency={currency} reader={reader} />
        ) : section === "recharges" ? (
          <RechargesTab entity={entity} currency={currency} reader={reader} />
        ) : section === "cost-rules" ? (
          <CostRulesTab entity={entity} reader={reader} />
        ) : (
          <TransfersTab entity={entity} currency={currency} reader={reader} />
        )}
      </PageShell>
    </FinanceShell>
  );
}
