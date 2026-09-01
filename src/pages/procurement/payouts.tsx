// Payments at scale (§7.6) - single payouts, payout batches (submit), and
// settlement reconciliation (gateway vs bank). Beneficiary details are
// FLS-masked unless payments.payout.view_sensitive.
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { ProcurementShell } from "./procurement-shell";
import { DataTable, Money, StatusPill, ActionButton, toArray, useActiveEntity, type Column } from "@/components/finance-ui";
import { EmptyState, LoadingState } from "@/components/finance-ui/states";
import { P } from "../../permissions";
import { isStripped } from "@/utils/fls";
import {
  useGetPayoutsQuery, useGetPayoutBatchesQuery, useSubmitPayoutBatchMutation, useGetSettlementReconciliationQuery,
  useGetTransactionsLogQuery,
} from "@/redux/services/payments/payments-api";
import type { PayoutBatchSummary, PayoutInstruction, TransactionLogEntry } from "@/redux/services/payments/payments-types";
import { PageShell } from "@/components/layout/page-shell";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";

function PayoutsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetPayoutsQuery({ entity, page });
  const rows = data?.data ?? [];
  const pg = data?.pagination;
  const columns: Column<PayoutInstruction>[] = [
    { header: "Reference", cell: (p) => <span className="font-semibold">{p.reference}</span> },
    { header: "Beneficiary", cell: (p) => isStripped(p, "beneficiary_name") ? <span className="text-gray-05">••••</span> : p.beneficiary_name || "-" },
    { header: "Account", cell: (p) => isStripped(p, "beneficiary_account_number") ? <span className="text-gray-05">••••</span> : p.beneficiary_account_number || "-" },
    { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (p) => <StatusPill status={p.status} /> },
  ];
  return (
    <DataTable columns={columns} rows={rows} rowKey={(p) => p.id}
      loading={isLoading || isFetching} error={isError} onRetry={refetch}
      emptyTitle="No payouts" emptyMessage="Single payouts will appear here."
      page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage} />
  );
}

function BatchesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetPayoutBatchesQuery({ entity, page });
  const [submit] = useSubmitPayoutBatchMutation();
  const rows = data?.data ?? [];
  const pg = data?.pagination;
  const columns: Column<PayoutBatchSummary>[] = [
    { header: "Reference", cell: (b) => <span className="font-semibold">{b.reference}</span> },
    { header: "Title", cell: (b) => b.title },
    { header: "Items", align: "right", cell: (b) => b.item_count },
    { header: "Total", align: "right", cell: (b) => <Money kobo={b.total_amount} currency={currency} align="right" /> },
    { header: "Status", cell: (b) => <StatusPill status={b.status} /> },
    {
      header: "", cell: (b) => (
        <div onClick={(e) => e.stopPropagation()}>
          {(b.status === "DRAFT" || b.status === "PENDING") && (
            <ActionButton asLink label="Submit" permission={P.PAY_CREATE_PAYOUT} title="Submit payout batch?"
              description={`Submits ${b.reference}'s pending instructions to the gateway. Only settled items book.`}
              onConfirm={async () => { const r = await submit({ id: b.id, entity }).unwrap(); toast.success(r.message || "Submitted."); }} />
          )}
        </div>
      ),
    },
  ];
  return (
    <DataTable columns={columns} rows={rows} rowKey={(b) => b.id}
      loading={isLoading || isFetching} error={isError} onRetry={refetch}
      emptyTitle="No payout batches" emptyMessage="Payout batches will appear here."
      page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage} />
  );
}

function SettlementTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { data, isLoading } = useGetSettlementReconciliationQuery({ entity });
  if (isLoading) return <LoadingState />;
  const d = (data?.data ?? {}) as { unmatched_bank_total?: number; unmatched_bank_count?: number };
  return (
    <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 font-mont text-sm")}>
      <p className="mb-3 font-semibold text-gray-01">Settlement reconciliation (gateway vs bank)</p>
      <div className="flex flex-wrap gap-8">
        <div><p className="text-xs text-gray-05">Unmatched bank lines</p><p className="mt-1 text-lg font-semibold">{d.unmatched_bank_count ?? 0}</p></div>
        <div><p className="text-xs text-gray-05">Unmatched bank total</p><p className="mt-1 text-lg font-semibold"><Money kobo={d.unmatched_bank_total ?? 0} currency={currency} /></p></div>
      </div>
    </div>
  );
}

// The append-only gateway action log (PaymentEvent): every collection, payout,
// virtual-account and webhook action, including failed/rejected attempts.
function TransactionsTab({ entity }: { entity: string }) {
  const { data, isLoading, isFetching, isError, refetch } = useGetTransactionsLogQuery({ entity });
  const rows = toArray<TransactionLogEntry>(data?.data);
  const columns: Column<TransactionLogEntry>[] = [
    { header: "When", cell: (t) => <span className="text-gray-05">{new Date(t.created_at).toLocaleString()}</span> },
    { header: "Action", cell: (t) => <span className="font-semibold">{t.action_display || t.action}</span> },
    { header: "Provider", cell: (t) => t.provider || "-" },
    { header: "Reference", cell: (t) => <span className="font-mono text-xs">{t.reference || "-"}</span> },
    { header: "Result", cell: (t) => <StatusPill status={t.succeeded ? "SUCCESS" : "FAILED"} /> },
    { header: "Message", cell: (t) => <span className="text-gray-05">{t.message || "-"}</span> },
    { header: "Actor", cell: (t) => t.actor_email || "System" },
  ];
  return (
    <DataTable columns={columns} rows={rows} rowKey={(t) => t.id}
      loading={isLoading || isFetching} error={isError} onRetry={refetch}
      emptyTitle="No transactions" emptyMessage="Gateway actions (collections, payouts, webhooks) will appear here." />
  );
}

export default function PayoutsPage() {
  const { code: entity, currency } = useActiveEntity();
  const { section = "payouts" } = useParams();
  const label = section === "batches" ? "Payout Batches"
    : section === "settlement" ? "Settlement"
    : section === "transactions" ? "Transactions Log"
    : "Payouts";

  return (
    <ProcurementShell>
      <PageShell className="space-y-5 text-black-01">
        <div>
          <h1 className="font-mont text-lg font-semibold text-gray-01">{label}</h1>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Single and bulk payouts, batches and settlement reconciliation.</p>
        </div>
        {!entity ? (
          <EmptyState title="Select an entity" />
        ) : section === "batches" ? (
          <BatchesTab entity={entity} currency={currency} />
        ) : section === "settlement" ? (
          <SettlementTab entity={entity} currency={currency} />
        ) : section === "transactions" ? (
          <TransactionsTab entity={entity} />
        ) : (
          <PayoutsTab entity={entity} currency={currency} />
        )}
      </PageShell>
    </ProcurementShell>
  );
}
