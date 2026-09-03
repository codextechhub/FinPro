/**
 * Collections → Virtual accounts. Dedicated funding NUBANs per customer, minted
 * through a payment gateway (Paystack / Fake-for-dev). Money transferred
 * to a customer's number arrives as a Collection that reconciles to their AR.
 *
 * The funding account number/name are FLS-stripped unless the caller holds
 * payments.virtual_account.view_sensitive → render "••••" rather than crash.
 * No prototype exists for this screen; built in the house theme to match AR.
 */

import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, Search, Landmark, Power, PowerOff } from "lucide-react";
import {
  DataTable, StatusPill, Money, DetailDrawer, FormField,
  CustomerPicker, AccountPicker, toArray, type Column,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { P } from "../../../permissions";
import { isStripped } from "@/utils/fls";
import {
  useGetVirtualAccountsQuery, useCreateVirtualAccountMutation,
  useUpdateVirtualAccountMutation, useGetCollectionsQuery,
} from "@/redux/services/payments/payments-api";
import type { VirtualAccount } from "@/redux/services/payments/payments-types";

const PROVIDERS: { value: string; label: string }[] = [
  { value: "PAYSTACK", label: "Paystack" },
  { value: "FAKE", label: "Fake (testing)" },
];
const providerLabel = (p: string) => PROVIDERS.find((x) => x.value === p)?.label ?? p;
const selectCls = "h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-xl font-semibold tabular-nums text-black-01">{value}</p>
      {hint && <p className="mt-0.5 font-mont text-[11px] text-gray-05">{hint}</p>}
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[10px] font-semibold text-primary">{init || "-"}</span>;
}

function masked(va: VirtualAccount, field: "account_number" | "account_name"): React.ReactNode {
  if (isStripped(va, field)) return <span className="text-gray-05" title="Hidden - needs the view-sensitive grant">••••</span>;
  return va[field] || "-";
}

export function VirtualAccountsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PAY_CREATE_VIRTUAL_ACCOUNT), () => setCreating(true));
  const [selected, setSelected] = useState<VirtualAccount | null>(null);

  const params = useMemo(() => ({
    entity, page, ...(search ? { search } : {}),
    ...(status ? { status } : {}), ...(provider ? { provider } : {}),
  }), [entity, page, search, status, provider]);
  const { data, isLoading, isFetching, isError, refetch } = useGetVirtualAccountsQuery(params);
  const rows = data?.data ?? [];
  const pg = data?.pagination;
  const kpis = data?.kpis;

  const columns: Column<VirtualAccount>[] = [
    { header: "Customer", cell: (v) => (
      <span className="inline-flex items-center gap-2">
        <Initials name={v.customer_name || v.customer_code || "-"} />
        <span className="font-medium text-gray-01">{v.customer_name || v.customer_code || "-"}</span>
      </span>
    ) },
    { header: "Bank", cell: (v) => v.bank_name || "-" },
    { header: "Account number", cell: (v) => <span className="tabular-nums">{masked(v, "account_number")}</span> },
    { header: "Provider", cell: (v) => providerLabel(v.provider) },
    { header: "Status", cell: (v) => <StatusPill status={v.status} /> },
  ];

  return (
    <div className="space-y-4" data-guide="finance-virtual-accounts.workbench">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Active accounts" value={String(kpis?.active ?? 0)} hint="Open for transfers" />
        <Kpi label="Inactive" value={String(kpis?.inactive ?? 0)} />
        <Kpi label="Providers in use" value={String(kpis?.providers ?? 0)} />
        <Kpi label="Total provisioned" value={String(kpis?.total ?? 0)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
            <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} placeholder="Search customer, number or bank" className="h-9 w-72 bg-white pl-8 font-mont" />
          </div>
          <select value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All providers</option>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <Can permission={P.PAY_CREATE_VIRTUAL_ACCOUNT}>
          <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New virtual account</Button>
        </Can>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(v) => v.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        emptyTitle="No virtual accounts"
        emptyMessage="Provision a dedicated account for a customer to collect funds."
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
      />

      <VirtualAccountDetailDrawer
        va={selected} entity={entity} currency={currency}
        onClose={() => setSelected(null)} onUpdated={setSelected}
      />
      <ProvisionDrawer open={creating} onClose={() => setCreating(false)} entity={entity} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{children}</p>
    </div>
  );
}

function VirtualAccountDetailDrawer({ va, entity, currency, onClose, onUpdated }: {
  va: VirtualAccount | null; entity: string; currency?: string | null;
  onClose: () => void; onUpdated: (v: VirtualAccount) => void;
}) {
  const { can } = useCan();
  const [update, { isLoading }] = useUpdateVirtualAccountMutation();
  const { data: collData, isFetching: collLoading } = useGetCollectionsQuery(
    { entity, virtual_account: va?.id ?? 0 }, { skip: !va });
  const collections = useMemo(() => toArray(collData?.data), [collData]);
  if (!va) return null;

  const isActive = va.status === "ACTIVE";
  const toggle = async () => {
    try {
      const res = await update({ id: va.id, entity, status: isActive ? "INACTIVE" : "ACTIVE" }).unwrap();
      toast.success(res.message || "Virtual account updated.");
      if (res.data) onUpdated(res.data);
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={!!va} onOpenChange={(o) => (o ? undefined : onClose())}
      title={va.customer_name || va.customer_code || "Virtual account"}
      description={`${providerLabel(va.provider)} · ${va.bank_name || "-"}`}
      widthClass="sm:max-w-2xl"
      footer={
        <>
          <StatusPill status={va.status} />
          <div className="flex-1" />
          {can(P.PAY_MANAGE_VIRTUAL_ACCOUNT) ? (
            <Button variant="outline" disabled={isLoading} onClick={toggle} className="gap-1.5">
              {isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
              {isLoading ? "Saving…" : isActive ? "Deactivate" : "Reactivate"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer">{va.customer_name || va.customer_code || "-"}</Field>
          <Field label="Provider">{providerLabel(va.provider)}</Field>
          <Field label="Bank">{va.bank_name || "-"}</Field>
          <Field label="Currency">{va.currency_code || "-"}</Field>
          <Field label="Account number">{masked(va, "account_number")}</Field>
          <Field label="Account name">{masked(va, "account_name")}</Field>
          <Field label="Provider reference">{va.provider_reference || "-"}</Field>
          <Field label="Deposit (GL) account">{va.deposit_account_code ? `${va.deposit_account_code} · ${va.deposit_account_name}` : "-"}</Field>
          <Field label="Created">{new Date(va.created_at).toLocaleDateString()}</Field>
        </div>

        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Funds received through this account</p>
          {collLoading ? (
            <p className="font-mont text-sm text-gray-05">Loading…</p>
          ) : collections.length === 0 ? (
            <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">No transfers have arrived through this account yet.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">Reference</th>
                  <th className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">Date</th>
                  <th className="bg-[#F1F1F1] px-3 py-2 text-right font-mont text-[11px] font-semibold text-gray-01">Amount</th>
                  <th className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">Status</th>
                </tr></thead>
                <tbody>
                  {collections.map((c) => (
                    <tr key={c.id}>
                      <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-black-01">{c.reference}</td>
                      <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-gray-05">{new Date(c.created_at).toLocaleDateString()}</td>
                      <td className="border-t border-white-02 px-3 py-2 text-right"><Money kobo={c.amount} currency={currency} align="right" /></td>
                      <td className="border-t border-white-02 px-3 py-2"><StatusPill status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DetailDrawer>
  );
}

function ProvisionDrawer({ open, onClose, entity }: { open: boolean; onClose: () => void; entity: string }) {
  const [customer, setCustomer] = useState("");
  const [provider, setProvider] = useState("PAYSTACK");
  const [depositAccount, setDepositAccount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [create, { isLoading }] = useCreateVirtualAccountMutation();

  const reset = () => { setCustomer(""); setProvider("PAYSTACK"); setDepositAccount(""); setBankCode(""); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    try {
      const res = await create({
        entity, customer, provider,
        deposit_account: depositAccount || undefined, bank_code: bankCode.trim() || undefined,
      }).unwrap();
      toast.success(res.message || "Virtual account created.");
      close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New virtual account" description="Provision a dedicated funding account for a customer."
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !customer} onClick={submit} className="gap-1.5"><Landmark className="size-4" />{isLoading ? "Provisioning…" : "Provision account"}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          The gateway mints a unique account number for this customer. Transfers to it arrive as collections that reconcile to the customer's invoices. In dev, the Fake provider issues test numbers.
        </p>
        <FormField label="Customer" required>
          <CustomerPicker entity={entity} value={customer} onChange={setCustomer} placeholder="Select customer" />
        </FormField>
        <FormField label="Provider" required>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01">
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </FormField>
        <FormField label="Deposit (GL) account - optional">
          <AccountPicker entity={entity} value={depositAccount} onChange={setDepositAccount} accountType="ASSET" postableOnly placeholder="Bank / cash account where funds land" />
        </FormField>
        <FormField label="Bank code - optional">
          <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="Provider-specific preferred bank" className="bg-white font-mont" />
        </FormField>
      </div>
    </DetailDrawer>
  );
}
