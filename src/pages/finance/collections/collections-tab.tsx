/**
 * Collections - money in via the payment gateway, rebuilt to the Vision prototype in
 * the house theme: KPIs (collected / pending / failed / success rate), status + provider
 * filters, a checkouts table, a detail drawer with a status timeline and the settlement
 * posting (Dr bank/collections, Cr AR), a New-checkout drawer, and a server-side export.
 *
 * Backed by the real model: initiate returns a hosted checkout_url; verify polls the PSP
 * and books a vs_finance receipt when settled. Honest: providers are Paystack (+
 * Fake for testing); no email is sent (Copy link copies the real URL); the receipt
 * journal posts automatically on confirmation - the recap mirrors it, never a 2nd post.
 *
 * Not every row here is a checkout. A transfer into a customer's dedicated virtual
 * account arrives unsolicited and the gateway records it as a collection on the
 * VIRTUAL_ACCOUNT channel, with no link and no payer hand-off - so those rows are
 * tagged, and the drawer tells that story instead of the checkout one.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, RefreshCw, Link2, Receipt } from "lucide-react";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, CustomerPicker, PostingRecap, KpiCard, toArray, type Column, type RecapRow } from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/custom/search-select";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useGetCollectionsQuery, useGetCollectionsSummaryQuery, useInitiateCollectionMutation, useVerifyCollectionMutation } from "@/redux/services/payments/payments-api";
import { useGetInvoicesQuery } from "@/redux/services/finance/ar-api";
import type { Collection } from "@/redux/services/payments/payments-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-");

// filing-style status → prototype group (Pending / Paid / Failed / Refunded)
const STATUS_GROUP: Record<string, "PENDING" | "PAID" | "FAILED" | "REFUNDED"> = {
  PENDING: "PENDING", PROCESSING: "PENDING", SUCCEEDED: "PAID", FAILED: "FAILED", ABANDONED: "FAILED", REFUNDED: "REFUNDED",
};
const GROUP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  PAID: { label: "Paid", cls: "bg-green-01/10 text-green-01" },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
  REFUNDED: { label: "Refunded", cls: "bg-blue-50 text-blue-700" },
};
function StatusPill({ status }: { status: string }) {
  const g = GROUP[STATUS_GROUP[status] ?? "PENDING"];
  return <span className={cn(PILL, g.cls)}>{g.label}</span>;
}

const PROVIDERS: Record<string, { label: string; dot: string }> = {
  PAYSTACK: { label: "Paystack", dot: "bg-blue-500" },
  FAKE: { label: "Fake (test)", dot: "bg-gray-400" },
};
function ProviderTag({ provider }: { provider: string }) {
  const p = PROVIDERS[provider] ?? { label: provider, dot: "bg-gray-400" };
  return <span className="inline-flex items-center gap-1.5 font-mont text-xs text-black-01"><span className={cn("size-2 rounded-sm", p.dot)} /> {p.label}</span>;
}

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

const customerLabel = (c: Collection) => c.customer_name || c.payer_name || c.customer_code || "-";
// A transfer the payer sent straight into their dedicated NUBAN: no checkout, no link.
const isDeposit = (c: Collection) => c.channel === "VIRTUAL_ACCOUNT";

export function CollectionsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PAY_CREATE_COLLECTION), () => setCreating(true));
  const [group, setGroup] = useState("");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);
  const listParams = useMemo(() => ({ entity, page, ...(group ? { group } : {}), ...(provider ? { provider } : {}) }), [entity, page, group, provider]);
  const { data, isLoading, isFetching, isError, refetch } = useGetCollectionsQuery(listParams);
  const { data: summaryRes } = useGetCollectionsSummaryQuery({ entity, ...(provider ? { provider } : {}) });
  const rows = useMemo(() => toArray<Collection>(data?.data), [data]);
  const pg = data?.pagination;
  const s = summaryRes?.data;

  const columns: Column<Collection>[] = [
    { header: "Reference", cell: (c) => (
      <span>
        <span className="block font-semibold tabular-nums text-gray-01">{c.reference}</span>
        {isDeposit(c) ? <span className={cn(PILL, "mt-0.5 bg-gray-03 text-gray-05")}>Virtual account transfer</span> : null}
      </span>
    ) },
    { header: "Created", cell: (c) => <span className="tabular-nums text-gray-05">{fmtDateTime(c.created_at)}</span> },
    { header: "Customer", cell: (c) => <span><span className="font-medium text-gray-01">{customerLabel(c)}</span>{c.narration ? <span className="block font-mont text-[11px] text-gray-05">{c.narration}</span> : null}</span> },
    { header: "Provider", cell: (c) => <ProviderTag provider={c.provider} /> },
    { header: "Amount", align: "right", cell: (c) => <Money kobo={c.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (c) => <StatusPill status={c.status} /> },
  ];

  return (
    <div className="space-y-5" data-guide="finance-collections.workbench">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-collections.summary">
        <KpiCard label="Collected (settled)" value={formatMoney(s?.collected.kobo ?? 0, currency)} foot="Confirmed receipts" />
        <KpiCard label="Pending" value={formatMoney(s?.pending.kobo ?? 0, currency)} foot="Awaiting payment" />
        <KpiCard label="Failed" value={formatMoney(s?.failed.kobo ?? 0, currency)} tone={(s?.failed.kobo ?? 0) > 0 ? "warn" : "default"} />
        <KpiCard label="Success rate" value={s?.success_rate == null ? "-" : `${s.success_rate}%`} foot="Settled ÷ completed" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="finance-collections.controls">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={group} onChange={(value) => { setGroup(value); setPage(1); }} className="w-36">
            <option value="">All status</option>
            {Object.entries(GROUP).map(([v, g]) => <option key={v} value={v}>{g.label}</option>)}
          </Select>
          <Select value={provider} onChange={(value) => { setProvider(value); setPage(1); }} className="w-40">
            <option value="">All providers</option>
            {Object.entries(PROVIDERS).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Replaces a client-side CSV of `rows` - the current page only. */}
          <QuickExportButton
            screen="payments.collections"
            params={{ group, provider }}
            entity={entity}
            typeface="geist"
            defaultName="Gateway collections"
          />
          <Can permission={P.PAY_CREATE_COLLECTION}>
            <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New checkout</Button>
          </Can>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(c) => c.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(c) => setSelectedId(c.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No collections" emptyMessage="Create a checkout to collect money via the gateway." />

      <CollectionDrawer collectionId={selectedId} collections={rows} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      <NewCheckoutDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
    </div>
  );
}

function Metric({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      {value ? <p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value}</p> : <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function TimelineStep({ done, current, title, sub }: { done: boolean; current?: boolean; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", done ? "bg-green-01" : current ? "bg-primary" : "bg-gray-03 text-gray-05")}>{done ? "✓" : ""}</span>
      <div>
        <p className={cn("font-mont text-xs font-semibold", done || current ? "text-black-01" : "text-gray-05")}>{title}</p>
        <p className="font-mont text-[11px] text-gray-05">{sub}</p>
      </div>
    </div>
  );
}

function CollectionDrawer({ collectionId, collections, entity, currency, onClose }: { collectionId: number | null; collections: Collection[]; entity: string; currency?: string | null; onClose: () => void }) {
  const c = useMemo(() => collections.find((x) => x.id === collectionId) ?? null, [collections, collectionId]);
  const [verify, { isLoading: verifying }] = useVerifyCollectionMutation();
  if (collectionId == null || !c) return null;

  const paid = c.status === "SUCCEEDED";
  const failed = c.status === "FAILED" || c.status === "ABANDONED";
  const deposit = isDeposit(c);
  // An invoice-linked checkout settles AR against that invoice; a standalone one parks
  // the cash as the customer's credit (a 2140 liability) instead.
  const linked = c.invoice_id != null;
  const dr: RecapRow[] = [{ code: c.deposit_account_code || "", name: c.deposit_account_name || "Bank / collections", amount: c.amount }];
  const cr: RecapRow[] = linked
    ? [{ code: "", name: "Accounts receivable", amount: c.amount }]
    : [{ code: "2140", name: "Customer credit / advances", amount: c.amount }];

  const doVerify = async () => { try { const r = await verify({ id: c.id, entity }).unwrap(); toast.success(r.message || "Re-checked with provider."); } catch { /* central */ } };
  const copyLink = async () => {
    if (!c.checkout_url) return;
    try { await navigator.clipboard.writeText(c.checkout_url); toast.success("Checkout link copied."); }
    catch { toast.error("Couldn't copy the link."); }
  };

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={c.reference} description={`${customerLabel(c)} · ${formatMoney(c.amount, currency)}${deposit ? " · Virtual account transfer" : ""}`} widthClass="sm:max-w-2xl"
      footer={<>
        <StatusPill status={c.status} />
        <div className="flex-1" />
        {c.checkout_url ? <Button variant="outline" onClick={copyLink} className="gap-1.5"><Link2 className="size-4" /> Copy link</Button> : null}
        {!paid && !failed ? <Button disabled={verifying} onClick={doVerify} className="gap-1.5"><RefreshCw className="size-4" />{verifying ? "Checking…" : "Re-verify"}</Button> : null}
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Amount" value={formatMoney(c.amount, currency)} />
          <Metric label="Provider"><ProviderTag provider={c.provider} /></Metric>
          <Metric label="Status"><StatusPill status={c.status} /></Metric>
        </div>

        <div className="rounded-md border border-white-02 bg-white p-4">
          <p className="mb-3 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Status timeline</p>
          <div className="space-y-3">
            {deposit ? (
              // A deposit has no checkout and no link: the first we hear of it is the
              // provider telling us the customer's dedicated account was credited.
              <TimelineStep done title="Transfer received" sub={`${PROVIDERS[c.provider]?.label ?? c.provider} reported a transfer into this customer's account · ${fmtDateTime(c.created_at)}`} />
            ) : (
              <>
                <TimelineStep done title="Checkout created" sub={fmtDateTime(c.created_at)} />
                <TimelineStep done={paid || failed} current={!paid && !failed} title="Checkout link ready" sub={c.checkout_url ? (c.payer_email ? `Hand off to ${c.payer_email}` : "Link ready to share") : "No hosted link"} />
              </>
            )}
            <TimelineStep done={paid} current={!paid && !failed} title={failed ? "Payment failed" : deposit ? "Deposit confirmed" : "Payment confirmed"}
              sub={paid ? `Verified with the provider - receipt booked (Dr bank / Cr ${linked ? "AR" : "customer credit"})${c.confirmed_at ? ` · ${fmtDateTime(c.confirmed_at)}` : ""}` : failed ? "The provider reported a failed/abandoned payment" : "Awaiting the provider's confirmation"} />
          </div>
        </div>

        {!failed ? (
          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">{paid ? "Settlement posting" : "On settlement (via webhook)"}</p>
            <PostingRecap title={paid ? "Receipt booked" : "Will post on confirmation"} dr={dr} cr={cr} currency={currency}
              helper={paid ? "Booked automatically when the provider confirmed payment." : "The journal posts automatically when the provider confirms payment - no manual receipt."} />
          </div>
        ) : null}

        {c.payment_id ? <p className="inline-flex items-center gap-1.5 font-mont text-[11px] text-gray-05"><Receipt className="size-3.5" /> Linked receipt #{c.payment_id}</p> : null}
      </div>
    </DetailDrawer>
  );
}

function NewCheckoutDrawer({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const [customer, setCustomer] = useState("");
  const [invoice, setInvoice] = useState("");
  const [amount, setAmount] = useState(0);
  const [provider, setProvider] = useState("PAYSTACK");
  const [email, setEmail] = useState("");
  const [narration, setNarration] = useState("");
  const [initiate, { isLoading }] = useInitiateCollectionMutation();
  const invoicesQ = useGetInvoicesQuery(
    { entity, search: customer, status: "POSTED" },
    { skip: !open || !customer },
  );
  const openInvoices = useMemo(
    () => toArray(invoicesQ.data?.data).filter((i) => i.customer_code === customer && i.balance_due > 0),
    [invoicesQ.data, customer],
  );
  const invoiceOptions = openInvoices.map((i) => ({
    value: String(i.id),
    label: `${i.document_number} · ${formatMoney(i.balance_due, currency)} due`,
  }));
  const selectedInvoice = openInvoices.find((i) => String(i.id) === invoice);
  const close = () => { setCustomer(""); setInvoice(""); setAmount(0); setProvider("PAYSTACK"); setEmail(""); setNarration(""); onClose(); };
  const pickInvoice = (id: string) => {
    setInvoice(id);
    const selected = openInvoices.find((i) => String(i.id) === id);
    if (selected) setAmount(selected.balance_due);
  };
  const submit = async () => {
    try {
      const r = await initiate({ entity, amount, customer, invoice: invoice ? Number(invoice) : undefined, provider, payer_email: email.trim() || undefined, narration: narration.trim() || undefined }).unwrap();
      const url = r.data?.checkout_url;
      if (url) { try { await navigator.clipboard.writeText(url); } catch { /* ignore */ } }
      toast.success(url ? "Checkout link created and copied." : r.message || "Checkout created.");
      close();
    } catch { /* central */ }
  };
  // Invoice-linked collections settle AR; an intentionally standalone checkout parks
  // the confirmed cash as customer credit until it is allocated later.
  const dr: RecapRow[] = [{ code: "", name: "Bank / collections", amount: amount || 0 }];
  const cr: RecapRow[] = invoice
    ? [{ code: "", name: "Accounts receivable", amount: amount || 0 }]
    : [{ code: "2140", name: "Customer credit / advances", amount: amount || 0 }];

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New checkout" description="Create a hosted payment link to hand off to the customer." widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || amount <= 0 || !customer} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Creating…" : "Create checkout link"}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label="Customer" required><CustomerPicker entity={entity} value={customer} onChange={(value) => { setCustomer(value); setInvoice(""); setAmount(0); }} /></FormField>
        <FormField label="Invoice (optional)">
          <SearchSelect
            options={invoiceOptions}
            value={invoice}
            onChange={(e) => pickInvoice(e.target.value)}
            placeholder={customer ? (invoicesQ.isFetching ? "Loading invoices…" : "No invoice - customer credit") : "Select a customer first"}
            disabled={!customer || invoicesQ.isFetching}
          />
        </FormField>
        <p className="-mt-2 font-mont text-[11px] text-gray-05">Select an invoice to settle Accounts Receivable; leave blank to hold the payment as customer credit.</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
          <div><p className="mb-1 font-mont text-xs text-gray-05">Provider</p><Select value={provider} onChange={setProvider} className="w-full">{Object.entries(PROVIDERS).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}</Select></div>
        </div>
        <FormField label="Customer email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-9 bg-white" /></FormField>
        <FormField label="Narration"><Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Term 3 tuition - A. Williams" className="h-9 bg-white" /></FormField>
        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">On settlement (via webhook)</p>
          <PostingRecap title="Will post on confirmation" dr={dr} cr={cr} currency={currency} helper={invoice
            ? `Invoice ${selectedInvoice?.document_number ?? "selected"} - the confirmed payment settles Accounts Receivable automatically.`
            : "No invoice selected - the confirmed cash is held as customer credit (2140) until it is allocated later."} />
        </div>
      </div>
    </DetailDrawer>
  );
}
