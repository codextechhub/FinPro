// Procurement-scoped reference pickers (vendor, category) over SearchSelect.
// Kept in the procurement feature so finance-ui doesn't import procurement.

import { useState } from "react";
import { SearchSelect } from "@/components/custom/search-select";
import { toArray } from "@/components/finance-ui";
import { useDebounce } from "@/hooks/use-debounce";
import { useCan } from "@/components/finance-ui/can";
import { P } from "../../permissions";
import { completeFreeLineIds, requisitionSourcing, sourcingMark, sourcingNote, type SourcingPurpose } from "./requisition-sourcing";
import { useGetVendorsQuery, useGetCategoriesQuery, useGetRequisitionsQuery, useGetPurchaseOrdersQuery } from "@/redux/services/procurement/procurement-api";
import { useGetRfqsQuery, useGetContractsQuery, useGetFreeRequisitionLinesQuery, useGetStockTransferDestinationsQuery } from "@/redux/services/procurement/procurement-ext-api";
import type { StockLocation, StockTransferDestination, VendorCategory } from "@/redux/services/procurement/procurement-types";

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

export function VendorPicker({ entity, value, onChange, label, placeholder = "Select vendor", isRequired, disabled, purchaseEligible = false }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string; isRequired?: boolean; disabled?: boolean; purchaseEligible?: boolean }) {
  const { data, isLoading } = useGetVendorsQuery({ entity, page_size: 100 });
  const options = toArray(data?.data)
    .filter((v) => !purchaseEligible || v.code === value || (v.is_active && !v.on_hold && v.kyc_status !== "REJECTED"))
    .map((v) => ({
      value: v.code,
      label: `${v.code} - ${v.name}${v.is_active && !v.on_hold && v.kyc_status !== "REJECTED" ? "" : " (Unavailable for new commitments)"}`,
    }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} revealOnSearch />;
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
 * With `sourcing`, each requisition whose lines another live RFQ or order
 * already holds is marked, and choosing one says why the save will be
 * refused (requisition-sourcing.ts). The marks come from the server's free
 * requisition lines, which only a reader who may view RFQs can ask for;
 * anyone else sees the plain list and meets the server's refusal on save.
 */
export function RequisitionPicker({ entity, value, onChange, label, placeholder = "Select requisition", isRequired, status, sourcing }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string; isRequired?: boolean; status?: string; sourcing?: SourcingPurpose }) {
  const { data, isLoading } = useGetRequisitionsQuery({ entity, page_size: 100, ...(status ? { status } : {}) });
  const canAsk = useCan().can(P.PROC_VIEW_RFQS) && !!sourcing;
  const { data: freeData } = useGetFreeRequisitionLinesQuery({ entity, page_size: 100 }, { skip: !canAsk });
  const { data: chosenFree } = useGetFreeRequisitionLinesQuery({ entity, page_size: 100, requisition: Number(value) }, { skip: !canAsk || !value });
  const listFree = completeFreeLineIds(freeData?.data ? toArray(freeData.data) : undefined, freeData?.pagination?.totalItems);
  const rows = toArray(data?.data);
  const options = rows.map((r) => {
    const mark = listFree ? sourcingMark(requisitionSourcing(r.lines.map((line) => line.id), listFree)) : "";
    return { value: String(r.id), label: `${r.document_number} (${r.status})${mark}` };
  });
  const chosen = rows.find((r) => String(r.id) === value);
  const chosenIds = completeFreeLineIds(chosenFree?.data ? toArray(chosenFree.data) : undefined, chosenFree?.pagination?.totalItems);
  const note = sourcing && chosen && chosenIds
    ? sourcingNote(requisitionSourcing(chosen.lines.map((line) => line.id), chosenIds), sourcing, chosen.document_number)
    : null;
  return <>
    <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} revealOnSearch />
    {note ? <p role="status" className="mt-1 font-mont text-[11px] leading-5 text-amber-700">{note}</p> : null}
  </>;
}

export function RfqPicker({ entity, value, onChange, label, placeholder = "Select RFQ", isRequired, status }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string; isRequired?: boolean; status?: string }) {
  // Quotation capture only makes sense against ISSUED RFQs; pass status to scope the list.
  const { data, isLoading } = useGetRfqsQuery({ entity, ...(status ? { status } : {}) });
  const options = toArray(data?.data).map((r) => ({ value: String(r.id), label: `${r.document_number} - ${r.title || "Untitled"}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} revealOnSearch />;
}

export function PurchaseOrderPicker({ entity, value, onChange, label, placeholder = "No PO" }: { entity: string; value: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const { data, isLoading } = useGetPurchaseOrdersQuery({ entity, page_size: 100 });
  const options = toArray(data?.data).map((o) => ({ value: String(o.id), label: `${o.document_number} - ${o.vendor_code}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} revealOnSearch />;
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
  const [search, setSearch] = useState("");
  const term = useDebounce(search.trim(), 250);
  const [picked, setPicked] = useState<StockTransferDestination | null>(null);
  const { data, isFetching } = useGetStockTransferDestinationsQuery({ entity, page_size: 50, ...(term ? { search: term } : {}) });
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
      label={label} options={options} value={value} onChange={adapt(choose)} onSearchChange={setSearch}
      loading={isFetching} placeholder="Search stores by code or name" isRequired={isRequired}
    />
  );
}
