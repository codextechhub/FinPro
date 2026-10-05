/**
 * Ikeja's storekeeper sends exercise books to Lekki's store, which Ikeja does
 * not run. The receiving store is picked from every live store of the books,
 * named with its branch, never typed as a code, and the sending store is not
 * offered as its own destination.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ destinations: vi.fn(), select: vi.fn() }));

vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useGetStockTransferDestinationsQuery: (args: unknown) => mocks.destinations(args),
  useGetRfqsQuery: () => ({ data: undefined }),
  useGetContractsQuery: () => ({ data: undefined }),
}));
vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetVendorsQuery: () => ({ data: undefined }),
  useGetCategoriesQuery: () => ({ data: undefined }),
  useGetRequisitionsQuery: () => ({ data: undefined }),
  useGetPurchaseOrdersQuery: () => ({ data: undefined }),
}));
vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: (props: { options: { value: string; label: string }[]; onChange: (e: { target: { value: string } }) => void }) => {
    mocks.select(props);
    return (
      <select aria-label="To store" onChange={(e) => props.onChange({ target: { value: e.target.value } })}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  },
}));

import { StockTransferDestinationPicker, destinationLabel } from "./pickers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IKEJA = { id: 1, code: "IKJ-MAIN", name: "Ikeja main store", branch_id: 1, branch_name: "Ikeja Branch" };
const LEKKI = { id: 2, code: "LEK-MAIN", name: "Lekki main store", branch_id: 2, branch_name: "Lekki Branch" };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.destinations.mockReset();
  mocks.select.mockReset();
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
