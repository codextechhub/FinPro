import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import {
  BadgeCheck, Ban, Building2, ChevronRight, CircleDollarSign, FilePenLine,
  FileText, History, Landmark, Mail, MapPin, Phone, Plus, Search, ShieldCheck,
  Store, TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  AccessField, AccountPicker, DataTable, DetailDrawer, ErrorState, FormDrawer,
  FormField, LoadingState, StatCard, StatusPill, TabStrip, TaxCodePicker, toArray,
  fieldWriteErrors, useFieldAccess,
  type Column, type FieldAccess, type FieldErrors, type TabStripItem,
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
  PurchaseOrder, Vendor, VendorContact, VendorContract, VendorInsights, VendorInvoice,
} from "@/redux/services/procurement/procurement-types";
import { formatMoney } from "@/utils/money";
import { CategoryPicker } from "../pickers";
import { ProcurementPageHeader } from "../screen-help";
import { buildVendorUpdatePayload, type VendorFormValues } from "./vendor-update-payload";
import { VendorGovernanceFields } from "./vendor-governance-fields";
import { VendorContactsEditor } from "./vendor-contacts-editor";
import { CONTACT_DETAILS, CONTACT_FLAGS, VENDOR_CONTACT, canChangeContactList, contactTitle, contactsChange } from "./vendor-contacts";
import { PAYMENT_TERMS, paymentTermsLabel } from "../payment-terms";
import { useDates } from "../../../lib/display-prefs";
import { isForbidden } from "../../../lib/api-errors";

const STATUS_TABS = [
  ["All", "all"], ["Active", "active"], ["On Hold", "hold"], ["Inactive", "inactive"],
] as const;
const DETAIL_TABS = [
  ["profile", "Profile", Store], ["contacts", "Contacts", Users],
  ["bank", "Bank & Compliance", Landmark], ["history", "Contracts & History", History],
  ["performance", "Performance", TrendingUp],
] as const;
/**
 * Field Access resource for a vendor: its contact, tax, banking, category,
 * terms and compliance values each carry a switch. The vendor's name does not;
 * every picker, document and message identifies the supplier by it. The people
 * at the vendor are a second resource, `procurement.vendor_contact`, handled in
 * `vendor-contacts.ts`.
 */
const VENDOR = "procurement.vendor";
const CONTACT_FIELDS = ["email", "phone", "address"];
const PAYMENT_FIELDS = ["bank_name", "bank_account_number", "bank_account_name"];
/** Field names a refused `contacts` save may name, shown beside the contact list. */
const CONTACT_ERROR_NAMES = [...CONTACT_DETAILS, ...CONTACT_FLAGS];

/** Strip items for the two switchers, built once so the sliding bar re-measures only when the active tab changes. */
const STATUS_TAB_ITEMS: TabStripItem<(typeof STATUS_TABS)[number][1]>[] = STATUS_TABS.map(([label, value]) => ({ value, label }));
const DETAIL_TAB_ITEMS: TabStripItem<string>[] = DETAIL_TABS.map(([value, label, Icon]) => ({
  value,
  label: <><Icon className="size-3.5" />{label}</>,
}));
/** The Contacts tab holds nothing but contact fields, so it goes when they are all hidden. */
const NO_CONTACTS_TAB_ITEMS = DETAIL_TAB_ITEMS.filter((item) => item.value !== "contacts");
/** The status tabs without On Hold, for a role that may not read the hold. */
const NO_HOLD_STATUS_TAB_ITEMS = STATUS_TAB_ITEMS.filter((item) => item.value !== "hold");
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

/**
 * The vendor list's tabs, filters, columns and summary cards follow Field Access
 * on `procurement.vendor`. A value the role may not read has no column, no
 * filter, no tab and no summary card, and a filter on it is never sent because
 * the server refuses a list filtered by a field it hides.
 */
export function VendorsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const fields = useFieldAccess(VENDOR);
  const showHold = !fields.isHidden("on_hold");
  const showKyc = !fields.isHidden("kyc_status");
  const showCategory = !fields.isHidden("category_code");
  const showTerms = !fields.isHidden("payment_terms");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number][1]>("all");
  const [kyc, setKyc] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", can(P.PROC_CREATE_VENDOR), () => setCreating(true));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const statusParams = useMemo(() => ({
    ...(status === "active" ? { is_active: true, ...(showHold ? { on_hold: false } : {}) } : {}),
    ...(status === "hold" && showHold ? { on_hold: true } : {}),
    ...(status === "inactive" ? { is_active: false } : {}),
    ...(kyc && showKyc ? { kyc_status: kyc } : {}),
  }), [status, kyc, showHold, showKyc]);
  const params = useMemo(() => ({
    entity, page,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...statusParams,
  }), [entity, page, debouncedSearch, statusParams]);
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetVendorsQuery(params);
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useGetVendorSummaryQuery({ entity });
  const rows = toArray(data?.data);
  const summary = summaryData?.data;
  const columns: Column<Vendor>[] = [
    { header: "Vendor", cell: (vendor) => <VendorIdentity vendor={vendor} /> },
    ...(showCategory ? [{ header: "Category", cell: (vendor: Vendor) => vendor.category_code || "Uncategorised" }] : []),
    ...(showTerms ? [{ header: "Terms", cell: (vendor: Vendor) => paymentTermsLabel(vendor.payment_terms) || "-" }] : []),
    { header: "Active POs", align: "right", cell: (vendor) => <span className="tabular-nums">{vendor.active_po_count ?? 0}</span> },
    ...(showKyc ? [{ header: "KYC", cell: (vendor: Vendor) => <StatusPill status={vendor.kyc_status ?? ""} /> }] : []),
    { header: "Status", cell: (vendor) => <StatusPill status={vendorState(vendor)} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-05" /> },
  ];

  return <>
    <ProcurementPageHeader
      data-guide="procurement-vendors.heading"
      screen="vendors"
      title="Vendors"
      description="Vendors, categories and the item catalog."
      actions={<>
        {/* Forwards the SAME derived params the list query uses, so the file
            matches the tab that is open - the status tab expands to is_active
            and on_hold, and both cross into the export. */}
        <QuickExportButton
          screen="procurement.vendors"
          params={{ q: debouncedSearch, ...statusParams }}
          entity={entity}
          typeface="geist"
          defaultName="Vendor master"
        />
        <Can permission={P.PROC_CREATE_VENDOR}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> Add Vendor</Button></Can>
      </>}
    />

    <div data-guide="procurement-vendors.summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaryLoading ? <div className={cn(INFORMATION_CARD_SURFACE, "col-span-full rounded-md")}><LoadingState rows={2} /></div> : summary ? <>
        <StatCard label="Active Vendors" value={String(summary.active)} icon={BadgeCheck} tone="green" sub={`${summary.inactive} inactive`} />
        <StatCard label="Total Spend YTD" value={formatMoney(summary.total_spend_ytd, currency)} icon={CircleDollarSign} tone="indigo" sub="Posted vendor invoices" />
        {"average_payment_days" in summary
          ? <StatCard label="Average Terms" value={summary.average_payment_days == null ? "-" : `Net ${summary.average_payment_days}`} icon={FileText} tone="gray" sub={summary.kyc_pending == null ? undefined : `${summary.kyc_pending} KYC pending`} />
          : summary.kyc_pending == null ? null : <StatCard label="KYC Pending" value={String(summary.kyc_pending)} icon={FileText} tone="gray" sub="Identity checks outstanding" />}
        {summary.on_hold == null ? null : <StatCard label="On Hold" value={String(summary.on_hold)} icon={Ban} tone="red" sub="New commitments blocked" />}
      </> : <div className="col-span-full rounded-md border border-dashed border-white-02 bg-white p-4 text-xs text-gray-05">{isForbidden(summaryError) ? "Vendor financial KPIs require Procurement report access." : "Vendor KPIs could not be loaded."}</div>}
    </div>

    <section data-guide="procurement-vendors.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
        <TabStrip
          items={showHold ? STATUS_TAB_ITEMS : NO_HOLD_STATUS_TAB_ITEMS}
          value={status}
          onChange={(next) => { setStatus(next); setPage(1); }}
          variant="underline"
          ariaLabel="Vendor status"
          className="gap-5 self-center border-b-0"
          buttonClassName="px-0 py-3"
        />
        <div className="my-2 flex min-w-0 basis-full flex-wrap justify-end gap-2 xl:basis-auto">
          {showKyc ? <select value={kyc} onChange={(event) => { setKyc(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 font-mont text-xs text-black-01">
            <option value="">All KYC states</option><option value="PENDING">KYC Pending</option><option value="VERIFIED">KYC Verified</option><option value="REJECTED">KYC Rejected</option>
          </select> : null}
          <label className="relative order-last min-w-0 basis-full sm:order-none sm:min-w-32 sm:flex-1 sm:basis-auto sm:max-w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search vendors" className="h-9 bg-white pl-9" /></label>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(vendor) => vendor.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(vendor) => setSelectedId(vendor.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No vendors found" emptyMessage={debouncedSearch || status !== "all" || (showKyc && kyc) ? "Try changing the search or status filters." : "Add the first supplier master record for this entity."} mobileCard={(vendor) => <VendorMobileCard vendor={vendor} showCategory={showCategory} showKyc={showKyc} />} />
    </section>

    <VendorDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <VendorForm entity={entity} canManage={can(P.PROC_VERIFY_VENDOR)} onClose={() => setCreating(false)} />}
  </>;
}

function VendorIdentity({ vendor }: { vendor: Vendor }) {
  return <div className="flex min-w-44 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mont text-xs font-semibold text-primary">{initials(vendor.name)}</span><div className="min-w-0"><p className="truncate font-mont text-sm font-semibold text-black-01">{vendor.name}</p><p className="mt-0.5 font-mont text-[11px] text-gray-05">{vendor.code}</p></div></div>;
}
function VendorMobileCard({ vendor, showCategory, showKyc }: { vendor: Vendor; showCategory: boolean; showKyc: boolean }) {
  return <div className="space-y-3 border-b border-white-02 px-3.5 py-3 last:border-0"><VendorIdentity vendor={vendor} /><div className="flex flex-wrap gap-1"><StatusPill status={vendorState(vendor)} />{showKyc ? <StatusPill status={vendor.kyc_status ?? ""} /> : null}</div><div className="grid grid-cols-2 gap-3 text-xs">{showCategory ? <div><p className="text-[11px] text-gray-05">Category</p><p className="mt-1 font-medium">{vendor.category_code || "Uncategorised"}</p></div> : null}<div><p className="text-[11px] text-gray-05">Active POs</p><p className="mt-1 font-medium tabular-nums">{vendor.active_po_count ?? 0}</p></div></div></div>;
}
function VendorDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const { can } = useCan();
  const [tab, setTab] = useState("profile");
  const [editing, setEditing] = useState(false);
  const { data, isLoading, isError, refetch } = useGetVendorQuery({ id: id!, entity }, { skip: id == null });
  const vendor = data?.data;
  const access = useFieldAccess(VENDOR, vendor);
  const showContacts = access.anyVisible(...CONTACT_FIELDS) || vendor?.contacts !== undefined;
  const subtitle = vendor ? [vendor.code, access.isHidden("category_code") ? null : vendor.category_code || "Uncategorised"].filter(Boolean).join(" · ") : "Loading vendor profile";
  const insightsAllowed = can(P.PROC_VIEW_ANALYTICS);
  const contractAllowed = can(P.PROC_VIEW_CONTRACTS);
  const poAllowed = can(P.PROC_VIEW_PURCHASE_ORDERS);
  const invoiceAllowed = can(P.PROC_VIEW_VENDOR_INVOICES);
  const { data: insightData, isLoading: insightLoading, isError: insightError } = useGetVendorInsightsQuery({ id: id!, entity }, { skip: id == null || !insightsAllowed });
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
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && closeDrawer()} title={vendor?.name || "Vendor"} description={subtitle} widthClass="sm:max-w-[720px]" footer={vendor && <Can permission={P.PROC_UPDATE_VENDOR}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit Vendor</Button></Can>}>
      {isLoading ? <LoadingState /> : isError || !vendor ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5"><StatusPill status={vendorState(vendor)} />{access.isHidden("kyc_status") ? null : <StatusPill status={vendor.kyc_status ?? ""} />}{access.isHidden("risk") ? null : <StatusPill status={vendor.risk ?? ""} />}</div>
        <TabStrip
          items={showContacts ? DETAIL_TAB_ITEMS : NO_CONTACTS_TAB_ITEMS}
          value={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel="Vendor sections"
          className="w-full gap-1"
          buttonClassName="flex items-center gap-1.5 px-3"
        />
        {tab === "profile" && <ProfileTab vendor={vendor} access={access} insights={insightsAllowed ? insights : undefined} currency={currency} insightsRestricted={!insightsAllowed} />}
        {tab === "contacts" && showContacts && <ContactsTab vendor={vendor} access={access} />}
        {tab === "bank" && <BankTab vendor={vendor} access={access} />}
        {tab === "history" && <HistoryTab contracts={contracts} pos={pos} invoices={invoices} loading={contractsLoading || posLoading || invoicesLoading} contractAllowed={contractAllowed} poAllowed={poAllowed} invoiceAllowed={invoiceAllowed} currency={currency} />}
        {tab === "performance" && <PerformanceTab insights={insights} loading={insightLoading} error={insightError} restricted={!insightsAllowed} currency={currency} />}
      </div>}
    </DetailDrawer>
    {editing && vendor && <VendorForm key={vendor.id} entity={entity} initial={vendor} canManage={can(P.PROC_VERIFY_VENDOR)} onClose={() => setEditing(false)} />}
  </>;
}

function ProfileTab({ vendor, access, insights, currency, insightsRestricted }: { vendor: Vendor; access: FieldAccess; insights?: VendorInsights; currency?: string | null; insightsRestricted: boolean }) {
  return <div className="space-y-5"><dl className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Vendor code" value={vendor.code} />{access.isHidden("category_code") ? null : <Field label="Category" value={vendor.category_code || "Uncategorised"} />}{access.isHidden("payment_terms") ? null : <Field label="Payment terms" value={paymentTermsLabel(vendor.payment_terms) || "-"} />}<Field label="Payable account" value={vendor.payable_code} /><Field label="Default expense" value={vendor.default_expense_code} /><Field label="Default withholding tax" value={vendor.default_wht_tax_code_value} /><Field label="YTD spend" value={insightsRestricted ? "Restricted" : formatMoney(insights?.spend_ytd || 0, currency)} /><Field label="Active purchase orders" value={vendor.active_po_count ?? insights?.po_count ?? 0} /></dl>{access.isHidden("address") ? null : <div><p className="mb-2 font-mont text-xs font-semibold text-black-01">Registered address</p><div className="rounded-md border border-white-02 p-3"><Field label="Address" value={vendor.address} prose /></div></div>}</div>;
}
/**
 * A vendor's contact details. Each block appears only when its field is visible
 * to this user, and a contact person's row shows only the details and routing
 * flags that came back with it, because each is its own Field Access field.
 */
function ContactsTab({ vendor, access }: { vendor: Vendor; access: FieldAccess }) {
  return <div className="space-y-3">
    {access.isHidden("email") ? null : <div className="flex items-start gap-3 rounded-md border border-white-02 p-4"><Mail className="mt-0.5 size-4 text-primary" /><Field label="Primary email" value={vendor.email} /></div>}
    {(vendor.contacts || []).map((contact, index) => <ContactCard key={contact.id ?? index} contact={contact} />)}
    {access.isHidden("phone") ? null : <div className="flex items-start gap-3 rounded-md border border-white-02 p-4"><Phone className="mt-0.5 size-4 text-primary" /><Field label="Primary phone" value={vendor.phone} /></div>}
    {access.isHidden("address") ? null : <div className="flex items-start gap-3 rounded-md border border-white-02 p-4"><MapPin className="mt-0.5 size-4 text-primary" /><Field label="Registered office" value={vendor.address} prose /></div>}
  </div>;
}
/** One person at the vendor, with the details and flags the role may read. */
function ContactCard({ contact }: { contact: VendorContact }) {
  const yesNo = (value: boolean | undefined) => (value ? "Yes" : "No");
  return <div data-contact-card className="flex items-start gap-3 rounded-md border border-white-02 p-4"><Users className="mt-0.5 size-4 text-primary" /><div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
    <Field label={"is_primary" in contact ? (contact.is_primary ? "Primary vendor contact" : "Vendor contact") : "Vendor contact"} value={contactTitle(contact)} />
    {"email" in contact ? <Field label="Email" value={contact.email} /> : null}
    {"phone" in contact ? <Field label="Phone" value={contact.phone} /> : null}
    {"receives_rfqs" in contact ? <Field label="Receives RFQs" value={yesNo(contact.receives_rfqs)} /> : null}
    {"receives_purchase_orders" in contact ? <Field label="Receives purchase orders" value={yesNo(contact.receives_purchase_orders)} /> : null}
    {"is_active" in contact ? <Field label="Active" value={yesNo(contact.is_active)} /> : null}
  </div></div>;
}
/** Payment and compliance. The payment section goes when all its fields are hidden; compliance always has status to show. */
function BankTab({ vendor, access }: { vendor: Vendor; access: FieldAccess }) {
  const account = vendor.bank_account_number ? `•••• ${vendor.bank_account_number.slice(-4)}` : "-";
  return <div className="space-y-5">
    {access.anyVisible(...PAYMENT_FIELDS) ? <section><div className="mb-3 flex items-center gap-2"><Landmark className="size-4 text-primary" /><h3 className="font-mont text-sm font-semibold">Payment information</h3></div><dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">{access.isHidden("bank_name") ? null : <Field label="Bank" value={vendor.bank_name} />}{access.isHidden("bank_account_number") ? null : <Field label="Account number" value={account} />}{access.isHidden("bank_account_name") ? null : <Field label="Account name" value={vendor.bank_account_name} />}</dl></section> : null}
    <section><div className="mb-3 flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><h3 className="font-mont text-sm font-semibold">Compliance status</h3></div><dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">{access.isHidden("tax_id") ? null : <Field label="Tax identifier" value={vendor.tax_id} />}{access.isHidden("kyc_status") ? null : <Field label="KYC status" value={<StatusPill status={vendor.kyc_status ?? ""} />} />}{access.isHidden("risk") ? null : <Field label="Risk level" value={<StatusPill status={vendor.risk ?? ""} />} />}<Field label={access.isHidden("on_hold") ? "Account status" : "Purchasing status"} value={<StatusPill status={vendorState(vendor)} />} /></dl>{access.anyVisible("kyc_status", "risk") ? <p className="mt-3 text-xs text-gray-05">Verification documents and KYC results are not stored by the current Procurement service, so none are implied here.</p> : null}</section>
  </div>;
}
function HistoryTab({ contracts, pos, invoices, loading, contractAllowed, poAllowed, invoiceAllowed, currency }: { contracts: VendorContract[]; pos: PurchaseOrder[]; invoices: VendorInvoice[]; loading: boolean; contractAllowed: boolean; poAllowed: boolean; invoiceAllowed: boolean; currency?: string | null }) {
  const dates = useDates();
  if (loading) return <LoadingState rows={4} />;
  return <div className="space-y-5"><HistorySection title="Contracts" restricted={!contractAllowed} empty="No contracts are registered for this vendor.">{contracts.map((contract) => <HistoryRow key={contract.id} title={contract.title} sub={`${contract.reference} · ends ${dates.day(contract.end_date)}`} value={formatMoney(contract.contract_value, currency)} status={contract.status} />)}</HistorySection><HistorySection title="Purchase orders" restricted={!poAllowed} empty="No purchase orders are recorded for this vendor.">{pos.map((po) => <HistoryRow key={po.id} title={po.document_number} sub={dates.day(po.order_date)} value={formatMoney(po.total, currency)} status={po.display_status || po.status} />)}</HistorySection><HistorySection title="Vendor invoices" restricted={!invoiceAllowed} empty="No vendor invoices are recorded for this vendor.">{invoices.map((invoice) => <HistoryRow key={invoice.id} title={invoice.document_number} sub={dates.day(invoice.invoice_date)} value={formatMoney(invoice.total, currency)} status={invoice.display_status || invoice.status} />)}</HistorySection></div>;
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

/**
 * Add or edit a vendor.
 *
 * Every field with a switch on `procurement.vendor` follows it: a hidden one is
 * not on the form, a read-only one is greyed and never sent, and a section with
 * nothing visible is left out. The vendor's name has no switch. The category is
 * shown under its response names (`category_id`, `category_code`) and written
 * under the body key `category`, so its visibility and its write state are
 * asked of different names. The contact people follow
 * `procurement.vendor_contact` (see `vendor-contacts.ts`): the list is offered
 * on Add only to a role that may write a contact's email, and submitted only
 * when something the role may write has changed. On edit the vendor's own
 * `_read_only_fields` decides; on Add the signed-in user's map does.
 */
export function VendorForm({ entity, initial, canManage, onClose }: { entity: string; initial?: Vendor; canManage: boolean; onClose: () => void }) {
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
  const [contacts, setContacts] = useState<VendorContact[]>(() => (initial?.contacts || []).map((row) => ({ ...row })));
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [contactsSent, setContactsSent] = useState(false);
  const [create, { isLoading: creating }] = useCreateVendorMutation();
  const [update, { isLoading: updating }] = useUpdateVendorMutation();
  const access = useFieldAccess(VENDOR, initial);
  const contactAccess = useFieldAccess(VENDOR_CONTACT);
  const mode = { creating: !initial };
  const values: VendorFormValues = { name, category, email, phone, address, taxId, bankName, bankNumber, bankAccountName, payable, expense, wht, terms, kyc, risk, onHold, active };
  const updatePayload = initial ? buildVendorUpdatePayload(initial, values, { fields: access, canManage }) : null;
  const contactsValue = contactsChange(initial?.contacts, contacts, contactAccess);
  const showContacts = initial ? initial.contacts !== undefined : canChangeContactList(contactAccess);
  const canSubmit = !!name.trim() && (!initial || Object.keys(updatePayload || {}).length > 0 || contactsValue !== undefined);
  const saving = creating || updating;
  const save = async () => {
    const body = access.writableOnly({
      name: name.trim(), category, payable_account: payable, default_expense_account: expense, default_wht_tax_code: wht, payment_terms: terms,
      email, phone, address, tax_id: taxId, bank_name: bankName, bank_account_number: bankNumber, bank_account_name: bankAccountName,
    }, { creating: true });
    setDenied(null);
    setContactsSent(contactsValue !== undefined);
    try {
      const result = initial
        ? await update({ id: initial.id, entity, ...updatePayload, ...(contactsValue ? { contacts: contactsValue } : {}) }).unwrap()
        : await create({ entity, ...body, ...(contactsValue?.length ? { contacts: contactsValue } : {}) }).unwrap();
      toast.success(result.message || (initial ? "Vendor updated." : "Vendor created."));
      onClose();
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };
  const field = (fieldName: string, label: string, control: React.ReactNode, className?: string) => (
    <AccessField access={access} name={fieldName} label={label} creating={mode.creating} errors={denied} className={className}>{control}</AccessField>
  );
  const contactsError = contactsSent && denied ? CONTACT_ERROR_NAMES.map((key) => denied[key]).find(Boolean) ?? null : null;
  const showCategory = !access.isHidden("category_code", mode);
  const showTerms = !access.isHidden("payment_terms", mode);
  return <FormDrawer open onOpenChange={(open) => !open && onClose()} title={initial ? `Edit ${initial.name}` : "Add Vendor"} description={initial ? "Update the supplier master without rewriting historical transactions." : "Create a supplier master record. New vendors begin with KYC pending."} widthClass="sm:max-w-[720px]" onSubmit={save} submitText={initial ? "Save Changes" : "Create Vendor"} loading={saving} canSubmit={canSubmit}>
    <section className="space-y-3"><div className="flex items-center gap-2"><Building2 className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Company</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><FormField label="Company name" required><Input value={name} onChange={(event) => setName(event.target.value)} className="bg-white" /></FormField></div>{showCategory ? <AccessField access={access} name="category" label="Category" creating={mode.creating} errors={denied}><CategoryPicker entity={entity} value={category} onChange={setCategory} /></AccessField> : null}{showTerms ? <AccessField access={access} name="payment_terms" label="Payment terms" creating={mode.creating} errors={denied}><select value={terms} onChange={(event) => setTerms(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 font-mont text-sm">{PAYMENT_TERMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></AccessField> : null}</div></section>
    {access.anyVisible("email", "phone", "tax_id", "address", mode) || showContacts ? <section className="space-y-3"><div className="flex items-center gap-2"><Users className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Contact & tax</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("email", "Email", <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="bg-white" />)}{field("phone", "Phone", <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="bg-white" />)}{field("tax_id", "Tax identifier", <Input value={taxId} onChange={(event) => setTaxId(event.target.value)} className="bg-white uppercase" />)}{field("address", "Registered address", <Textarea value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-20 bg-white" />, "sm:col-span-2")}</div>{showContacts ? <VendorContactsEditor rows={contacts} onChange={setContacts} error={contactsError} /> : null}</section> : null}
    <section className="space-y-3"><div className="flex items-center gap-2"><CircleDollarSign className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Accounting defaults</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Payable account"><AccountPicker entity={entity} value={payable} onChange={setPayable} accountType="LIABILITY" postableOnly /></FormField><FormField label="Default expense account"><AccountPicker entity={entity} value={expense} onChange={setExpense} accountType="EXPENSE" postableOnly /></FormField><FormField label="Default withholding tax code"><TaxCodePicker entity={entity} value={wht} onChange={setWht} placeholder="No default withholding tax" /></FormField></div></section>
    {access.anyVisible(...PAYMENT_FIELDS, mode) && <section className="space-y-3"><div className="flex items-center gap-2"><Landmark className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Bank details</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("bank_name", "Bank", <Input value={bankName} onChange={(event) => setBankName(event.target.value)} className="bg-white" />)}{field("bank_account_number", "Account number", <Input value={bankNumber} onChange={(event) => setBankNumber(event.target.value)} inputMode="numeric" className="bg-white" />)}{field("bank_account_name", "Account name", <Input value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} className="bg-white" />, "sm:col-span-2")}</div></section>}
    {initial && <section className="space-y-3"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Status & Governance</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><VendorGovernanceFields canManage={canManage} access={access} errors={denied} kyc={kyc} risk={risk} onHold={onHold} onKycChange={setKyc} onRiskChange={setRisk} onHoldChange={setOnHold} /></section>}
  </FormDrawer>;
}
