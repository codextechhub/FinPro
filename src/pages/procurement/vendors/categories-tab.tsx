import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { ChartNoAxesCombined, ChevronRight, Info, Plus, Search, Tags, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AccountPicker,
  DataTable,
  DetailDrawer,
  FormDrawer,
  FormField,
  StatusPill,
  toArray,
  type Column,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/custom/search-select";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../../permissions";
import { formatMoney } from "@/utils/money";
import {
  useCreateCategoryMutation,
  useGetCategoriesQuery,
  useGetCategoryInsightsQuery,
  useGetCategoryQuery,
  useUpdateCategoryMutation,
} from "@/redux/services/procurement/procurement-api";
import type {
  VendorCategory,
  VendorCategoryInsight,
} from "@/redux/services/procurement/procurement-types";

const STATUS_TABS = [["All", "all"], ["Active", "active"], ["Inactive", "inactive"]] as const;
const DETAIL_TABS = [
  ["Overview", "overview", Info],
  ["Usage", "usage", Users],
  ["Spend", "spend", ChartNoAxesCombined],
] as const;

function isForbidden(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><dt className="font-mont text-[11px] text-gray-05">{label}</dt><dd className="mt-1 break-words font-mont text-sm font-semibold tabular-nums text-black-01">{value ?? "-"}</dd></div>;
}

function RestrictedPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{children}</div>;
}

function hierarchyRows(rows: VendorCategory[]) {
  const present = new Set(rows.map((category) => category.id));
  const children = new Map<number | null, VendorCategory[]>();
  for (const category of rows) {
    const parent = category.parent_id != null && present.has(category.parent_id) ? category.parent_id : null;
    children.set(parent, [...(children.get(parent) || []), category]);
  }
  for (const group of children.values()) group.sort((a, b) => a.code.localeCompare(b.code));
  const ordered: VendorCategory[] = [];
  const visited = new Set<number>();
  const visit = (parent: number | null) => {
    for (const category of children.get(parent) || []) {
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      ordered.push(category);
      visit(category.id);
    }
  };
  visit(null);
  // Fail visibly for legacy orphan/cycle data instead of silently dropping master rows.
  for (const category of rows) {
    if (visited.has(category.id)) continue;
    visited.add(category.id);
    ordered.push(category);
    visit(category.id);
  }
  return ordered;
}

export function CategoriesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const canReports = can(P.PROC_VIEW_PROC_REPORTS);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number][1]>("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", can(P.PROC_CREATE_CATEGORY), () => setCreating(true));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => ({
    entity,
    page,
    page_size: 100,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(status === "active" ? { is_active: true } : {}),
    ...(status === "inactive" ? { is_active: false } : {}),
  }), [entity, page, debouncedSearch, status]);
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetCategoriesQuery(params);
  const { data: insightResponse, isLoading: insightLoading, isError: insightError } = useGetCategoryInsightsQuery(
    { entity }, { skip: !canReports },
  );
  const insightMap = useMemo(() => new Map(
    toArray(insightResponse?.data).map((insight) => [insight.category_id, insight]),
  ), [insightResponse]);
  const rows = hierarchyRows(toArray(data?.data));
  const spend = (category: VendorCategory) => {
    if (!canReports) return "Restricted";
    if (insightLoading) return "…";
    if (insightError) return "Unavailable";
    return formatMoney(insightMap.get(category.id)?.spend_mtd ?? 0, currency);
  };
  const columns: Column<VendorCategory>[] = [
    { header: "Category", cell: (category) => <CategoryIdentity category={category} /> },
    { header: "Code", cell: (category) => <span className="font-semibold text-primary">{category.code}</span> },
    { header: "Level", cell: (category) => <span className="whitespace-nowrap">Level {category.level}</span> },
    { header: "Parent", cell: (category) => category.parent_name || "Root" },
    { header: "Default expense", cell: (category) => category.default_expense_code || "-" },
    { header: "Vendors", align: "right", cell: (category) => <span className="tabular-nums">{category.vendor_count ?? 0}</span> },
    { header: "Spend MTD", align: "right", cell: (category) => <span className="tabular-nums">{spend(category)}</span> },
    { header: "Status", cell: (category) => <StatusPill status={category.is_active ? "ACTIVE" : "INACTIVE"} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  return <>
    <header data-guide="procurement-categories.heading" className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-mont text-lg font-semibold text-gray-01">Categories</h1>
        <p className="mt-0.5 font-mont text-xs text-gray-05">Spend taxonomy and accounting defaults for vendor purchasing.</p>
      </div>
      <Can permission={P.PROC_CREATE_CATEGORY}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> New Category</Button></Can>
    </header>

    <section data-guide="procurement-categories.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
        <div className="max-w-full overflow-x-auto"><div className="flex min-w-max gap-5">{STATUS_TABS.map(([label, value]) => <button key={value} type="button" onClick={() => { setStatus(value); setPage(1); }} className={cn("border-b-2 py-3 font-mont text-xs font-medium whitespace-nowrap", status === value ? "border-primary text-primary" : "border-transparent text-gray-05")}>{label}</button>)}</div></div>
        <label className="relative my-2 min-w-0 basis-full sm:min-w-52 sm:flex-1 sm:basis-auto sm:max-w-72"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search categories" className="h-9 bg-white pl-9" /></label>
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(category) => category.id}
        loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch}
        onRowClick={(category) => setSelectedId(category.id)}
        page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage}
        emptyTitle="No categories found"
        emptyMessage={debouncedSearch || status !== "all" ? "Try changing the search or status filter." : "Create the first vendor category for this entity."}
        mobileCard={(category) => <CategoryMobileCard category={category} spend={spend(category)} />}
        cardBreakpoint="lg"
      />
    </section>

    <CategoryDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} canReports={canReports} insight={selectedId == null ? undefined : insightMap.get(selectedId)} onClose={() => setSelectedId(null)} />
    {creating && <CategoryForm entity={entity} onClose={() => setCreating(false)} />}
  </>;
}

function CategoryIdentity({ category }: { category: VendorCategory }) {
  return <div className="flex min-w-44 items-center gap-3" style={{ paddingLeft: `${(category.level - 1) * 20}px` }}><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Tags className="size-4" /></span><div className="min-w-0"><p className="truncate font-mont text-sm font-semibold text-black-01">{category.name}</p><p className="mt-0.5 font-mont text-[11px] text-gray-05">{category.vendor_count ?? 0} linked vendor{category.vendor_count === 1 ? "" : "s"} · Level {category.level}</p></div></div>;
}

function CategoryMobileCard({ category, spend }: { category: VendorCategory; spend: string }) {
  return <div className="space-y-3"><CategoryIdentity category={category} /><div className="flex flex-wrap gap-1"><StatusPill status={category.is_active ? "ACTIVE" : "INACTIVE"} /></div><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-[11px] text-gray-05">Code</p><p className="mt-1 font-semibold text-primary">{category.code}</p></div><div><p className="text-[11px] text-gray-05">Parent</p><p className="mt-1 font-medium">{category.parent_name || "Root"}</p></div><div><p className="text-[11px] text-gray-05">Default expense</p><p className="mt-1 font-medium">{category.default_expense_code || "-"}</p></div><div><p className="text-[11px] text-gray-05">Spend MTD</p><p className="mt-1 font-medium tabular-nums">{spend}</p></div></div></div>;
}

function CategoryDrawer({ id, entity, currency, canReports, insight, onClose }: { id: number | null; entity: string; currency?: string | null; canReports: boolean; insight?: VendorCategoryInsight; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useGetCategoryQuery(
    { id: id!, entity }, { skip: id == null },
  );
  const category = data?.data;
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number][1]>("overview");
  const [editing, setEditing] = useState(false);
  return <>
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} title={category?.name || "Category"} description={category ? `${category.code} · ${category.default_expense_code || "No default expense account"}` : "Loading category"} widthClass="sm:max-w-[640px]" footer={category && <Can permission={P.PROC_UPDATE_CATEGORY}><Button variant="outline" onClick={() => setEditing(true)}>Edit Category</Button></Can>}>
      {isLoading ? <RestrictedPanel>Loading category…</RestrictedPanel> : isForbidden(error) ? <RestrictedPanel>You do not have permission to view this category.</RestrictedPanel> : isError || !category ? <RestrictedPanel><button type="button" className="text-primary" onClick={() => refetch()}>Category could not be loaded. Try again.</button></RestrictedPanel> : <div className="space-y-5">
        <div className="max-w-full overflow-x-auto border-b border-white-02"><div className="flex min-w-max gap-5">{DETAIL_TABS.map(([label, value, Icon]) => <button key={value} type="button" onClick={() => setTab(value)} className={cn("flex items-center gap-1.5 border-b-2 py-3 font-mont text-xs font-medium whitespace-nowrap", tab === value ? "border-primary text-primary" : "border-transparent text-gray-05")}><Icon className="size-3.5" />{label}</button>)}</div></div>
        {tab === "overview" && <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Category name" value={category.name} /><Field label="Code" value={category.code} /><Field label="Level" value={`Level ${category.level}`} /><Field label="Parent category" value={category.parent_name || "Root category"} /><Field label="Default expense account" value={category.default_expense_code || "Not configured"} /><Field label="Status" value={<StatusPill status={category.is_active ? "ACTIVE" : "INACTIVE"} />} /></dl>}
        {tab === "usage" && <div className="space-y-4"><dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Linked vendors" value={category.vendor_count ?? 0} /><Field label="Direct sub-categories" value={category.child_count ?? 0} /><Field label="Catalog items" value={category.catalog_item_count ?? 0} /><Field label="Hierarchy position" value={category.parent_name ? `${category.parent_name} · Level ${category.level}` : "Root · Level 1"} /><Field label="Assignment state" value={category.is_active ? "Available for new vendors" : "Historical links only"} /></dl><p className="rounded-md border border-dashed border-white-02 p-4 font-mont text-xs leading-5 text-gray-05">The hierarchy supports three levels. Catalog items counts reflect items assigned directly to this category, not its sub-categories.</p></div>}
        {tab === "spend" && (!canReports ? <RestrictedPanel>Category spend requires Procurement report access.</RestrictedPanel> : <div className="space-y-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><SpendCard label="This month" value={formatMoney(insight?.spend_mtd ?? 0, currency)} /><SpendCard label="Last month" value={formatMoney(insight?.spend_prior_month ?? 0, currency)} /><SpendCard label="Year to date" value={formatMoney(insight?.spend_ytd ?? 0, currency)} /></div><p className="font-mont text-xs text-gray-05">Realised spend is sourced only from posted vendor invoices for vendors currently linked to this category.</p></div>)}
      </div>}
    </DetailDrawer>
    {editing && category && <CategoryForm entity={entity} initial={category} onClose={() => setEditing(false)} />}
  </>;
}

function SpendCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-white-02 p-3"><p className="font-mont text-[11px] text-gray-05">{label}</p><p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value}</p></div>;
}

function CategoryForm({ entity, initial, onClose }: { entity: string; initial?: VendorCategory; onClose: () => void }) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [parent, setParent] = useState(initial?.parent_id ? String(initial.parent_id) : "");
  const [expense, setExpense] = useState(initial?.default_expense_code || "");
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [create, { isLoading: creating }] = useCreateCategoryMutation();
  const [update, { isLoading: updating }] = useUpdateCategoryMutation();
  const { data: categoryResponse, isLoading: categoriesLoading } = useGetCategoriesQuery({ entity, page_size: 100 });
  const allCategories = toArray(categoryResponse?.data);
  const parentOptions = useMemo(() => allCategories.filter((candidate) => {
    if (candidate.level >= 3 || candidate.id === initial?.id) return false;
    if (active && !candidate.is_active && String(candidate.id) !== parent) return false;
    let node: VendorCategory | undefined = candidate;
    const seen = new Set<number>();
    while (node?.parent_id) {
      if (node.parent_id === initial?.id || seen.has(node.parent_id)) return false;
      seen.add(node.parent_id);
      node = allCategories.find((item) => item.id === node?.parent_id);
    }
    return true;
  }).map((candidate) => ({
    value: String(candidate.id),
    label: `${"- ".repeat(candidate.level - 1)}${candidate.code} · ${candidate.name} (Level ${candidate.level})`,
  })), [active, allCategories, initial?.id, parent]);
  const selectedParent = allCategories.find((category) => String(category.id) === parent);
  const derivedLevel = selectedParent ? selectedParent.level + 1 : 1;
  const current = JSON.stringify({ name, parent, expense, active });
  const baseline = JSON.stringify({ name: initial?.name || "", parent: initial?.parent_id ? String(initial.parent_id) : "", expense: initial?.default_expense_code || "", active: initial?.is_active ?? true });
  const valid = !!code.trim() && code.trim().length <= 32 && !!name.trim() && name.trim().length <= 160;
  const canSubmit = valid && (!initial || current !== baseline);
  const save = async () => {
    try {
      const result = initial
        ? await update({ id: initial.id, entity, name: name.trim(), parent, default_expense_account: expense, is_active: active }).unwrap()
        : await create({ entity, code: code.trim(), name: name.trim(), parent: parent || undefined, default_expense_account: expense || undefined, is_active: active }).unwrap();
      toast.success(result.message || (initial ? "Category updated." : "Category created."));
      onClose();
    } catch { /* central API handler renders validation errors */ }
  };
  return <FormDrawer open onOpenChange={(open) => !open && onClose()} title={initial ? `Edit ${initial.name}` : "New Category"} description={initial ? "Update hierarchy and purchasing defaults without rewriting historical documents." : "Add a vendor spend category at one of three supported levels."} onSubmit={save} submitText={initial ? "Save Changes" : "Create Category"} loading={creating || updating} canSubmit={canSubmit} widthClass="sm:max-w-[560px]">
    <section className="space-y-3"><div className="flex items-center gap-2"><Tags className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Category</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Category code" required><Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} disabled={!!initial} maxLength={32} className="bg-white font-mont uppercase" /></FormField><FormField label="Category name" required><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} className="bg-white" /></FormField></div><FormField label="Parent category"><SearchSelect options={parentOptions} value={parent} onChange={(event) => setParent(event.target.value)} loading={categoriesLoading} placeholder="No parent · Level 1" /></FormField><p className="font-mont text-xs leading-5 text-gray-05">This category will be Level {derivedLevel}. Level 3 is the deepest supported level.</p></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><ChartNoAxesCombined className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Accounting default</p></div><FormField label="Default expense account"><AccountPicker entity={entity} value={expense} onChange={setExpense} accountType="EXPENSE" postableOnly placeholder="No category default" /></FormField><p className="font-mont text-xs leading-5 text-gray-05">Used only when a purchasing line and vendor do not already provide an expense account.</p></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><Users className="size-4 text-primary" /><p className="font-mont text-xs font-semibold text-black-01">Governance</p></div><label className="flex items-center gap-2 font-mont text-sm"><input type="checkbox" checked={active} onChange={(event) => { const next = event.target.checked; setActive(next); if (next && selectedParent && !selectedParent.is_active) setParent(""); }} /> Active</label><p className="font-mont text-xs leading-5 text-gray-05">Inactive categories remain on historical vendor records but cannot be assigned or seed new purchasing defaults. Active children require an active parent.</p></section>
  </FormDrawer>;
}
