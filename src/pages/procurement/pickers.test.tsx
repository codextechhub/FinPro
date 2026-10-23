/**
 * Ikeja's storekeeper sends exercise books to Lekki's store, which Ikeja does
 * not run. The receiving store is picked from every live store of the books,
 * named with its branch, never typed as a code, and the sending store is not
 * offered as its own destination.
 *
 * The requisition pickers ask the server for what is still free: an RFQ
 * for requisitions with a free line, an order for those whose every line is
 * free. A buyer who picks PR-0004 for an RFQ, whose chairs already sit on
 * RFQ-0007, reads that some of its lines are held before saving.
 *
 * The lists that grow with use are searched on the server. A buyer at a school
 * with 140 vendors types "Prime" and the server is asked for it, rather than
 * the first page being filtered in the browser. A requisition or catalogue item
 * the form opens with, but which is not on the page the server sent, is read on
 * its own so its field still names it.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destinations: vi.fn(), select: vi.fn(), free: vi.fn(), requisitionArgs: vi.fn(), requisitions: undefined as unknown, held: new Set<string>(), vendors: undefined as unknown,
  vendorArgs: [] as Record<string, unknown>[], requisition: vi.fn(), catalog: undefined as unknown, catalogItem: vi.fn(),
}));

vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useGetStockTransferDestinationsQuery: (args: unknown) => mocks.destinations(args),
  useGetRfqsQuery: () => ({ data: undefined }),
  useGetRfqQuery: () => ({ data: undefined }),
  useGetContractsQuery: () => ({ data: undefined }),
  useGetFreeRequisitionLinesQuery: (args: unknown, options: { skip?: boolean }) => mocks.free(args, options),
}));
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetVendorsQuery: (args: Record<string, unknown>, options?: { skip?: boolean }) => {
    if (!options?.skip) mocks.vendorArgs.push(args);
    return { data: mocks.vendors, isLoading: false };
  },
  useGetCategoriesQuery: () => ({ data: undefined }),
  useGetRequisitionsQuery: (args: unknown, options: unknown) => { mocks.requisitionArgs(args, options); return { data: mocks.requisitions }; },
  useGetRequisitionQuery: (args: unknown, options: { skip?: boolean }) => mocks.requisition(args, options) ?? { data: undefined },
  useGetPurchaseOrdersQuery: () => ({ data: undefined }),
  useGetPurchaseOrderQuery: () => ({ data: undefined }),
  useGetCatalogItemsQuery: () => ({ data: mocks.catalog, isLoading: false }),
  useGetCatalogItemQuery: (args: unknown, options: { skip?: boolean }) => mocks.catalogItem(args, options) ?? { data: undefined },
}));
vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: (props: { options: { value: string; label: string }[]; onChange: (e: { target: { value: string } }) => void; onSearchChange?: (query: string) => void }) => {
    mocks.select(props);
    return (
      <select aria-label="To store" onChange={(e) => props.onChange({ target: { value: e.target.value } })}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  },
}));

import { P } from "../../permissions";
import { CatalogItemPicker, RequisitionPicker, StockTransferDestinationPicker, VendorPicker, destinationLabel } from "./pickers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IKEJA = { id: 1, code: "IKJ-MAIN", name: "Ikeja main store", branch_id: 1, branch_name: "Ikeja Branch" };
const LEKKI = { id: 2, code: "LEK-MAIN", name: "Lekki main store", branch_id: 2, branch_name: "Lekki Branch" };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.destinations.mockReset();
  mocks.select.mockReset();
  mocks.requisition.mockReset();
  mocks.catalogItem.mockReset();
  mocks.vendorArgs = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the receiving store of a transfer", () => {
  it("offers every other branch's store by name and branch, never the sending store", () => {
    mocks.destinations.mockReturnValue({ data: { data: [IKEJA, LEKKI, { ...LEKKI, id: 3, code: "LEK-ANNEX", name: "Lekki annex" }] }, isFetching: false });
    const onChange = vi.fn();
    act(() => root.render(<StockTransferDestinationPicker entity="BSS" value="" onChange={onChange} exclude="1" />));

    expect(mocks.destinations).toHaveBeenCalledWith({ entity: "BSS", page_size: 50 });
    const labels = mocks.select.mock.lastCall?.[0].options.map((o: { label: string }) => o.label);
    expect(labels).toEqual(["LEK-MAIN - Lekki main store · Lekki Branch", "LEK-ANNEX - Lekki annex · Lekki Branch"]);

    const select = container.querySelector("select")!;
    act(() => {
      select.value = "2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("2", LEKKI);
  });

  it("leaves the branch out where every store is one branch's", () => {
    expect(destinationLabel(LEKKI, false)).toBe("LEK-MAIN - Lekki main store");
    mocks.destinations.mockReturnValue({ data: { data: [IKEJA, { ...IKEJA, id: 4, code: "IKJ-LAB", name: "Lab store" }] }, isFetching: false });
    act(() => root.render(<StockTransferDestinationPicker entity="BSS" value="" onChange={vi.fn()} exclude="1" />));
    expect(mocks.select.mock.lastCall?.[0].options.map((o: { label: string }) => o.label)).toEqual(["IKJ-LAB - Lab store"]);
  });
});

describe("the requisition an order or RFQ is raised from", () => {
  const requisition = (id: number, number: string, lineIds: number[]) => ({ id, document_number: number, status: "APPROVED", lines: lineIds.map((lineId) => ({ id: lineId })) });

  beforeEach(() => {
    mocks.free.mockReset();
    mocks.requisitionArgs.mockReset();
    mocks.requisitions = { data: [requisition(4, "PR-0004", [501, 502]), requisition(5, "PR-0005", [601])] };
    mocks.free.mockImplementation((_args: unknown, options: { skip?: boolean }) => (
      options?.skip ? { data: undefined } : { data: { data: [{ id: 502 }], pagination: { totalItems: 1 } } }
    ));
  });

  it("offers an order only requisitions whose every line is free, asked afresh each time", () => {
    mocks.held = new Set([P.PROC_VIEW_RFQS, P.PROC_VIEW_REQUISITIONS]);
    act(() => root.render(<RequisitionPicker entity="BSS" value="" onChange={vi.fn()} status="APPROVED" sourcing="order" />));
    expect(mocks.requisitionArgs).toHaveBeenLastCalledWith(
      { entity: "BSS", status: "APPROVED", all_lines_free: "true" }, { refetchOnMountOrArgChange: true, skip: false },
    );
    expect(mocks.free.mock.calls.every(([, options]) => options?.skip)).toBe(true);
  });

  it("offers an RFQ requisitions with a free line, and says which of the chosen one's lines are held", () => {
    mocks.held = new Set([P.PROC_VIEW_RFQS, P.PROC_VIEW_REQUISITIONS]);
    act(() => root.render(<RequisitionPicker entity="BSS" value="4" onChange={vi.fn()} status="APPROVED" sourcing="rfq" />));
    expect(mocks.requisitionArgs).toHaveBeenLastCalledWith(
      { entity: "BSS", status: "APPROVED", has_free_lines: "true" }, { refetchOnMountOrArgChange: true, skip: false },
    );
    expect(mocks.free).toHaveBeenLastCalledWith({ entity: "BSS", page_size: 100, requisition: 4 }, { skip: false });
    expect(container.textContent).toContain("Some lines of PR-0004 are already on an RFQ or purchase order. Remove them from this RFQ before you save.");
  });

  it("asks nothing about free lines of a reader who may not view RFQs", () => {
    mocks.held = new Set([P.PROC_VIEW_REQUISITIONS]);
    act(() => root.render(<RequisitionPicker entity="BSS" value="4" onChange={vi.fn()} status="APPROVED" sourcing="rfq" />));
    expect(mocks.free.mock.calls.every(([, options]) => options?.skip)).toBe(true);
    expect(container.textContent).not.toContain("already on an RFQ");
  });

  it("leaves the plain list alone without a purpose", () => {
    mocks.held = new Set([P.PROC_VIEW_REQUISITIONS]);
    act(() => root.render(<RequisitionPicker entity="BSS" value="" onChange={vi.fn()} status="APPROVED" />));
    expect(mocks.requisitionArgs).toHaveBeenLastCalledWith({ entity: "BSS", status: "APPROVED" }, { refetchOnMountOrArgChange: false, skip: false });
  });

  it("reads a chosen requisition the page does not hold on its own, and names it", () => {
    mocks.held = new Set([P.PROC_VIEW_REQUISITIONS]);
    mocks.requisition.mockImplementation((_args: unknown, options: { skip?: boolean }) => (
      options?.skip ? undefined : { data: { data: { ...requisition(9, "PR-0009", [901]), title: "Science lab stools" } } }
    ));
    act(() => root.render(<RequisitionPicker entity="BSS" value="9" onChange={vi.fn()} status="APPROVED" />));
    expect(mocks.requisition).toHaveBeenLastCalledWith({ id: 9, entity: "BSS" }, { skip: false });
    expect([...container.querySelectorAll("option")].map((o) => o.textContent)[0]).toBe("PR-0009 - Science lab stools (APPROVED)");
  });

  it("does not read the chosen requisition again when the page holds it", () => {
    mocks.held = new Set([P.PROC_VIEW_REQUISITIONS]);
    act(() => root.render(<RequisitionPicker entity="BSS" value="4" onChange={vi.fn()} status="APPROVED" />));
    expect(mocks.requisition.mock.calls.every(([, options]) => options?.skip)).toBe(true);
  });

  it("does not ask for requisitions without the key to view them", () => {
    mocks.held = new Set([P.PROC_VIEW_RFQS]);
    act(() => root.render(<RequisitionPicker entity="BSS" value="" onChange={vi.fn()} status="APPROVED" sourcing="order" />));
    expect(mocks.requisitionArgs.mock.lastCall?.[1]).toMatchObject({ skip: true });
  });
});

/**
 * The vendor picker marks a vendor unavailable for new commitments when it is
 * inactive, on hold or KYC-rejected. A role with no switch on the hold or the
 * KYC status is sent vendors without those keys, so it can neither be told nor
 * infer that one is on hold: nothing is marked or filtered on a value it has
 * not been sent.
 */
describe("the vendor picker", () => {
  const ADE = { id: 1, code: "ADE", name: "Ade Stationers", is_active: true, on_hold: false, kyc_status: "VERIFIED" };
  const PRIME = { id: 2, code: "PRIME", name: "Prime Uniforms", is_active: true, on_hold: true, kyc_status: "VERIFIED" };
  const labels = () => [...container.querySelectorAll("option")].map((o) => o.textContent);

  it("marks a vendor on hold, and drops it when only eligible vendors are wanted", () => {
    mocks.vendors = { data: [ADE, PRIME] };
    act(() => root.render(<VendorPicker entity="BSS" value="" onChange={vi.fn()} />));
    expect(labels()).toEqual(["ADE - Ade Stationers", "PRIME - Prime Uniforms (Unavailable for new commitments)"]);
    act(() => root.render(<VendorPicker entity="BSS" value="" onChange={vi.fn()} purchaseEligible />));
    expect(labels()).toEqual(["ADE - Ade Stationers"]);
  });

  it("marks and drops nothing for a role sent vendors without the hold and KYC keys", () => {
    const bare = ({ on_hold: _hold, kyc_status: _kyc, ...rest }: typeof PRIME) => { void [_hold, _kyc]; return rest; };
    mocks.vendors = { data: [bare(ADE as typeof PRIME), bare(PRIME)] };
    act(() => root.render(<VendorPicker entity="BSS" value="" onChange={vi.fn()} purchaseEligible />));
    expect(labels()).toEqual(["ADE - Ade Stationers", "PRIME - Prime Uniforms"]);
  });

  it("asks the server for what the buyer types, after a pause", () => {
    vi.useFakeTimers();
    try {
      mocks.vendors = { data: [ADE] };
      act(() => root.render(<VendorPicker entity="BSS" value="" onChange={vi.fn()} />));
      expect(mocks.vendorArgs.at(-1)).toEqual({ entity: "BSS" });
      act(() => mocks.select.mock.lastCall?.[0].onSearchChange?.("Prime"));
      act(() => { vi.advanceTimersByTime(300); });
      expect(mocks.vendorArgs.at(-1)).toEqual({ entity: "BSS", search: "Prime" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a chosen vendor no longer eligible on the list, and reports the row picked", () => {
    mocks.vendors = { data: [ADE, PRIME] };
    const onChange = vi.fn();
    act(() => root.render(<VendorPicker entity="BSS" value="PRIME" onChange={onChange} purchaseEligible />));
    expect(labels()).toEqual(["PRIME - Prime Uniforms (Unavailable for new commitments)", "ADE - Ade Stationers"]);
    act(() => mocks.select.mock.lastCall?.[0].onChange({ target: { value: "ADE" } }));
    expect(onChange).toHaveBeenLastCalledWith("ADE", ADE);
  });

  it("still marks an inactive vendor, which is not behind a switch", () => {
    const { on_hold: _hold, kyc_status: _kyc, ...rest } = PRIME;
    void [_hold, _kyc];
    mocks.vendors = { data: [{ ...rest, is_active: false }] };
    act(() => root.render(<VendorPicker entity="BSS" value="" onChange={vi.fn()} />));
    expect(labels()).toEqual(["PRIME - Prime Uniforms (Unavailable for new commitments)"]);
  });
});

describe("the catalogue item on a requisition line", () => {
  const PENS = { id: 7, code: "CAT-0007", name: "Blue pens (box)", description: "Box of 50", unit_of_measure: "Box", standard_unit_price: 450000 };

  it("hands the line the item it picked, so it takes the description, unit and price", () => {
    mocks.catalog = { data: [PENS] };
    const onChange = vi.fn();
    act(() => root.render(<CatalogItemPicker entity="BSS" value="" onChange={onChange} />));
    act(() => mocks.select.mock.lastCall?.[0].onChange({ target: { value: "7" } }));
    expect(onChange).toHaveBeenLastCalledWith("7", PENS);
  });

  it("names a saved line's item the page does not hold", () => {
    mocks.catalog = { data: [] };
    mocks.catalogItem.mockImplementation((_args: unknown, options: { skip?: boolean }) => (options?.skip ? undefined : { data: { data: { ...PENS, id: 312, code: "CAT-0312", name: "Lab goggles" } } }));
    act(() => root.render(<CatalogItemPicker entity="BSS" value="312" onChange={vi.fn()} />));
    expect(mocks.catalogItem).toHaveBeenLastCalledWith({ id: 312, entity: "BSS" }, { skip: false });
    expect([...container.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["CAT-0312 - Lab goggles"]);
  });
});
