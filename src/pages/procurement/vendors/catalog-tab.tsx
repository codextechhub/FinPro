import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Clock3, FileClock, Info, Package, PencilLine,
  Plus, Search, Store, Tags,
} from "lucide-react";
import { toast } from "sonner";

import { SearchSelect } from "@/components/custom/search-select";
import {
  AccountPicker, DataTable, DetailDrawer, FormDrawer, FormField, Money,
  MoneyInput, StatusPill, TabStrip, TaxCodePicker, toArray, type Column, type TabStripItem,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionParam } from "@/hooks/use-action-param";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../../permissions";
import {
  useCreateCatalogItemMutation, useGetCatalogItemInsightsQuery,
  useGetCatalogItemQuery, useGetCatalogItemsQuery, useGetCategoriesQuery,
  useGetVendorsQuery, useUpdateCatalogItemMutation,
} from "@/redux/services/procurement/procurement-api";
import type {
  CatalogItem, CatalogItemInsights, VendorCategory,
} from "@/redux/services/procurement/procurement-types";
import { formatMoney } from "@/utils/money";
import { CategoryPicker, VendorPicker } from "../pickers";

const STATUS_TABS = [["All", "all"], ["Active", "active"], ["Inactive", "inactive"]] as const;
const DETAIL_TABS = [
  ["Overview", "overview", Info],
  ["Vendor Pricing", "pricing", Store],
  ["Purchase History", "history", FileClock],
] as const;

/** Strip items for the two switchers, built once so the sliding bar re-measures only when the active tab changes. */
const STATUS_TAB_ITEMS: TabStripItem<(typeof STATUS_TABS)[number][1]>[] = STATUS_TABS.map(([label, value]) => ({ value, label }));
const DETAIL_TAB_ITEMS: TabStripItem<(typeof DETAIL_TABS)[number][1]>[] = DETAIL_TABS.map(([label, value, Icon]) => ({
  value,
  label: <><Icon className="size-3.5" />{label}</>,
}));

function isForbidden(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}

function categoryTree(rows: VendorCategory[]) {
  const children = new Map<number | null, VendorCategory[]>();
  for (const category of rows) children.set(category.parent_id, [...(children.get(category.parent_id) || []), category]);
  for (const group of children.values()) group.sort((a, b) => a.code.localeCompare(b.code));
  const ordered: VendorCategory[] = [];
  const visit = (parent: number | null) => (children.get(parent) || []).forEach((category) => {
    ordered.push(category);
    visit(category.id);
  });
  visit(null);
  return ordered;
}

function stockLabel(status: CatalogItem["stock_status"]) {
  return status || "NOT_TRACKED";
}

function Field({ label, value, prose }: { label: string; value: React.ReactNode; prose?: boolean }) {
  return <div className="min-w-0"><dt className="font-mont text-[11px] text-gray-05">{label}</dt><dd className={cn("mt-1 break-words font-mont text-sm text-black-01", prose ? "font-normal leading-5" : "font-semibold tabular-nums")}>{value ?? "-"}</dd></div>;
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs leading-5 text-gray-05">{children}</div>;
}

export function CatalogTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const canStock = can(P.PROC_VIEW_STOCK);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number][1]>("all");
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", can(P.PROC_CREATE_CATALOG_ITEM), () => setCreating(true));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => ({
    entity, page,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(status === "active" ? { is_active: true } : {}),
    ...(status === "inactive" ? { is_active: false } : {}),
    ...(category ? { category } : {}),
    ...(vendor ? { vendor } : {}),
  }), [entity, page, debouncedSearch, status, category, vendor]);
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetCatalogItemsQuery(params);
  const { data: categoriesResponse, isLoading: categoriesLoading } = useGetCategoriesQuery({ entity, page_size: 100 });
  const { data: vendorsResponse, isLoading: vendorsLoading } = useGetVendorsQuery({ entity, page_size: 100 });
  const rows = toArray(data?.data);
  const categoryOptions = [
    { value: "", label: "All categories" },
    ...categoryTree(toArray(categoriesResponse?.data)).map((item) => ({
      value: item.code,
      label: `${"- ".repeat(item.level - 1)}${item.code} - ${item.name}`,
    })),
  ];
  const vendorOptions = [
    { value: "", label: "All vendors" },
    ...toArray(vendorsResponse?.data).map((item) => ({ value: item.code, label: `${item.code} - ${item.name}` })),
  ];
  const columns: Column<CatalogItem>[] = [
    { header: "Item", cell: (item) => <ItemIdentity item={item} /> },
    { header: "Category", cell: (item) => item.category_name || "Uncategorised" },
    { header: "Unit", cell: (item) => item.unit_of_measure },
    { header: "Standard price", align: "right", cell: (item) => <Money kobo={item.standard_unit_price} currency={currency} align="right" /> },
    { header: "Preferred vendor", cell: (item) => item.preferred_vendor_name || "-" },
    { header: "Lead time", cell: (item) => item.lead_time_days == null ? "-" : `${item.lead_time_days} day${item.lead_time_days === 1 ? "" : "s"}` },
    ...(canStock ? [{ header: "Stock", cell: (item: CatalogItem) => <StatusPill status={stockLabel(item.stock_status)} /> } satisfies Column<CatalogItem>] : []),
    { header: "Status", cell: (item) => <StatusPill status={item.is_active ? "ACTIVE" : "INACTIVE"} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  return <>
    <header data-guide="procurement-catalog.heading" className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-mont text-lg font-semibold text-gray-01">Catalog</h1>
        <p className="mt-0.5 font-mont text-xs text-gray-05">Master item list with purchasing defaults, preferred vendors and reference pricing.</p>
      </div>
      <Can permission={P.PROC_CREATE_CATALOG_ITEM}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> New Item</Button></Can>
    </header>

    <section data-guide="procurement-catalog.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
        <TabStrip
          items={STATUS_TAB_ITEMS}
          value={status}
          onChange={(next) => { setStatus(next); setPage(1); }}
          variant="underline"
          ariaLabel="Catalog item status"
          className="gap-5 self-center border-b-0"
          buttonClassName="px-0 py-3"
        />
        <label className="relative my-2 min-w-0 basis-full sm:min-w-52 sm:flex-1 sm:basis-auto sm:max-w-72"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search catalog" className="h-9 bg-white pl-9" /></label>
      </div>
      <div className="grid grid-cols-1 gap-2 border-b border-white-02 p-3 sm:grid-cols-2">
        <SearchSelect options={categoryOptions} value={category} loading={categoriesLoading} onChange={(event) => { setCategory(event.target.value); setPage(1); }} placeholder="All categories" />
        <SearchSelect options={vendorOptions} value={vendor} loading={vendorsLoading} onChange={(event) => { setVendor(event.target.value); setPage(1); }} placeholder="All vendors" />
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(item) => item.id}
        loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch}
        onRowClick={(item) => setSelectedId(item.id)}
        page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage}
        emptyTitle="No catalog items found"
        emptyMessage={debouncedSearch || status !== "all" || category || vendor ? "Try changing the search or filters." : "Create the first purchasing catalog item for this entity."}
        mobileCard={(item) => <CatalogMobileCard item={item} currency={currency} showStock={canStock} />}
        cardBreakpoint="lg"
      />
    </section>

    <CatalogDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <CatalogForm entity={entity} currency={currency} onClose={() => setCreating(false)} />}
  </>;
}

function ItemIdentity({ item }: { item: CatalogItem }) {
  return <div className="flex min-w-48 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Package className="size-4" /></span><div className="min-w-0"><p className="truncate font-mont text-sm font-semibold text-black-01">{item.name}</p><p className="mt-0.5 font-mont text-[11px] font-semibold text-primary">{item.code}</p></div></div>;
}

function CatalogMobileCard({ item, currency, showStock }: { item: CatalogItem; currency?: string | null; showStock: boolean }) {
  return <div className="space-y-3"><ItemIdentity item={item} /><div className="flex flex-wrap gap-1"><StatusPill status={item.is_active ? "ACTIVE" : "INACTIVE"} />{showStock && <StatusPill status={stockLabel(item.stock_status)} />}</div><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-[11px] text-gray-05">Category</p><p className="mt-1 font-medium">{item.category_name || "Uncategorised"}</p></div><div><p className="text-[11px] text-gray-05">Unit</p><p className="mt-1 font-medium">{item.unit_of_measure}</p></div><div><p className="text-[11px] text-gray-05">Standard price</p><p className="mt-1 font-semibold tabular-nums">{formatMoney(item.standard_unit_price, currency)}</p></div><div><p className="text-[11px] text-gray-05">Preferred vendor</p><p className="mt-1 font-medium">{item.preferred_vendor_name || "-"}</p></div></div></div>;
}

function CatalogDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const { can } = useCan();
  const canReports = can(P.PROC_VIEW_PROC_REPORTS);
  const canStock = can(P.PROC_VIEW_STOCK);
  const { data, isLoading, isError, error, refetch } = useGetCatalogItemQuery({ id: id!, entity }, { skip: id == null });
  const { data: insightsResponse, isLoading: insightsLoading, isError: insightsError } = useGetCatalogItemInsightsQuery({ id: id!, entity }, { skip: id == null || !canReports });
  const item = data?.data;
  const insights = insightsResponse?.data;
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number][1]>("overview");
  const [editing, setEditing] = useState(false);
  return <>
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} title={item?.name || "Catalog Item"} description={item ? `${item.code} · ${item.category_path || "Uncategorised"}` : "Loading catalog item"} widthClass="sm:max-w-[700px]" footer={item && <Can permission={P.PROC_UPDATE_CATALOG_ITEM}><Button variant="outline" onClick={() => setEditing(true)}><PencilLine className="size-4" /> Edit Item</Button></Can>}>
      {isLoading ? <EmptyPanel>Loading catalog item…</EmptyPanel> : isForbidden(error) ? <EmptyPanel>You do not have permission to view this catalog item.</EmptyPanel> : isError || !item ? <EmptyPanel><button type="button" className="text-primary" onClick={() => refetch()}>Catalog item could not be loaded. Try again.</button></EmptyPanel> : <div className="space-y-5">
        <TabStrip
          items={DETAIL_TAB_ITEMS}
          value={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel="Catalog item sections"
          className="w-full gap-5"
          buttonClassName="flex items-center gap-1.5 px-0 py-3"
        />
        {tab === "overview" && <CatalogOverview item={item} currency={currency} showStock={canStock} />}
        {tab === "pricing" && <VendorPricing item={item} insights={insights} currency={currency} allowed={canReports} loading={insightsLoading} error={insightsError} />}
        {tab === "history" && <PurchaseHistory insights={insights} currency={currency} allowed={canReports} loading={insightsLoading} error={insightsError} />}
      </div>}
    </DetailDrawer>
    {editing && item && <CatalogForm entity={entity} currency={currency} initial={item} onClose={() => setEditing(false)} />}
  </>;
}

function CatalogOverview({ item, currency, showStock }: { item: CatalogItem; currency?: string | null; showStock: boolean }) {
  return <div className="space-y-4"><dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Item name" value={item.name} /><Field label="Code" value={item.code} /><Field label="Category" value={item.category_path || "Uncategorised"} /><Field label="Unit of measure" value={item.unit_of_measure} /><Field label="Standard unit price" value={formatMoney(item.standard_unit_price, currency)} /><Field label="Lead time" value={item.lead_time_days == null ? "Not configured" : `${item.lead_time_days} day${item.lead_time_days === 1 ? "" : "s"}`} /><Field label="Preferred vendor" value={item.preferred_vendor_name ? `${item.preferred_vendor_code} · ${item.preferred_vendor_name}` : "Not configured"} /><Field label="Status" value={<StatusPill status={item.is_active ? "ACTIVE" : "INACTIVE"} />} />{showStock && <Field label="Stock status" value={<StatusPill status={stockLabel(item.stock_status)} />} />}<Field label="Default expense account" value={item.expense_code ? `${item.expense_code} · ${item.expense_name}` : "Not configured"} /><Field label="Default purchase tax" value={item.tax_code ? `${item.tax_code} · ${item.tax_name}` : "No tax default"} /></dl><dl className="rounded-md border border-white-02 p-4"><Field label="Description" value={item.description || "No description"} prose /></dl><p className="rounded-md border border-dashed border-white-02 p-4 font-mont text-xs leading-5 text-gray-05">Catalog defaults seed only new purchasing lines and remain overridable. Editing this master item never rewrites existing requisitions, orders, receipts, invoices, stock movements, or journals.</p></div>;
}

function VendorPricing({ item, insights, currency, allowed, loading, error }: { item: CatalogItem; insights?: CatalogItemInsights; currency?: string | null; allowed: boolean; loading: boolean; error: boolean }) {
  if (!allowed) return <EmptyPanel>Historical vendor pricing requires Procurement report access.</EmptyPanel>;
  if (loading) return <EmptyPanel>Loading real purchasing history…</EmptyPanel>;
  if (error) return <EmptyPanel>Historical vendor pricing could not be loaded.</EmptyPanel>;
  return <div className="space-y-4"><div className="rounded-md border border-white-02 p-4"><p className="font-mont text-xs font-semibold text-black-01">Master reference</p><dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Preferred vendor" value={item.preferred_vendor_name || "Not configured"} /><Field label="Standard price" value={formatMoney(item.standard_unit_price, currency)} /></dl><p className="mt-3 font-mont text-xs leading-5 text-gray-05">This is an indicative master default, not a vendor quotation.</p></div>{toArray(insights?.vendor_pricing).length ? <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[520px]"><thead><tr>{["Vendor", "Orders", "Quantity", "Observed price", "Latest"].map((label) => <th key={label} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{label}</th>)}</tr></thead><tbody>{toArray(insights?.vendor_pricing).map((row) => <tr key={row.vendor_id}><td className="border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01">{row.vendor_name}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-black-01">{row.order_count}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-black-01">{row.total_quantity}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-black-01">{row.minimum_unit_price === row.maximum_unit_price ? formatMoney(row.minimum_unit_price, currency) : `${formatMoney(row.minimum_unit_price, currency)} – ${formatMoney(row.maximum_unit_price, currency)}`}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01">{row.latest_order_date}</td></tr>)}</tbody></table></div> : <EmptyPanel>No approved purchase-order pricing is linked to this catalog item yet.</EmptyPanel>}</div>;
}

function PurchaseHistory({ insights, currency, allowed, loading, error }: { insights?: CatalogItemInsights; currency?: string | null; allowed: boolean; loading: boolean; error: boolean }) {
  if (!allowed) return <EmptyPanel>Purchase history requires Procurement report access.</EmptyPanel>;
  if (loading) return <EmptyPanel>Loading real purchase history…</EmptyPanel>;
  if (error) return <EmptyPanel>Purchase history could not be loaded.</EmptyPanel>;
  const rows = toArray(insights?.purchase_history);
  return <div className="space-y-4"><dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Requisition lines" value={insights?.usage.requisition_line_count ?? 0} /><Field label="Linked stock items" value={insights?.usage.stock_item_count ?? 0} /></dl>{rows.length ? <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[520px]"><thead><tr>{["PO", "Vendor", "Date", "Quantity", "Unit price"].map((label) => <th key={label} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${row.purchase_order_id}-${row.document_number}`}><td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold text-primary">{row.document_number}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01">{row.vendor_name}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01">{row.order_date}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-black-01">{row.quantity}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-black-01">{formatMoney(row.unit_price, currency)}</td></tr>)}</tbody></table></div> : <EmptyPanel>No approved purchase orders are linked through this item’s requisition lines yet.</EmptyPanel>}</div>;
}

function CatalogForm({ entity, currency, initial, onClose }: { entity: string; currency?: string | null; initial?: CatalogItem; onClose: () => void }) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [unit, setUnit] = useState(initial?.unit_of_measure || "each");
  const [category, setCategory] = useState(initial?.category_code || "");
  const [vendor, setVendor] = useState(initial?.preferred_vendor_code || "");
  const [expense, setExpense] = useState(initial?.expense_code || "");
  const [tax, setTax] = useState(initial?.tax_code || "");
  const [leadTime, setLeadTime] = useState(initial?.lead_time_days == null ? "" : String(initial.lead_time_days));
  const [price, setPrice] = useState(initial?.standard_unit_price || 0);
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [create, { isLoading: creating }] = useCreateCatalogItemMutation();
  const [update, { isLoading: updating }] = useUpdateCatalogItemMutation();
  const current = JSON.stringify({ name, description, unit, category, vendor, expense, tax, leadTime, price, active });
  const baseline = JSON.stringify({ name: initial?.name || "", description: initial?.description || "", unit: initial?.unit_of_measure || "each", category: initial?.category_code || "", vendor: initial?.preferred_vendor_code || "", expense: initial?.expense_code || "", tax: initial?.tax_code || "", leadTime: initial?.lead_time_days == null ? "" : String(initial.lead_time_days), price: initial?.standard_unit_price || 0, active: initial?.is_active ?? true });
  const leadValid = !leadTime || (/^\d+$/.test(leadTime) && Number(leadTime) <= 32767);
  const valid = code.trim().length <= 40 && !!name.trim() && name.trim().length <= 200 && description.trim().length <= 255 && !!unit.trim() && unit.trim().length <= 24 && leadValid && Number.isInteger(price) && price >= 0;
  const canSubmit = valid && (!initial || current !== baseline);

  const save = async () => {
    if (!canSubmit) return;
    const lead = leadTime ? Number(leadTime) : null;
    try {
      const result = initial
        ? await update({
          id: initial.id, entity,
          ...(name.trim() !== initial.name ? { name: name.trim() } : {}),
          ...(description.trim() !== initial.description ? { description: description.trim() } : {}),
          ...(unit.trim() !== initial.unit_of_measure ? { unit_of_measure: unit.trim() } : {}),
          ...(category !== (initial.category_code || "") ? { category } : {}),
          ...(vendor !== (initial.preferred_vendor_code || "") ? { preferred_vendor: vendor } : {}),
          ...(expense !== (initial.expense_code || "") ? { default_expense_account: expense } : {}),
          ...(tax !== (initial.tax_code || "") ? { default_tax_code: tax } : {}),
          ...(lead !== initial.lead_time_days ? { lead_time_days: lead } : {}),
          ...(price !== initial.standard_unit_price ? { standard_unit_price: price } : {}),
          ...(active !== initial.is_active ? { is_active: active } : {}),
        }).unwrap()
        : await create({ entity, code: code.trim() || undefined, name: name.trim(), description: description.trim(), unit_of_measure: unit.trim(), category: category || undefined, preferred_vendor: vendor || undefined, default_expense_account: expense || undefined, default_tax_code: tax || undefined, lead_time_days: lead, standard_unit_price: price, is_active: active }).unwrap();
      toast.success(result.message || (initial ? "Catalog item updated." : "Catalog item created."));
      onClose();
    } catch { /* Central API handling renders the validation message. */ }
  };

  return <FormDrawer open onOpenChange={(open) => !open && onClose()} title={initial ? `Edit ${initial.name}` : "New Catalog Item"} description={initial ? "Update future purchasing defaults without rewriting historical documents." : "Add an orderable item to the purchasing master list."} onSubmit={save} submitText={initial ? "Save Changes" : "Create Item"} loading={creating || updating} canSubmit={canSubmit} widthClass="sm:max-w-[620px]">
    <section className="space-y-3"><div className="flex items-center gap-2"><Package className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Item</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="SKU / external code"><Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} disabled={!!initial} maxLength={40} placeholder="Optional - generated if blank" className="bg-white font-mont uppercase" /></FormField><FormField label="Item name" required><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} className="bg-white" /></FormField></div><FormField label="Description"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={255} className="min-h-20 bg-white" /></FormField><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Category"><CategoryPicker entity={entity} value={category} onChange={setCategory} placeholder="Uncategorised" /></FormField><FormField label="Unit of measure" required><Input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={24} placeholder="e.g. Unit, Box, Hour" className="bg-white" /></FormField></div></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><Store className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Sourcing defaults</p></div><FormField label="Preferred vendor"><VendorPicker entity={entity} value={vendor} onChange={setVendor} purchaseEligible placeholder="No preferred vendor" /></FormField><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Standard unit price"><MoneyInput valueKobo={price} onChangeKobo={setPrice} currency={currency} /></FormField><FormField label="Lead time (days)"><Input type="number" min={0} max={32767} step={1} value={leadTime} onChange={(event) => setLeadTime(event.target.value)} className="bg-white" /></FormField></div><p className="font-mont text-xs leading-5 text-gray-05">The price and vendor are reference defaults only and remain overridable on each purchasing line.</p></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><Tags className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Accounting defaults</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Default expense account"><AccountPicker entity={entity} value={expense} onChange={setExpense} accountType="EXPENSE" postableOnly activeOnly placeholder="Use category default" /></FormField><FormField label="Default purchase tax"><TaxCodePicker entity={entity} value={tax} onChange={setTax} usage="purchase" placeholder="No tax default" /></FormField></div><p className="font-mont text-xs leading-5 text-gray-05">An item account overrides its active category’s expense default. Only active purchase-tax codes can seed new lines.</p></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><Clock3 className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Governance</p></div><label className="flex items-center gap-2 font-mont text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><p className="font-mont text-xs leading-5 text-gray-05">Inactive items remain readable on historical requisitions and stock records but cannot be assigned to new relationships.</p></section>
  </FormDrawer>;
}
