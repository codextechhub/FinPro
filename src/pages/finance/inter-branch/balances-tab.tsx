/**
 * Between Branches -> Inter-branch Balances: who owes whom, one line per pair
 * of branches, read from both branches' books.
 *
 * Each pair is reported once ("Lekki owes Ikeja N300,000"). The two branches
 * book every transfer on both sides, so their figures agree; a pair whose books
 * disagree is marked, because the month will not close until it is found.
 * Opening a pair lists the transfers behind it in the register.
 *
 * Money one branch holds for another (collected at Ikeja for a Lekki bill and
 * not yet forwarded) is listed beside the pairs. A whole-school reader also
 * sees the inter-branch account across every branch, which is zero when the
 * books are right; a branch-bound reader sees only the pairs their branches
 * are in.
 */

import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

import { DataTable, Money, type Column } from "@/components/finance-ui";
import { formatMoney } from "@/utils/money";
import { useGetInterBranchBalancesQuery } from "@/redux/services/finance/interbranch-api";
import type { InterBranchHeld, InterBranchPair } from "@/redux/services/finance/interbranch-types";
import { pairLink } from "./links";
import { Note, TonePill } from "./parts";

export function BalancesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetInterBranchBalancesQuery({ entity });
  const balances = data?.data;
  const pairs = Array.isArray(balances?.pairs) ? balances.pairs : [];
  const held = Array.isArray(balances?.held) ? balances.held : [];
  const netTotal = balances?.net_total ?? null;

  const pairColumns: Column<InterBranchPair>[] = [
    { header: "Owes", cell: (p) => <span className="font-semibold text-gray-01">{p.owed_by.name}</span> },
    { header: "To", cell: (p) => p.owed_to.name },
    { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amount} currency={currency} align="right" /> },
    { header: "Both books", cell: (p) => p.balanced
      ? <TonePill tone="good">Agree</TonePill>
      : <TonePill tone="waiting">Disagree</TonePill> },
    { header: "Open", align: "right", cell: (p) => (
      <Link to={pairLink(p.owed_by.id, p.owed_to.id)} className="inline-flex items-center gap-1 font-mont text-xs font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
        Transfers <ArrowRight className="size-3.5" />
      </Link>
    ) },
  ];

  const heldColumns: Column<InterBranchHeld>[] = [
    { header: "Held by", cell: (h) => <span className="font-semibold text-gray-01">{h.held_by.name}</span> },
    { header: "For", cell: (h) => h.held_for.name },
    { header: "Amount", align: "right", cell: (h) => <Money kobo={h.amount} currency={currency} align="right" /> },
  ];

  return (
    <div className="space-y-5">
      {netTotal !== null && !isLoading ? (
        netTotal === 0
          ? <Note>Across every branch the inter-branch account nets to zero, as it should.</Note>
          : <Note tone="warn">{`Across every branch the inter-branch account nets to ${formatMoney(netTotal, currency)}, not zero. A transfer is booked on one side only; the month will not close until it is found.`}</Note>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-mont text-sm font-semibold text-gray-01">Who owes whom</h2>
        <DataTable
          columns={pairColumns} rows={pairs} rowKey={(p) => `${p.owed_by.id}-${p.owed_to.id}`}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          emptyTitle="Nothing is owed between branches"
          emptyMessage="Money sent, recharges and moved balances show here until they are repaid."
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-mont text-sm font-semibold text-gray-01">Money held for another branch</h2>
        <DataTable
          columns={heldColumns} rows={held} rowKey={(h) => `${h.held_by.id}-${h.held_for.id}`}
          loading={isLoading || isFetching} error={isError} onRetry={refetch}
          emptyTitle="Nothing held"
          emptyMessage="Money one branch collects for another shows here until it is forwarded."
        />
      </section>
    </div>
  );
}
