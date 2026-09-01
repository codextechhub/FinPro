import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import {
  BadgeCheck, Ban, Building2, ChevronRight, CircleDollarSign, FilePenLine,
  FileText, History, Landmark, Mail, MapPin, Phone, Plus, Search, ShieldCheck,
  Store, Trash2, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  AccountPicker, DataTable, DetailDrawer, ErrorState, FormDrawer,
  FormField, LoadingState, StatCard, StatusPill, TaxCodePicker, toArray, type Column,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../../permissions";
import {
  useCreateVendorMutation, useGetPurchaseOrdersQuery, useGetVendorInsightsQuery,
  useGetVendorInvoicesQuery, useGetVendorQuery, useGetVendorSummaryQuery,
  useGetVendorsQuery, useUpdateVendorMutation,
} from "@/redux/services/procurement/procurement-api";
import { useGetContractsQuery } from "@/redux/services/procurement/procurement-ext-api";
import type {
  PurchaseOrder, Vendor, VendorContract, VendorInsights, VendorInvoice,
} from "@/redux/services/procurement/procurement-types";
import { isStripped } from "@/utils/fls";
import { formatMoney } from "@/utils/money";
import { CategoryPicker } from "../pickers";
import { buildVendorUpdatePayload, type VendorFormValues } from "./vendor-update-payload";
import { VendorGovernanceFields } from "./vendor-governance-fields";

const STATUS_TABS = [
  ["All", "all"], ["Active", "active"], ["On Hold", "hold"], ["Inactive", "inactive"],
] as const;
const DETAIL_TABS = [
  ["profile", "Profile", Store], ["contacts", "Contacts", Users],
  ["bank", "Bank & Compliance", Landmark], ["history", "Contracts & History", History],
  ["performance", "Performance", TrendingUp],
] as const;
const PAYMENT_TERMS = ["NET_0", "NET_7", "NET_14", "NET_30", "NET_60", "NET_90"];

function isForbidden(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}
function titleCase(value?: string | null) {
  return value ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
}
function shortDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "V";
}
function vendorState(vendor: Vendor) {
  if (vendor.on_hold) return "ON_HOLD";
  return vendor.is_active ? "ACTIVE" : "INACTIVE";
}
function Field({ label, value, prose }: { label: string; value: React.ReactNode; prose?: boolean }) {
  return <div className="min-w-0"><dt className="font-mont text-[11px] text-gray-05">{label}</dt><dd className={cn("mt-1 break-words font-mont text-sm text-black-01", prose ? "font-normal leading-5" : "font-semibold tabular-nums")}>{value || "-"}</dd></div>;
}
function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{children}</div>;
}

export function VendorsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number][1]>("all");
  const [kyc, setKyc] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => ({
    entity, page,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(status === "active" ? { is_active: true, on_hold: false } : {}),
    ...(status === "hold" ? { on_hold: true } : {}),
    ...(status === "inactive" ? { is_active: false } : {}),
    ...(kyc ? { kyc_status: kyc } : {}),
  }), [entity, page, debouncedSearch, status, kyc]);
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetVendorsQuery(params);
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useGetVendorSummaryQuery({ entity });
  const rows = toArray(data?.data);
  const summary = summaryData?.data;
  const columns: Column<Vendor>[] = [
    { header: "Vendor", cell: (vendor) => <VendorIdentity vendor={vendor} /> },
    { header: "Category", cell: (vendor) => vendor.category_code || "Uncategorised" },
    { header: "Terms", cell: (vendor) => titleCase(vendor.payment_terms) },
    { header: "Active POs", align: "right", cell: (vendor) => <span className="tabular-nums">{vendor.active_po_count ?? 0}</span> },
    { header: "KYC", cell: (vendor) => <StatusPill status={vendor.kyc_status} /> },
    { header: "Status", cell: (vendor) => <StatusPill status={vendorState(vendor)} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  return <>
    <header data-guide="procurement-vendors.heading" className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-mont text-lg font-semibold text-gray-01">Vendors</h1>
        <p className="mt-0.5 font-mont text-xs text-gray-05">Vendors, categories and the item catalog.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Forwards the SAME derived params the list query uses, so the file
            matches the tab that is open - the status tab expands to is_active
            and on_hold, and both cross into the export. */}
        <QuickExportButton
          screen="procurement.vendors"
          params={{
            q: debouncedSearch,
            ...(status === "active" ? { is_active: true, on_hold: false } : {}),
            ...(status === "hold" ? { on_hold: true } : {}),
            ...(status === "inactive" ? { is_active: false } : {}),
            kyc_status: kyc,
          }}
          entity={entity}
          typeface="geist"
          defaultName="Vendor master"
        />
        <Can permission={P.PROC_CREATE_VENDOR}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> Add Vendor</Button></Can>
      </div>
    </header>

    <div data-guide="procurement-vendors.summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaryLoading ? <div className={cn(INFORMATION_CARD_SURFACE, "col-span-full rounded-md")}><LoadingState rows={2} /></div> : summary ? <>
        <StatCard label="Active Vendors" value={String(summary.active)} icon={BadgeCheck} tone="green" sub={`${summary.inactive} inactive`} />
        <StatCard label="Total Spend YTD" value={formatMoney(summary.total_spend_ytd, currency)} icon={CircleDollarSign} tone="indigo" sub="Posted vendor invoices" />
        <StatCard label="Average Terms" value={summary.average_payment_days == null ? "-" : `Net ${summary.average_payment_days}`} icon={FileText} tone="gray" sub={`${summary.kyc_pending} KYC pending`} />
        <StatCard label="On Hold" value={String(summary.on_hold)} icon={Ban} tone="red" sub="New commitments blocked" />
      </> : <div className="col-span-full rounded-md border border-dashed border-white-02 bg-white p-4 text-xs text-gray-05">{isForbidden(summaryError) ? "Vendor financial KPIs require Procurement report access." : "Vendor KPIs could not be loaded."}</div>}
    </div>

    <section data-guide="procurement-vendors.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
        <div className="max-w-full overflow-x-auto"><div className="flex min-w-max gap-5">{STATUS_TABS.map(([label, value]) => <button key={value} onClick={() => { setStatus(value); setPage(1); }} className={cn("border-b-2 py-3 font-mont text-xs font-medium whitespace-nowrap", status === value ? "border-primary text-primary" : "border-transparent text-gray-05")}>{label}</button>)}</div></div>
        <div className="my-2 flex min-w-0 basis-full flex-wrap justify-end gap-2 xl:basis-auto">
          <select value={kyc} onChange={(event) => { setKyc(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 font-mont text-xs text-black-01">
            <option value="">All KYC states</option><option value="PENDING">KYC Pending</option><option value="VERIFIED">KYC Verified</option><option value="REJECTED">KYC Rejected</option>
          </select>
          <label className="relative order-last min-w-0 basis-full sm:order-none sm:min-w-32 sm:flex-1 sm:basis-auto sm:max-w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search vendors" className="h-9 bg-white pl-9" /></label>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(vendor) => vendor.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(vendor) => setSelectedId(vendor.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No vendors found" emptyMessage={debouncedSearch || status !== "all" || kyc ? "Try changing the search or status filters." : "Add the first supplier master record for this entity."} mobileCard={(vendor) => <VendorMobileCard vendor={vendor} />} />
    </section>

    <VendorDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <VendorForm entity={entity} canSensitive={can(P.PROC_VIEW_VENDOR_SENSITIVE)} canManage={can(P.PROC_MANAGE_VENDOR)} onClose={() => setCreating(false)} />}
  </>;
}

function VendorIdentity({ vendor }: { vendor: Vendor }) {
  return <div className="flex min-w-44 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mont text-xs font-semibold text-primary">{initials(vendor.name)}</span><div className="min-w-0"><p className="truncate font-mont text-sm font-semibold text-black-01">{vendor.name}</p><p className="mt-0.5 font-mont text-[11px] text-gray-05">{vendor.code}</p></div></div>;
}
function VendorMobileCard({ vendor }: { vendor: Vendor }) {
  return <div className="space-y-3 border-b border-white-02 px-3.5 py-3 last:border-0"><VendorIdentity vendor={vendor} /><div className="flex flex-wrap gap-1"><StatusPill status={vendorState(vendor)} /><StatusPill status={vendor.kyc_status} /></div><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-[11px] text-gray-05">Category</p><p className="mt-1 font-medium">{vendor.category_code || "Uncategorised"}</p></div><div><p className="text-[11px] text-gray-05">Active POs</p><p className="mt-1 font-medium tabular-nums">{vendor.active_po_count ?? 0}</p></div></div></div>;
}
function VendorDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const { can } = useCan();
  const [tab, setTab] = useState("profile");
  const [editing, setEditing] = useState(false);
  const { data, isLoading, isError, refetch } = useGetVendorQuery({ id: id!, entity }, { skip: id == null });
  const vendor = data?.data;
  const reportAllowed = can(P.PROC_VIEW_PROC_REPORTS);
  const contractAllowed = can(P.PROC_VIEW_CONTRACTS);
  const poAllowed = can(P.PROC_VIEW_PURCHASE_ORDERS);
  const invoiceAllowed = can(P.PROC_VIEW_VENDOR_INVOICES);
  const { data: insightData, isLoading: insightLoading, isError: insightError } = useGetVendorInsightsQuery({ id: id!, entity }, { skip: id == null || !reportAllowed });
  const { data: contractData, isLoading: contractsLoading } = useGetContractsQuery({ entity, vendor: vendor?.code || "" }, { skip: !vendor || !contractAllowed });
  const { data: poData, isLoading: posLoading } = useGetPurchaseOrdersQuery({ entity, vendor: vendor?.code || "", page_size: 5 }, { skip: !vendor || !poAllowed });
  const { data: invoiceData, isLoading: invoicesLoading } = useGetVendorInvoicesQuery({ entity, vendor: vendor?.code || "", page_size: 5 }, { skip: !vendor || !invoiceAllowed });
  const insights = insightData?.data;
  const contracts = toArray(contractData?.data);
  const pos = toArray(poData?.data);
  const invoices = toArray(invoiceData?.data);
  const closeDrawer = () => {
    // Dismissing the parent must also discard any nested, unsaved edit state.
    setEditing(false);
    onClose();
  };

  return <>
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && closeDrawer()} title={vendor?.name || "Vendor"} description={vendor ? `${vendor.code} · ${vendor.category_code || "Uncategorised"}` : "Loading vendor profile"} widthClass="sm:max-w-[720px]" footer={vendor && <Can permission={P.PROC_UPDATE_VENDOR}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit Vendor</Button></Can>}>
      {isLoading ? <LoadingState /> : isError || !vendor ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5"><StatusPill status={vendorState(vendor)} /><StatusPill status={vendor.kyc_status} /><StatusPill status={vendor.risk} /></div>
        <div className="max-w-full overflow-x-auto border-b border-white-02"><div className="flex min-w-max gap-1">{DETAIL_TABS.map(([value, label, Icon]) => <button key={value} onClick={() => setTab(value)} className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2.5 font-mont text-xs font-medium whitespace-nowrap", tab === value ? "border-primary text-primary" : "border-transparent text-gray-05")}><Icon className="size-3.5" />{label}</button>)}</div></div>
        {tab === "profile" && <ProfileTab vendor={vendor} insights={reportAllowed ? insights : undefined} currency={currency} reportRestricted={!reportAllowed} />}
        {tab === "contacts" && <ContactsTab vendor={vendor} />}
        {tab === "bank" && <BankTab vendor={vendor} />}
        {tab === "history" && <HistoryTab contracts={contracts} pos={pos} invoices={invoices} loading={contractsLoading || posLoading || invoicesLoading} contractAllowed={contractAllowed} poAllowed={poAllowed} invoiceAllowed={invoiceAllowed} currency={currency} />}
        {tab === "performance" && <PerformanceTab insights={insights} loading={insightLoading} error={insightError} restricted={!reportAllowed} currency={currency} />}
      </div>}
    </DetailDrawer>
    {editing && vendor && <VendorForm key={vendor.id} entity={entity} initial={vendor} canSensitive={can(P.PROC_VIEW_VENDOR_SENSITIVE)} canManage={can(P.PROC_MANAGE_VENDOR)} onClose={() => setEditing(false)} />}
  </>;
}

function ProfileTab({ vendor, insights, currency, reportRestricted }: { vendor: Vendor; insights?: VendorInsights; currency?: string | null; reportRestricted: boolean }) {
  return <div className="space-y-5"><dl className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Vendor code" value={vendor.code} /><Field label="Category" value={vendor.category_code || "Uncategorised"} /><Field label="Payment terms" value={titleCase(vendor.payment_terms)} /><Field label="Payable account" value={vendor.payable_code} /><Field label="Default expense" value={vendor.default_expense_code} /><Field label="Default WHT" value={vendor.default_wht_tax_code_value} /><Field label="YTD spend" value={reportRestricted ? "Restricted" : formatMoney(insights?.spend_ytd || 0, currency)} /><Field label="Active purchase orders" value={vendor.active_po_count ?? insights?.po_count ?? 0} /></dl><div><p className="mb-2 font-mont text-xs font-semibold text-black-01">Registered address</p><div className="rounded-md border border-white-02 p-3"><Field label="Address" value={isStripped(vendor, "address") ? "Restricted" : vendor.address} prose /></div></div></div>;
}
function ContactsTab({ vendor }: { vendor: Vendor }) {
  const restricted = isStripped(vendor, "email") || isStripped(vendor, "phone");
  if (restricted) return <EmptyPanel>Contact details are restricted to users with sensitive vendor access.</EmptyPanel>;
  return <div className="space-y-3"><div className="flex items-start gap-3 rounded-md border border-white-02 p-4"><Mail className="mt-0.5 size-4 text-primary" /><Field label="Primary email" value={vendor.email} /></div>{(vendor.contacts || []).map((contact) => <div key={contact.id || contact.email} className="flex items-start gap-3 rounded-md border border-white-02 p-4"><Users className="mt-0.5 size-4 text-primary" /><div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2"><Field label={contact.is_primary ? "Primary vendor contact" : "Vendor contact"} value={contact.name || contact.email} /><Field label="Email" value={contact.email} /><Field label="Phone" value={contact.phone} /><Field label="Receives RFQs" value={contact.receives_rfqs && contact.is_active ? "Yes" : "No"} /><Field label="Receives purchase orders" value={contact.receives_purchase_orders && contact.is_active ? "Yes" : "No"} /></div></div>)}<div className="flex items-start gap-3 rounded-md border border-white-02 p-4"><Phone className="mt-0.5 size-4 text-primary" /><Field label="Primary phone" value={vendor.phone} /></div><div className="flex items-start gap-3 rounded-md border border-white-02 p-4"><MapPin className="mt-0.5 size-4 text-primary" /><Field label="Registered office" value={vendor.address} prose /></div></div>;
}
function BankTab({ vendor }: { vendor: Vendor }) {
  const restricted = isStripped(vendor, "bank_account_number") || isStripped(vendor, "tax_id");
  if (restricted) return <EmptyPanel>Bank, tax, and contact data are redacted by backend field-level security.</EmptyPanel>;
  const account = vendor.bank_account_number ? `•••• ${vendor.bank_account_number.slice(-4)}` : "-";
  return <div className="space-y-5"><section><div className="mb-3 flex items-center gap-2"><Landmark className="size-4 text-primary" /><h3 className="font-mont text-sm font-semibold">Payment information</h3></div><dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Bank" value={vendor.bank_name} /><Field label="Account number" value={account} /><Field label="Account name" value={vendor.bank_account_name} /></dl></section><section><div className="mb-3 flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><h3 className="font-mont text-sm font-semibold">Compliance status</h3></div><dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Tax identifier" value={vendor.tax_id} /><Field label="KYC status" value={<StatusPill status={vendor.kyc_status} />} /><Field label="Risk level" value={<StatusPill status={vendor.risk} />} /><Field label="Purchasing status" value={<StatusPill status={vendorState(vendor)} />} /></dl><p className="mt-3 text-xs text-gray-05">Verification documents and KYC results are not stored by the current Procurement service, so none are implied here.</p></section></div>;
}
function HistoryTab({ contracts, pos, invoices, loading, contractAllowed, poAllowed, invoiceAllowed, currency }: { contracts: VendorContract[]; pos: PurchaseOrder[]; invoices: VendorInvoice[]; loading: boolean; contractAllowed: boolean; poAllowed: boolean; invoiceAllowed: boolean; currency?: string | null }) {
  if (loading) return <LoadingState rows={4} />;
  return <div className="space-y-5"><HistorySection title="Contracts" restricted={!contractAllowed} empty="No contracts are registered for this vendor.">{contracts.map((contract) => <HistoryRow key={contract.id} title={contract.title} sub={`${contract.reference} · ends ${shortDate(contract.end_date)}`} value={formatMoney(contract.contract_value, currency)} status={contract.status} />)}</HistorySection><HistorySection title="Purchase orders" restricted={!poAllowed} empty="No purchase orders are recorded for this vendor.">{pos.map((po) => <HistoryRow key={po.id} title={po.document_number} sub={shortDate(po.order_date)} value={formatMoney(po.total, currency)} status={po.display_status || po.status} />)}</HistorySection><HistorySection title="Vendor invoices" restricted={!invoiceAllowed} empty="No vendor invoices are recorded for this vendor.">{invoices.map((invoice) => <HistoryRow key={invoice.id} title={invoice.document_number} sub={shortDate(invoice.invoice_date)} value={formatMoney(invoice.total, currency)} status={invoice.display_status || invoice.status} />)}</HistorySection></div>;
}
function HistorySection({ title, restricted, empty, children }: { title: string; restricted: boolean; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return <section><h3 className="mb-2 font-mont text-sm font-semibold">{title}</h3>{restricted ? <EmptyPanel>You do not have permission to view {title.toLowerCase()}.</EmptyPanel> : hasChildren ? <div className="overflow-hidden rounded-md border border-white-02">{children}</div> : <EmptyPanel>{empty}</EmptyPanel>}</section>;
}
function HistoryRow({ title, sub, value, status }: { title: string; sub: string; value: string; status: string }) {
  return <div className="flex flex-wrap items-center gap-3 border-b border-white-02 px-3 py-2.5 last:border-0"><div className="min-w-0 flex-1"><p className="font-mont text-xs font-semibold">{title}</p><p className="mt-0.5 text-[11px] text-gray-05">{sub}</p></div><p className="font-mont text-xs font-semibold tabular-nums">{value}</p><StatusPill status={status} /></div>;
}
function PerformanceTab({ insights, loading, error, restricted, currency }: { insights?: VendorInsights; loading: boolean; error: boolean; restricted: boolean; currency?: string | null }) {
  if (restricted) return <EmptyPanel>Vendor performance requires Procurement report access.</EmptyPanel>;
  if (loading) return <LoadingState rows={4} />;
  if (error || !insights) return <ErrorState />;
  const rate = insights.on_time_rate == null ? null : Math.round(insights.on_time_rate * 100);
  return <div className="space-y-5"><div className="grid grid-cols-2 gap-3"><Metric label="Purchase orders" value={String(insights.po_count)} /><Metric label="Total ordered" value={formatMoney(insights.total_ordered, currency)} /><Metric label="Posted receipts" value={String(insights.receipt_count)} /><Metric label="On-time delivery" value={rate == null ? "Not rated" : `${rate}%`} /><Metric label="Posted invoices" value={String(insights.invoice_count)} /><Metric label="Total billed" value={formatMoney(insights.spend_ytd, currency)} /><Metric label="Payments" value={String(insights.payment_count)} /><Metric label="Average payment time" value={insights.average_payment_days == null ? "Not available" : `${insights.average_payment_days} days`} /></div><div className="rounded-md border border-white-02 p-4"><div className="flex items-center justify-between text-xs"><span className="text-gray-05">On-time receipts</span><span className="font-semibold tabular-nums">{insights.on_time_receipts} on time · {insights.late_receipts} late</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate || 0}%` }} /></div></div><p className="text-xs text-gray-05">Only authoritative ordering, receipt, invoice, and payment records are used. No quality, responsiveness, or manual grade is inferred.</p></div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-white-02 p-3"><p className="font-mont text-[11px] text-gray-05">{label}</p><p className="mt-1 font-mont text-sm font-semibold tabular-nums">{value}</p></div>;
}

function VendorForm({ entity, initial, canSensitive, canManage, onClose }: { entity: string; initial?: Vendor; canSensitive: boolean; canManage: boolean; onClose: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category_code || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [taxId, setTaxId] = useState(initial?.tax_id || "");
  const [bankName, setBankName] = useState(initial?.bank_name || "");
  const [bankNumber, setBankNumber] = useState(initial?.bank_account_number || "");
  const [bankAccountName, setBankAccountName] = useState(initial?.bank_account_name || "");
  const [payable, setPayable] = useState(initial?.payable_code || "");
  const [expense, setExpense] = useState(initial?.default_expense_code || "");
  const [wht, setWht] = useState(initial?.default_wht_tax_code_value || "");
  const [terms, setTerms] = useState(initial?.payment_terms || "NET_30");
  const [kyc, setKyc] = useState(initial?.kyc_status || "PENDING");
  const [risk, setRisk] = useState(initial?.risk || "LOW");
  const [onHold, setOnHold] = useState(initial?.on_hold || false);
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [contacts, setContacts] = useState(() => (initial?.contacts || []).map((row) => ({ ...row, receives_purchase_orders: row.receives_purchase_orders ?? false })));
  const [create, { isLoading: creating }] = useCreateVendorMutation();
  const [update, { isLoading: updating }] = useUpdateVendorMutation();
  const values: VendorFormValues = { name, category, email, phone, address, taxId, bankName, bankNumber, bankAccountName, payable, expense, wht, terms, kyc, risk, onHold, active };
  const updatePayload = initial ? buildVendorUpdatePayload(initial, values, { canSensitive, canManage }) : null;
  const contactsDirty = JSON.stringify(contacts) !== JSON.stringify(initial?.contacts || []);
  const canSubmit = !!name.trim() && (!initial || Object.keys(updatePayload || {}).length > 0 || contactsDirty);
  const saving = creating || updating;
  const save = async () => {
    const common = { name: name.trim(), category, payable_account: payable, default_expense_account: expense, default_wht_tax_code: wht, payment_terms: terms, ...(canSensitive ? { email, phone, address, tax_id: taxId, bank_name: bankName, bank_account_number: bankNumber, bank_account_name: bankAccountName, ...(contacts.length ? { contacts } : {}) } : {}) };
    try {
      const result = initial
        ? await update({ id: initial.id, entity, ...updatePayload, ...(canSensitive && contactsDirty ? { contacts } : {}) }).unwrap()
        : await create({ entity, ...common }).unwrap();
      toast.success(result.message || (initial ? "Vendor updated." : "Vendor created."));
      onClose();
    } catch { /* central API handler renders field errors */ }
  };
  return <FormDrawer open onOpenChange={(open) => !open && onClose()} title={initial ? `Edit ${initial.name}` : "Add Vendor"} description={initial ? "Update the supplier master without rewriting historical transactions." : "Create a supplier master record. New vendors begin with KYC pending."} widthClass="sm:max-w-[720px]" onSubmit={save} submitText={initial ? "Save Changes" : "Create Vendor"} loading={saving} canSubmit={canSubmit}>
    <section className="space-y-3"><div className="flex items-center gap-2"><Building2 className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Company</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><FormField label="Company name" required><Input value={name} onChange={(event) => setName(event.target.value)} className="bg-white" /></FormField></div><FormField label="Category"><CategoryPicker entity={entity} value={category} onChange={setCategory} /></FormField><FormField label="Payment terms"><select value={terms} onChange={(event) => setTerms(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 font-mont text-sm">{PAYMENT_TERMS.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></FormField></div></section>
    {canSensitive ? <section className="space-y-3"><div className="flex items-center gap-2"><Users className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Contact & tax</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="bg-white" /></FormField><FormField label="Phone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} className="bg-white" /></FormField><FormField label="Tax identifier"><Input value={taxId} onChange={(event) => setTaxId(event.target.value)} className="bg-white uppercase" /></FormField><div className="sm:col-span-2"><FormField label="Registered address"><Textarea value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-20 bg-white" /></FormField></div></div><div className="rounded-md border border-white-02 p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-mont text-xs font-semibold">Vendor contacts</p><p className="mt-1 text-[11px] text-gray-05">Choose who receives RFQs and approved purchase orders.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setContacts((rows) => [...rows, { name: "", email: "", phone: "", is_primary: rows.length === 0, receives_rfqs: true, receives_purchase_orders: false, is_active: true }])}><Plus className="size-3.5" /> Add contact</Button></div><div className="mt-3 space-y-3">{contacts.map((contact, index) => <div key={contact.id || index} className="grid grid-cols-1 gap-2 rounded border border-white-02 bg-gray-50 p-3 sm:grid-cols-2"><Input value={contact.name} onChange={(event) => setContacts((rows) => rows.map((row, position) => position === index ? { ...row, name: event.target.value } : row))} placeholder="Contact name" /><Input type="email" value={contact.email} onChange={(event) => setContacts((rows) => rows.map((row, position) => position === index ? { ...row, email: event.target.value } : row))} placeholder="Contact email" /><Input value={contact.phone} onChange={(event) => setContacts((rows) => rows.map((row, position) => position === index ? { ...row, phone: event.target.value } : row))} placeholder="Phone (optional)" /><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-1.5 text-xs"><input type="radio" name="primary-contact" checked={contact.is_primary} onChange={() => setContacts((rows) => rows.map((row, position) => ({ ...row, is_primary: position === index })))} /> Primary</label><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={contact.receives_rfqs} onChange={(event) => setContacts((rows) => rows.map((row, position) => position === index ? { ...row, receives_rfqs: event.target.checked } : row))} /> Receives RFQs</label><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={contact.receives_purchase_orders} onChange={(event) => setContacts((rows) => rows.map((row, position) => position === index ? { ...row, receives_purchase_orders: event.target.checked } : row))} /> Receives purchase orders</label><Button type="button" size="icon" variant="ghost" className="ml-auto" onClick={() => setContacts((rows) => rows.filter((_, position) => position !== index))}><Trash2 className="size-4 text-destructive" /></Button></div></div>)}{contacts.length === 0 && <p className="py-2 text-center text-xs text-gray-05">The primary vendor email will be used until contacts are added.</p>}</div></div></section> : <div className="rounded-md border border-dashed border-white-02 p-3 text-xs text-gray-05">Contact, tax, and bank fields require sensitive vendor access.</div>}
    <section className="space-y-3"><div className="flex items-center gap-2"><CircleDollarSign className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Accounting defaults</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Payable account"><AccountPicker entity={entity} value={payable} onChange={setPayable} accountType="LIABILITY" postableOnly /></FormField><FormField label="Default expense account"><AccountPicker entity={entity} value={expense} onChange={setExpense} accountType="EXPENSE" postableOnly /></FormField><FormField label="Default WHT code"><TaxCodePicker entity={entity} value={wht} onChange={setWht} placeholder="No default WHT" /></FormField></div></section>
    {canSensitive && <section className="space-y-3"><div className="flex items-center gap-2"><Landmark className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Bank details</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Bank"><Input value={bankName} onChange={(event) => setBankName(event.target.value)} className="bg-white" /></FormField><FormField label="Account number"><Input value={bankNumber} onChange={(event) => setBankNumber(event.target.value)} inputMode="numeric" className="bg-white" /></FormField><div className="sm:col-span-2"><FormField label="Account name"><Input value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} className="bg-white" /></FormField></div></div></section>}
    {initial && <section className="space-y-3"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Status & Governance</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><VendorGovernanceFields canManage={canManage} kyc={kyc} risk={risk} onHold={onHold} onKycChange={setKyc} onRiskChange={setRisk} onHoldChange={setOnHold} /></section>}
  </FormDrawer>;
}
