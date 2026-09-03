/**
 * Transactions Log - a unified money-movement feed (Vision "Transactions Log"), house theme.
 * Money IN (collections) + money OUT (payouts) in one paginated read-only ledger, served by
 * the backend /payments/movements/ union (no client-side merge or caps). KPIs from the
 * movements summary; direction / status / provider filters are server-side; a row drawer
 * shows the movement's detail. Payout beneficiary name/account are FLS-masked server-side.
 */

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Receipt, Banknote } from "lucide-react";
import { DataTable, Money, KpiCard, DetailDrawer, toArray, type Column } from "@/components/finance-ui";
import { QuickExportButton } from "../../host";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { LoadingState, ErrorState } from "@/components/finance-ui/states";
import { useGetMovementsQuery, useGetMovementsSummaryQuery } from "@/redux/services/payments/payments-api";
import type { Movement } from "@/redux/services/payments/payments-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-");

const PROVIDERS: Record<string, { label: string; dot: string }> = {
  PAYSTACK: { label: "Paystack", dot: "bg-blue-500" },
  FAKE: { label: "Fake (test)", dot: "bg-gray-400" },
};
function ProviderTag({ provider }: { provider: string }) {
  const p = PROVIDERS[provider] ?? { label: provider || "-", dot: "bg-gray-400" };
  return <span className="inline-flex items-center gap-1.5 font-mont text-sm text-black-01"><span className={cn("size-2 rounded-sm", p.dot)} /> {p.label}</span>;
}

// Raw gateway status → a display pill (collections settle as "Paid", payouts as "Settled").
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  SUCCEEDED: { label: "Paid", cls: "bg-green-01/10 text-green-01" },
  PAID: { label: "Settled", cls: "bg-green-01/10 text-green-01" },
  PENDING: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  PROCESSING: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
  ABANDONED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
  REVERSED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
  REFUNDED: { label: "Refunded", cls: "bg-blue-50 text-blue-700" },
};
function StatusPill({ status }: { status: string }) {
  const s = STATUS_PILL[status] ?? { label: status, cls: "bg-gray-02 text-gray-01" };
  return <span className={cn(PILL, s.cls)}>{s.label}</span>;
}
function DirectionTag({ dir }: { dir: "in" | "out" }) {
  return (
    <span className={cn("inline-flex items-center gap-1", PILL, dir === "in" ? "bg-green-01/10 text-green-01" : "bg-amber-50 text-amber-700")}>
      {dir === "in" ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}{dir === "in" ? "In" : "Out"}
    </span>
  );
}
// Unified status groups (match the backend MOVEMENT_GROUPS).
const STATUS_GROUPS = [["SETTLED", "Settled"], ["PENDING", "Pending"], ["FAILED", "Failed"], ["REFUNDED", "Refunded"]] as const;

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

export function TransactionsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [direction, setDirection] = useState("");
  const [group, setGroup] = useState("");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Movement | null>(null);

  // Filters are server-side; reset to page 1 when any changes (adjust during
  // render, not an effect, so the reset lands in the same pass).
  const filterKey = `${direction} ${group} ${provider}`;
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }

  const listParams = useMemo(() => ({ entity, page, ...(direction ? { direction } : {}), ...(group ? { group } : {}), ...(provider ? { provider } : {}) }), [entity, page, direction, group, provider]);
  const { data, isLoading, isFetching, isError, refetch } = useGetMovementsQuery(listParams);
  const { data: summaryRes } = useGetMovementsSummaryQuery({ entity, ...(provider ? { provider } : {}) });
  const rows = useMemo(() => toArray<Movement>(data?.data), [data]);
  const pg = data?.pagination;
  const s = summaryRes?.data;

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const columns: Column<Movement>[] = [
    { header: "Reference", cell: (m) => <span className="font-semibold tabular-nums text-gray-01">{m.reference}</span> },
    { header: "Date", cell: (m) => <span className="tabular-nums text-gray-05">{fmtDateTime(m.created_at)}</span> },
    { header: "Direction", cell: (m) => <DirectionTag dir={m.direction} /> },
    { header: "Party", cell: (m) => m.party || "-" },
    { header: "Provider", cell: (m) => <ProviderTag provider={m.provider} /> },
    { header: "Amount", align: "right", cell: (m) => <span className={cn(m.direction === "out" && "text-destructive")}><Money kobo={m.amount} currency={currency} align="right" /></span> },
    { header: "Status", cell: (m) => <StatusPill status={m.status} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Money in (7d)" value={formatMoney(s?.in7d.kobo ?? 0, currency)} foot="Settled collections" />
        <KpiCard label="Money out (7d)" value={formatMoney(s?.out7d.kobo ?? 0, currency)} foot="Paid payouts" />
        <KpiCard label="Pending" value={String(s?.pending ?? 0)} tone={(s?.pending ?? 0) > 0 ? "warn" : "default"} foot="Awaiting settlement" />
        <KpiCard label="Failed" value={String(s?.failed ?? 0)} tone={(s?.failed ?? 0) > 0 ? "warn" : "default"} foot="Rejected / failed" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={direction} onChange={setDirection} className="w-36"><option value="">All directions</option><option value="in">In</option><option value="out">Out</option></Select>
          <Select value={group} onChange={setGroup} className="w-36"><option value="">All status</option>{STATUS_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Select value={provider} onChange={setProvider} className="w-40"><option value="">All providers</option>{Object.entries(PROVIDERS).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}</Select>
        </div>
        {/* This screen is a MERGE of two datasets, and one file cannot hold
            both: a collection has a payer and a provider reference, a payout has
            a beneficiary and a batch. So the export follows the direction filter
            and exports the side being viewed. With "All directions" chosen there
            is no single honest answer, so the button says what to do rather than
            guessing or quietly exporting half the feed.

            Replaces a client-side CSV of `rows` - the current page only. */}
        <QuickExportButton
          screen={direction === "out" ? "payments.payouts" : "payments.collections"}
          params={{ group, provider }}
          entity={entity}
          typeface="geist"
          defaultName={direction === "out" ? "Payout instructions" : "Gateway collections"}
          disabledReason={
            direction
              ? undefined
              : "Choose In or Out first - money in and money out export as different files."
          }
        />
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(m) => `${m.kind}-${m.gateway_id}`} onRowClick={(m) => setPicked(m)}
        loading={isFetching} page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No transactions" emptyMessage="Collections and payouts will appear here as one feed." />

      <p className="font-mont text-[11px] text-gray-05">A unified view of collections &amp; payouts; each lives in full on its own screen.</p>

      <MovementDrawer move={picked} currency={currency} onClose={() => setPicked(null)} />
    </div>
  );
}

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="font-mont text-[11px] text-gray-05">{label}</span>
      <span className={cn("text-right font-mont text-xs font-medium text-black-01", mono && "tabular-nums")}>{children}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-4">
      <p className="mb-1.5 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">{title}</p>
      <div className="divide-y divide-gray-02">{children}</div>
    </div>
  );
}

function MovementDrawer({ move, currency, onClose }: { move: Movement | null; currency?: string | null; onClose: () => void }) {
  if (!move) return null;
  const inbound = move.direction === "in";

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={move.reference} description={`${inbound ? "Collection in" : "Payout out"} · ${PROVIDERS[move.provider]?.label ?? move.provider} · ${formatMoney(move.amount, currency)}`}
      widthClass="sm:max-w-md"
      footer={<><DirectionTag dir={move.direction} /><div className="flex-1" /><StatusPill status={move.status} /></>}>
      <div className="space-y-4">
        <Section title="Movement">
          <Field label="Reference" mono>{move.reference}</Field>
          <Field label="Direction">{inbound ? "Money in" : "Money out"}</Field>
          <Field label="Provider"><ProviderTag provider={move.provider} /></Field>
          {move.provider_reference ? <Field label="Provider ref" mono>{move.provider_reference}</Field> : null}
          <Field label="Amount" mono><span className={!inbound ? "text-destructive" : ""}>{formatMoney(move.amount, currency)}</span></Field>
          <Field label="Status"><StatusPill status={move.status} /></Field>
          <Field label="Created" mono>{fmtDateTime(move.created_at)}</Field>
        </Section>

        <Section title={inbound ? "Counterparty" : "Beneficiary"}>
          <Field label={inbound ? "Customer" : "Name"}>{move.party || "-"}</Field>
          {inbound && move.email ? <Field label="Payer email">{move.email}</Field> : null}
          {!inbound && move.beneficiary_account ? <Field label="Account" mono>{move.beneficiary_account}</Field> : null}
          {move.narration ? <Field label="Narration">{move.narration}</Field> : null}
        </Section>

        <Section title="Settlement">
          <Field label="Confirmed" mono>{fmtDateTime(move.confirmed_at)}</Field>
          <Field label={inbound ? "Deposit account" : "Source account"} mono>{move.account_code ? `${move.account_code}${move.account_name ? ` · ${move.account_name}` : ""}` : (inbound ? "Bank / collections" : "Cash & bank")}</Field>
          <Field label={inbound ? "Booked receipt" : "Booked payment"}>
            {move.linked_id ? <span className="inline-flex items-center gap-1">{inbound ? <Receipt className="size-3.5" /> : <Banknote className="size-3.5" />} #{move.linked_id}</span> : "-"}
          </Field>
        </Section>
      </div>
    </DetailDrawer>
  );
}

