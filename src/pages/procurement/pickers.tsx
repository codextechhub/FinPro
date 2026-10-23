/**
 * Procurement-scoped reference pickers over SearchSelect, kept in the
 * procurement feature so finance-ui does not import procurement.
 *
 * Vendors, requisitions, RFQs, purchase orders and catalogue items grow with
 * use, so their pickers search on the server as the reader types and look up
 * the chosen row on its own when the current page does not hold it
 * (finance-ui/searched-list.ts). Categories and stores are short, closed lists
 * and render populated.
 */

import { useState } from "react";
import { SearchSelect } from "@/components/custom/search-select";
import { toArray, useListSearch, useVendorByCode, withChosen } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../permissions";
import { completeFreeLineIds, requisitionSourcing, requisitionSourcingFilter, sourcingNote, type SourcingPurpose } from "./requisition-sourcing";
import { useGetVendorsQuery, useGetCategoriesQuery, useGetRequisitionsQuery, useGetRequisitionQuery, useGetPurchaseOrdersQuery, useGetPurchaseOrderQuery, useGetCatalogItemsQuery, useGetCatalogItemQuery, type ProcListScope } from "@/redux/services/procurement/procurement-api";
import { useGetRfqsQuery, useGetRfqQuery, useGetContractsQuery, useGetFreeRequisitionLinesQuery, useGetStockTransferDestinationsQuery } from "@/redux/services/procurement/procurement-ext-api";
import type { CatalogItem, StockLocation, StockTransferDestination, Vendor, VendorCategory } from "@/redux/services/procurement/procurement-types";

const adapt = (onChange: (v: string) => void) =>
  (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value);

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

/** Whether a vendor may take a new commitment (an order, a contract, an RFQ invitation). */
export const vendorAvailable = (v: Vendor) => v.is_active && !v.on_hold && v.kyc_status !== "REJECTED";

/**
 * A vendor, searched on the server. With `purchaseEligible` only vendors that
 * may take a new commitment are offered, though a chosen one that may not
 * stays on the list, marked, so an edit never silently drops it. Reports the
 * vendor's row beside its code, for a form that takes defaults from it.
 */
export function VendorPicker({ entity, value, onChange, label, placeholder = "Select vendor", isRequired, disabled, purchaseEligible = false }: { entity: string; value: string; onChange: (code: string, vendor?: Vendor) => void; label?: string; placeholder?: string; isRequired?: boolean; disabled?: boolean; purchaseEligible?: boolean }) {
  const { onSearchChange, searchArg } = useListSearch();
  const { data, isLoading } = useGetVendorsQuery({ entity, ...searchArg });
  const rows = toArray(data?.data);
  const chosen = useVendorByCode(entity, value, rows);
  const all = withChosen(rows.filter((v) => !purchaseEligible || vendorAvailable(v)), chosen, (v) => v.code);
  const options = all.map((v) => ({
      value: v.code,
      label: `${v.code} - ${v.name}${vendorAvailable(v) ? "" : " (Unavailable for new commitments)"}`,
    }));
  const choose = (code: string) => onChange(code, all.find((v) => v.code === code));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(choose)} onSearchChange={onSearchChange} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} revealOnSearch />;
}

export function CategoryPicker({ entity, value, onChange, label, placeholder = "No category" }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const { data, isLoading } = useGetCategoriesQuery({ entity, page_size: 100 });
  // Active rows are assignable; preserve a selected inactive legacy link so an
  // unrelated vendor edit does not silently clear or rewrite history.
  const options = categoryTree(toArray(data?.data))
    .filter((category) => category.is_active || category.code === value)
    .map((category) => ({
      value: category.code,
      label: `${"- ".repeat(category.level - 1)}${category.code} - ${category.name} · L${category.level}${category.is_active ? "" : " (Inactive)"}`,
    }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} />;
}

/**
 * An approved requisition to raise an RFQ or an order from.
 *
 * With `sourcing`, the server leaves out what is already taken: an RFQ is
 * offered requisitions with at least one line no live RFQ or order holds
 * (`has_free_lines`), an order only those whose every line is free
 * (`all_lines_free`), since an order takes the whole requisition. The list is
 * asked again each time the picker opens, so a requisition just put on an RFQ
 * is not offered a second time. A reader without the requisition view key
 * is not asked for the list at all, rather than meeting a refusal.
 *
 * A requisition an RFQ is offered may still have some lines held elsewhere.
 * Once one is chosen, a reader who may view RFQs reads which (from the server's
 * free lines of that requisition) before saving, and the server's refusal on
 * save stays the last word.
 */
export function RequisitionPicker({ entity, value, onChange, label, placeholder = "Select requisition", isRequired, status, sourcing }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string; isRequired?: boolean; status?: string; sourcing?: SourcingPurpose }) {
  const { can } = useCan();
  const mayList = can(P.PROC_VIEW_REQUISITIONS);
  const { onSearchChange, searchArg } = useListSearch();
  const { data, isLoading } = useGetRequisitionsQuery(
    { entity, ...(status ? { status } : {}), ...requisitionSourcingFilter(sourcing), ...searchArg },
    { refetchOnMountOrArgChange: !!sourcing, skip: !mayList },
  );
  const canAsk = can(P.PROC_VIEW_RFQS) && sourcing === "rfq";
  const { data: chosenFree } = useGetFreeRequisitionLinesQuery({ entity, page_size: 100, requisition: Number(value) }, { skip: !canAsk || !value });
  const listed = toArray(data?.data);
  const onPage = listed.find((r) => String(r.id) === value);
  const { data: chosenData } = useGetRequisitionQuery({ id: Number(value), entity }, { skip: !mayList || !value || !!onPage });
  const chosen = onPage ?? (chosenData?.data && String(chosenData.data.id) === value ? chosenData.data : undefined);
  const rows = withChosen(listed, chosen, (r) => String(r.id));
  const options = rows.map((r) => ({ value: String(r.id), label: `${r.document_number}${r.title ? ` - ${r.title}` : ""} (${r.status})` }));
  const chosenIds = completeFreeLineIds(chosenFree?.data ? toArray(chosenFree.data) : undefined, chosenFree?.pagination?.totalItems);
  const note = sourcing && chosen && chosenIds
    ? sourcingNote(requisitionSourcing(chosen.lines.map((line) => line.id), chosenIds), sourcing, chosen.document_number)
    : null;
  return <>
    <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} onSearchChange={onSearchChange} loading={isLoading} placeholder={placeholder} isRequired={isRequired} revealOnSearch />
    {note ? <p role="status" className="mt-1 font-mont text-[11px] leading-5 text-amber-700">{note}</p> : null}
  </>;
}

/**
 * An RFQ, searched on the server by number or title. `status` scopes the list
 * (quotation capture offers only ISSUED RFQs), `branch` follows a list
 * screen's branch lens, and `placeholder` doubles as the "all RFQs" wording
 * when the picker is a filter.
 */
export function RfqPicker({ entity, value, onChange, label, placeholder = "Select RFQ", isRequired, status, branch }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string; isRequired?: boolean; status?: string; branch?: ProcListScope["branch"] }) {
  const { onSearchChange, searchArg } = useListSearch();
  const { data, isLoading } = useGetRfqsQuery({ entity, ...(status ? { status } : {}), ...(branch != null ? { branch } : {}), ...searchArg });
  const listed = toArray(data?.data);
  const onPage = listed.find((r) => String(r.id) === value);
  const { data: chosenData } = useGetRfqQuery({ id: Number(value), entity }, { skip: !value || !!onPage });
  const chosen = onPage ?? (chosenData?.data && String(chosenData.data.id) === value ? chosenData.data : undefined);
  const options = withChosen<{ id: number; document_number: string; title?: string | null }>(listed, chosen, (r) => String(r.id))
    .map((r) => ({ value: String(r.id), label: `${r.document_number} - ${r.title || "Untitled"}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} onSearchChange={onSearchChange} loading={isLoading} placeholder={placeholder} isRequired={isRequired} revealOnSearch />;
}

/** A purchase order, searched on the server by number, vendor or requisition. */
export function PurchaseOrderPicker({ entity, value, onChange, label, placeholder = "No PO" }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const { onSearchChange, searchArg } = useListSearch();
  const { data, isLoading } = useGetPurchaseOrdersQuery({ entity, ...searchArg });
  const listed = toArray(data?.data);
  const onPage = listed.find((o) => String(o.id) === value);
  const { data: chosenData } = useGetPurchaseOrderQuery({ id: Number(value), entity }, { skip: !value || !!onPage });
  const chosen = onPage ?? (chosenData?.data && String(chosenData.data.id) === value ? chosenData.data : undefined);
  const options = withChosen<{ id: number; document_number: string; vendor_code: string }>(listed, chosen, (o) => String(o.id))
    .map((o) => ({ value: String(o.id), label: `${o.document_number} - ${o.vendor_code}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} onSearchChange={onSearchChange} loading={isLoading} placeholder={placeholder} revealOnSearch />;
}

/**
 * A catalogue item for a requisition line, searched on the server by code or
 * name. Reports the id and the item's row, so the line can take its
 * description, unit and standard price at the moment it is chosen.
 */
export function CatalogItemPicker({ entity, value, onChange, placeholder = "Catalog item (optional)" }: { entity: string; value: string; onChange: (id: string, item?: CatalogItem) => void; placeholder?: string }) {
  const { onSearchChange, searchArg } = useListSearch();
  const { data, isLoading } = useGetCatalogItemsQuery({ entity, ...searchArg });
  const listed = toArray(data?.data);
  const onPage = listed.find((item) => String(item.id) === value);
  const { data: chosenData } = useGetCatalogItemQuery({ id: Number(value), entity }, { skip: !value || !!onPage });
  const chosen = onPage ?? (chosenData?.data && String(chosenData.data.id) === value ? chosenData.data : undefined);
  const rows = withChosen(listed, chosen, (item) => String(item.id));
  const options = rows.map((item) => ({ value: String(item.id), label: `${item.code} - ${item.name}` }));
  const choose = (id: string) => onChange(id, rows.find((item) => String(item.id) === id));
  return <SearchSelect options={options} value={value} onChange={adapt(choose)} onSearchChange={onSearchChange} loading={isLoading} placeholder={placeholder} revealOnSearch />;
}

// A PO's optional call-off link - only the selected vendor's ACTIVE contracts are
// eligible (matching the backend rule). Empty option lets the buyer raise an
// unlinked PO. Disabled until a vendor is chosen.
export function ContractPicker({ entity, vendor, value, onChange, label, placeholder = "No contract (unlinked)" }: { entity: string; vendor: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const { data, isLoading } = useGetContractsQuery({ entity, vendor, status: "ACTIVE" }, { skip: !vendor });
  const options = toArray(data?.data).map((c) => ({ value: String(c.id), label: `${c.reference} - ${c.title}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={vendor ? placeholder : "Select a vendor first"} disabled={!vendor} revealOnSearch />;
}

// Where a movement draws from or lands. Short, closed list, so it renders populated
// rather than reveal-on-search. Callers must only mount this when the entity has
// more than one active location - see useStockLocations.
export function StockLocationPicker({ locations, value, onChange, label, placeholder = "Select location", isRequired, disabled, loading }: { locations: StockLocation[]; value: string; onChange: (v: string) => void; label?: string; placeholder?: string; isRequired?: boolean; disabled?: boolean; loading?: boolean }) {
  const options = locations.map((l) => ({
    value: String(l.id),
    label: `${l.code} - ${l.name}${l.branch_name ? ` · ${l.branch_name}` : ""}${l.is_default ? " (default)" : ""}`,
  }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={loading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

/** "LEK-MAIN - Lekki main store · Lekki Branch", the branch named only when the stores span several. */
export function destinationLabel(row: StockTransferDestination, showBranch: boolean): string {
  return `${row.code} - ${row.name}${showBranch && row.branch_name ? ` · ${row.branch_name}` : ""}`;
}

/**
 * The receiving store of a stock transfer, from every live store of the books.
 *
 * A storekeeper lists only their own branch's stores, yet a transfer may send
 * goods to any branch's. The server's transfer-destination list names them
 * all (code, name and branch, never stock figures), searched on the server as
 * the reader types, so nobody has to know another branch's store code. The
 * sending store (`exclude`) is left out. The chosen store stays on the list
 * while the search moves on, so its name never drops out of the field.
 */
export function StockTransferDestinationPicker({ entity, value, onChange, exclude, label, isRequired }: {
  entity: string;
  value: string;
  onChange: (id: string, row: StockTransferDestination | null) => void;
  exclude?: string;
  label?: string;
  isRequired?: boolean;
}) {
  const { onSearchChange, searchArg } = useListSearch();
  const [picked, setPicked] = useState<StockTransferDestination | null>(null);
  const { data, isLoading } = useGetStockTransferDestinationsQuery({ entity, page_size: 50, ...searchArg });
  const listed = toArray(data?.data);
  const rows = listed.filter((r) => String(r.id) !== exclude);
  const all = picked && String(picked.id) === value && !rows.some((r) => r.id === picked.id) ? [picked, ...rows] : rows;
  // Once the stores have been seen to span several branches, keep naming them while a search narrows the list.
  const [manyBranches, setManyBranches] = useState(false);
  if (!manyBranches && new Set(listed.map((r) => r.branch_id)).size > 1) setManyBranches(true);
  const showBranch = manyBranches;
  const options = all.map((r) => ({ value: String(r.id), label: destinationLabel(r, showBranch) }));
  const choose = (id: string) => {
    const row = all.find((r) => String(r.id) === id) ?? null;
    setPicked(row);
    onChange(id, row);
  };
  return (
    <SearchSelect
      label={label} options={options} value={value} onChange={adapt(choose)} onSearchChange={onSearchChange}
      loading={isLoading} placeholder="Search stores by code or name" isRequired={isRequired}
    />
  );
}
