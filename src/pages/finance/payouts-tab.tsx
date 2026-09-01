// Payouts - money out via the payment gateway, rebuilt to the Vision prototype in the
// house theme: KPIs (settled 7d / pending / failed / count), status + provider filters,
// a payouts table, a detail drawer with a status timeline and the settlement posting,
// a New-payout drawer (vendor OR free-form), and a server-side export.
//
// Backed by the real model: initiate asks the provider to transfer out (PROCESSING); the
// ledger entry books on confirmation (webhook / PSP), never here. A payout settles a
// vendor's payable, so it books a VendorPayment (Dr AP / Cr bank) - the recap mirrors that
// real journal. Beneficiary name/account are FLS-masked to •••• without
// payments.payout.view_sensitive. Settlement is webhook-driven - no fake "re-verify".

import { useMemo, useState, type ReactNode } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Plus, Layers, Banknote } from "lucide-react";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, VendorPicker, AccountPicker, PostingRecap, KpiCard, toArray, type Column, type RecapRow } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { isStripped } from "@/utils/fls";
import { P } from "../../permissions";
import { routesPath } from "@/routes/routes-path";
import { useGetPayoutsQuery, useGetPayoutsSummaryQuery, useInitiatePayoutMutation } from "@/redux/services/payments/payments-api";
import { useGetVendorsQuery } from "@/redux/services/procurement/procurement-api";
import { useGetAccountsQuery } from "@/redux/services/finance/setup-api";
import type { PayoutInstruction } from "@/redux/services/payments/payments-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-");
const MASK = "••••";

// payout status → prototype group (Pending / Settled / Failed)
const STATUS_GROUP: Record<string, "PENDING" | "PAID" | "FAILED"> = {
  PENDING: "PENDING", PROCESSING: "PENDING", PAID: "PAID", FAILED: "FAILED", REVERSED: "FAILED",
};
const GROUP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  PAID: { label: "Settled", cls: "bg-green-01/10 text-green-01" },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
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

const beneficiary = (p: PayoutInstruction) => (isStripped(p, "beneficiary_name") ? MASK : p.beneficiary_name || "-");
const account = (p: PayoutInstruction) => (isStripped(p, "beneficiary_account_number") ? MASK : p.beneficiary_account_number || "");

export function PayoutsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [group, setGroup] = useState("");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);
  // Filters are server-side; reset to page 1 on change (render-phase, not an effect).
  const filterKey = `${group} ${provider}`;
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) { setPagedFor(filterKey); setPage(1); }

  const listParams = useMemo(() => ({ entity, page, ...(group ? { group } : {}), ...(provider ? { provider } : {}) }), [entity, page, group, provider]);
  const { data, isLoading, isFetching, isError, refetch } = useGetPayoutsQuery(listParams);
  const { data: summaryRes } = useGetPayoutsSummaryQuery({ entity, ...(provider ? { provider } : {}) });
  const rows = useMemo(() => toArray<PayoutInstruction>(data?.data), [data]);
  const pg = data?.pagination;
  const s = summaryRes?.data;

  const columns: Column<PayoutInstruction>[] = [
    { header: "Reference", cell: (p) => <span className="font-semibold tabular-nums text-gray-01">{p.reference}</span> },
    { header: "Created", cell: (p) => <span className="tabular-nums text-gray-05">{fmtDateTime(p.created_at)}</span> },
    { header: "Recipient", cell: (p) => <span><span className="font-medium text-gray-01">{beneficiary(p)}</span>{account(p) ? <span className="block font-mont text-[11px] tabular-nums text-gray-05">{p.beneficiary_bank_code ? `${p.beneficiary_bank_code} · ` : ""}{account(p)}</span> : null}</span> },
    { header: "Provider", cell: (p) => <ProviderTag provider={p.provider} /> },
    { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (p) => <StatusPill status={p.status} /> },
  ];

  return (
    <div className="space-y-5" data-guide="finance-payouts.workbench">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-payouts.summary">
        <KpiCard label="Settled (7d)" value={formatMoney(s?.settled7d.kobo ?? 0, currency)} foot="Confirmed disbursements" />
        <KpiCard label="Pending" value={formatMoney(s?.pending.kobo ?? 0, currency)} foot="Awaiting settlement" />
        <KpiCard label="Failed" value={String(s?.failed ?? 0)} tone={(s?.failed ?? 0) > 0 ? "warn" : "default"} foot="Rejected / reversed" />
        <KpiCard label="Payouts" value={String(s?.total ?? 0)} foot="Total" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="finance-payouts.controls">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={group} onChange={setGroup} className="w-36">
            <option value="">All status</option>
            {Object.entries(GROUP).map(([v, g]) => <option key={v} value={v}>{g.label}</option>)}
          </Select>
          <Select value={provider} onChange={setProvider} className="w-40">
            <option value="">All providers</option>
            {Object.entries(PROVIDERS).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`${routesPath.PROTECTED.FINANCE.PAYMENTS}/batches`)} className="gap-1.5"><Layers className="size-4" /> Bulk disbursement</Button>
          {/* Replaces a client-side CSV of `rows` - the current page only. The
              screen's status GROUP expands to its real statuses server-side. */}
          <QuickExportButton
            screen="payments.payouts"
            params={{ group, provider }}
            entity={entity}
            typeface="geist"
            defaultName="Payout instructions"
          />
          <Can permission={P.PAY_CREATE_PAYOUT}>
            <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New payout</Button>
          </Can>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(p) => p.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(p) => setSelectedId(p.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No payouts" emptyMessage="Send a payout to disburse money via the gateway." />

      <PayoutDrawer payoutId={selectedId} payouts={rows} currency={currency} onClose={() => setSelectedId(null)} />
      <NewPayoutDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
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

function PayoutDrawer({ payoutId, payouts, currency, onClose }: { payoutId: number | null; payouts: PayoutInstruction[]; currency?: string | null; onClose: () => void }) {
  const p = useMemo(() => payouts.find((x) => x.id === payoutId) ?? null, [payouts, payoutId]);
  if (payoutId == null || !p) return null;

  const paid = p.status === "PAID";
  const failed = p.status === "FAILED" || p.status === "REVERSED";
  const dispatched = p.status === "PROCESSING" || paid || (failed && !!p.provider_reference);
  const dr: RecapRow[] = [{ code: "", name: "Accounts payable (vendor)", amount: p.amount }];
  const cr: RecapRow[] = [{ code: p.source_account_code || "", name: p.source_account_name || "Cash & bank", amount: p.amount }];

  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title={p.reference} description={`${beneficiary(p)} · ${formatMoney(p.amount, currency)}`} widthClass="sm:max-w-2xl"
      footer={<StatusPill status={p.status} />}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Amount" value={formatMoney(p.amount, currency)} />
          <Metric label="Provider"><ProviderTag provider={p.provider} /></Metric>
          <Metric label="Status"><StatusPill status={p.status} /></Metric>
        </div>

        <div className="rounded-md border border-white-02 bg-white p-4">
          <p className="mb-3 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Status timeline</p>
          <div className="space-y-3">
            <TimelineStep done title="Payout created" sub={fmtDateTime(p.created_at)} />
            <TimelineStep done={dispatched && !failed} current={!dispatched && !failed} title={failed && !p.provider_reference ? "Provider rejected" : "Sent to provider"}
              sub={failed && !p.provider_reference ? (p.failure_reason || "The provider declined the transfer") : `${PROVIDERS[p.provider]?.label ?? p.provider}${p.provider_reference ? ` · ${p.provider_reference}` : ""}`} />
            <TimelineStep done={paid} current={dispatched && !paid && !failed} title={failed ? "Settlement failed" : "Settled"}
              sub={paid ? `Confirmed - journal booked (Dr payable / Cr bank)${p.confirmed_at ? ` · ${fmtDateTime(p.confirmed_at)}` : ""}` : failed ? (p.failure_reason || "The provider reported a failed/reversed transfer") : "Awaiting the provider's settlement"} />
          </div>
        </div>

        {!failed ? (
          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">{paid ? "Settlement posting" : "On settlement (via webhook)"}</p>
            <PostingRecap title={paid ? "Disbursement booked" : "Will post on confirmation"} dr={dr} cr={cr} currency={currency}
              helper={paid ? "Booked automatically when the provider confirmed the transfer." : "The journal posts automatically when the provider confirms settlement - no manual entry."} />
          </div>
        ) : null}

        {p.vendor_payment_id ? <p className="inline-flex items-center gap-1.5 font-mont text-[11px] text-gray-05"><Banknote className="size-3.5" /> Linked vendor payment #{p.vendor_payment_id}</p> : null}
      </div>
    </DetailDrawer>
  );
}

function NewPayoutDrawer({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const [vendor, setVendor] = useState("");
  const [name, setName] = useState("");
  const [acct, setAcct] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [sourceAccount, setSourceAccount] = useState("");
  const [amount, setAmount] = useState(0);
  const [provider, setProvider] = useState("PAYSTACK");
  const [narration, setNarration] = useState("");
  const [initiate, { isLoading }] = useInitiatePayoutMutation();

  // Vendor prefill: when a vendor is picked, fill the beneficiary fields from its
  // saved bank details (editable). RTK dedupes this with the picker's own query.
  const { data: vendorsData } = useGetVendorsQuery({ entity });
  const { data: acctData } = useGetAccountsQuery({ entity });
  const acctName = (code: string) => toArray(acctData?.data).find((a) => a.code === code)?.name;
  // Prefill beneficiary fields once per selected vendor, as soon as its row is
  // available - adjusted during render so a background vendor refetch never
  // clobbers edits the user made after picking.
  const vendorRow = vendor ? toArray(vendorsData?.data).find((x) => x.code === vendor) : undefined;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (vendor && vendorRow && prefilledFor !== vendor) {
    setPrefilledFor(vendor);
    setName(vendorRow.bank_account_name || vendorRow.name);
    setAcct(vendorRow.bank_account_number || "");
  }
  if (!vendor && prefilledFor !== null) setPrefilledFor(null);

  const close = () => {
    setVendor(""); setName(""); setAcct(""); setBankCode("");
    setSourceAccount(""); setAmount(0); setProvider("PAYSTACK"); setNarration(""); onClose();
  };

  const valid = amount > 0 && !!vendor && name.trim() && acct.trim();

  const submit = async () => {
    try {
      await initiate({
        entity, vendor, amount, beneficiary_name: name.trim(), beneficiary_account_number: acct.trim(),
        beneficiary_bank_code: bankCode.trim() || undefined, provider,
        source_account: sourceAccount || undefined, narration: narration.trim() || undefined,
      }).unwrap();
      toast.success("Payout sent to the provider.");
      close();
    } catch { /* central */ }
  };

  const dr: RecapRow[] = [{ code: "", name: "Accounts payable (vendor)", amount: amount || 0 }];
  const cr: RecapRow[] = [{ code: sourceAccount, name: acctName(sourceAccount) || "Cash & bank", amount: amount || 0 }];

  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New payout" description="Pay a vendor - money out to a recipient account." widthClass="sm:max-w-2xl"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !valid} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Sending…" : "Send payout"}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={setVendor} /></FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Recipient name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Beneficiary" className="h-9 bg-white" /></FormField>
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Account number" required><Input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="0123456789" className="h-9 bg-white" /></FormField>
          <FormField label="Bank code"><Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="e.g. 058" className="h-9 bg-white" /></FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><p className="mb-1 font-mont text-xs text-gray-05">Provider</p><Select value={provider} onChange={setProvider} className="w-full">{Object.entries(PROVIDERS).map(([v, pr]) => <option key={v} value={v}>{pr.label}</option>)}</Select></div>
          <FormField label="From bank account"><AccountPicker entity={entity} value={sourceAccount} onChange={setSourceAccount} accountType="ASSET" postableOnly placeholder="Defaults to cash & bank" /></FormField>
        </div>
        <FormField label="Narration"><Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Reason for payout" className="h-9 bg-white" /></FormField>

        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">On settlement (via webhook)</p>
          <PostingRecap title="Will post on confirmation" dr={dr} cr={cr} currency={currency}
            helper="Settles the vendor's payable when the provider confirms - no manual entry." />
        </div>
      </div>
    </DetailDrawer>
  );
}
