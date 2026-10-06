/**
 * Payment provider activity: every request this platform made to the payment
 * provider, including the ones it refused and the ones that failed.
 *
 * It reads the gateway's append-only action log (GET /payments/transactions/,
 * `payments.report.view`), which the server narrows to the reader's branches.
 * It is the place to answer "what happened when we tried?": Mrs Okafor's
 * checkout link that never opened, a payout Paystack turned down, a webhook
 * whose signature did not check out. Money that actually moved is on
 * Transactions Log instead.
 *
 * A failed or refused row is the one a reader came for, so its message is shown
 * in full and in the failure colour, and every reference can be copied to quote
 * to the provider. Only the serializer's named fields are shown: the stored
 * metadata never is.
 */

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { DataTable, toArray, type Column } from "@/components/finance-ui";
import { exitedOutline, exitedTitle } from "@/components/finance-ui/exited-person";
import { cn } from "@/lib/utils";
import { isForbidden } from "../../lib/api-errors";
import { useGetTransactionsLogQuery } from "@/redux/services/payments/payments-api";
import type { TransactionLogEntry } from "@/redux/services/payments/payments-types";
import { useDates } from "../../lib/display-prefs";
import { PROVIDER_CHOICES, providerInfo } from "./payment-providers";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";

/** The actions the log records, as the server names them, for the filter. */
export const PROVIDER_ACTIONS: readonly (readonly [string, string])[] = [
  ["COLLECTION_INITIATED", "Collection initiated"],
  ["COLLECTION_CONFIRMED", "Collection confirmed"],
  ["COLLECTION_FAILED", "Collection failed"],
  ["VIRTUAL_ACCOUNT_CREATED", "Virtual account created"],
  ["VIRTUAL_ACCOUNT_STATUS_CHANGED", "Virtual account status changed"],
  ["VIRTUAL_ACCOUNT_REISSUED", "Virtual account reissued"],
  ["PAYOUT_INITIATED", "Payout initiated"],
  ["PAYOUT_CONFIRMED", "Payout confirmed"],
  ["PAYOUT_FAILED", "Payout failed"],
  ["PAYOUT_BATCH_CREATED", "Payout batch created"],
  ["PAYOUT_BATCH_SUBMITTED", "Payout batch submitted"],
  ["HELD_FUNDS_REFUSED", "Payout refused: held funds"],
  ["WEBHOOK_RECEIVED", "Webhook received"],
  ["WEBHOOK_REJECTED", "Webhook rejected"],
  ["COLLECTIONS_SETTLED", "Collections settled to a bank"],
  ["SUBACCOUNT_SAVED", "Collection subaccount saved"],
  ["HELD_SETTLEMENT_BUILT", "Held settlement built"],
  ["HELD_SETTLEMENT_PAID", "Held settlement paid"],
  ["HELD_SETTLEMENT_FAILED", "Held settlement failed"],
  ["PROVIDER_DISPUTE_RECEIVED", "Chargeback or refund received"],
  ["PROVIDER_DISPUTE_RESOLVED", "Chargeback resolved"],
];

/** The result filter: the list's `succeeded` value for each choice. */
export const RESULT_FILTERS: readonly (readonly [string, string])[] = [
  ["true", "Succeeded"],
  ["false", "Failed or refused"],
];

/** The list's query for the chosen filters; a blank choice sends nothing. */
export function providerActivityArgs(f: { action: string; result: string; provider: string }): Record<string, string> {
  return {
    ...(f.action ? { action: f.action } : {}),
    ...(f.result ? { succeeded: f.result } : {}),
    ...(f.provider ? { provider: f.provider } : {}),
  };
}

/** Who acted, as the row says it: the server's label, or System for the platform itself. */
export function providerActor(row: Pick<TransactionLogEntry, "acted_label" | "actor_email">): string {
  return row.acted_label?.trim() || row.actor_email || "System";
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
      className="h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none">
      {children}
    </select>
  );
}

function CopyReference({ reference }: { reference: string }) {
  if (!reference) return <span className="text-gray-05">-</span>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(reference); toast.success("Reference copied."); }
    catch { toast.error("Couldn't copy the reference."); }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="break-all font-mono text-[11px] text-gray-01">{reference}</span>
      <button type="button" onClick={copy} aria-label={`Copy reference ${reference}`} title="Copy reference"
        className="shrink-0 text-gray-05 hover:text-primary"><Copy className="size-3.5" /></button>
    </span>
  );
}

export function ProviderActivityTab({ entity }: { entity: string }) {
  const dates = useDates();
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);

  // Server-side filters; back to page 1 whenever one changes, in the same pass.
  const filterKey = `${action} ${result} ${provider}`;
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }

  const params = useMemo(() => ({ entity, page, ...providerActivityArgs({ action, result, provider }) }), [entity, page, action, result, provider]);
  const { data, isLoading, isFetching, isError, error, refetch } = useGetTransactionsLogQuery(params);
  const rows = useMemo(() => toArray<TransactionLogEntry>(data?.data), [data]);
  const pg = data?.pagination;
  const filtered = !!(action || result || provider);

  const columns: Column<TransactionLogEntry>[] = [
    { header: "When", cell: (t) => <span className="whitespace-nowrap tabular-nums text-gray-05">{dates.dateTime(t.created_at)}</span> },
    { header: "What", cell: (t) => <span className="font-semibold text-gray-01">{t.action_display || t.action}</span> },
    ...(PROVIDER_CHOICES.length > 1 ? [{ header: "Provider", cell: (t: TransactionLogEntry) => providerInfo(t.provider).label }] : []),
    { header: "Reference", cell: (t) => <CopyReference reference={t.reference} /> },
    {
      header: "Result", cell: (t) => t.succeeded
        ? <span className={cn(PILL, "bg-green-01/10 text-green-01")}>Succeeded</span>
        : <span className={cn(PILL, "bg-destructive/10 text-destructive")}>Failed</span>,
    },
    {
      header: "Message", cell: (t) => t.message
        ? <span className={cn("block min-w-56 whitespace-pre-wrap break-words", t.succeeded ? "text-gray-05" : "font-medium text-destructive")}>{t.message}</span>
        : <span className="text-gray-05">-</span>,
    },
    {
      header: "Who", cell: (t) => {
        const exited = t.actor_user_is_exited === true || t.proxied_by_is_exited === true;
        return <span className={cn("rounded-sm px-1", exitedOutline(exited))} title={exitedTitle(exited)}>{providerActor(t)}</span>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={action} onChange={setAction} label="What">
          <option value="">Everything</option>
          {PROVIDER_ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={result} onChange={setResult} label="Result">
          <option value="">Any result</option>
          {RESULT_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {PROVIDER_CHOICES.length > 1 ? (
          <Select value={provider} onChange={setProvider} label="Provider">
            <option value="">All providers</option>
            {PROVIDER_CHOICES.map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
          </Select>
        ) : null}
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(t) => t.id}
        loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle={filtered ? "Nothing matches" : "No provider activity yet"}
        emptyMessage={filtered ? "No request to the provider matches these filters." : "Requests made to the payment provider will appear here."} />
    </div>
  );
}
