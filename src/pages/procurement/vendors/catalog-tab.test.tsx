/**
 * A catalogue item has no branch: every branch buys from the same list, so
 * the server takes a new item or an edit only from a reader who covers the
 * whole school. Bright Star's proprietor, holding both keys, is offered New
 * Item and Edit Item. Lekki's buyer holds the same keys but reaches Lekki
 * alone: she reads the catalogue and opens an item, and is offered neither.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ wholeSchool: true, held: new Set<string>() }));
const { item } = vi.hoisted(() => ({
  item: {
    id: 1, code: "PAPER-A4", name: "A4 paper", category_name: "Stationery", unit_of_measure: "ream",
    standard_unit_price: 450000, preferred_vendor_name: null, lead_time_days: 3, stock_status: null, is_active: true,
  },
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/hooks/use-action-param", () => ({ useActionParam: () => undefined }));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));
vi.mock("@/components/custom/search-select", () => ({ SearchSelect: () => null }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DetailDrawer: ({ open, title, footer }: { open: boolean; title: string; footer?: React.ReactNode }) =>
    open ? <div role="dialog"><p>{title}</p>{footer}</div> : null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetCatalogItemsQuery: () => ({ currentData: { data: [item] }, isLoading: false, isFetching: false, isError: false, error: undefined, refetch: vi.fn() }),
  useGetCategoriesQuery: () => ({ data: { data: [] }, isLoading: false }),
  useGetVendorsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useGetCatalogItemQuery: () => ({ data: { data: item }, isLoading: false, isError: false, error: undefined, refetch: vi.fn() }),
  useGetCatalogItemInsightsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useCreateCatalogItemMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateCatalogItemMutation: () => [vi.fn(), { isLoading: false }],
}));

import { P } from "../../../permissions";
import { CatalogTab } from "./catalog-tab";

const KEYS = [P.PROC_VIEW_CATALOG, P.PROC_CREATE_CATALOG_ITEM, P.PROC_UPDATE_CATALOG_ITEM];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.wholeSchool = true;
  mocks.held = new Set(KEYS);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
const clickRow = () => act(() => { (container.querySelector("tbody tr") as HTMLTableRowElement).click(); });

describe("Catalogue", () => {
  it("offers a whole-school holder of the keys a new item and an edit", () => {
    act(() => root.render(<CatalogTab entity="BSS" />));
    expect(button("New Item")).toBeDefined();
    clickRow();
    expect(document.body.textContent).toContain("A4 paper");
    expect(button("Edit Item")).toBeDefined();
  });

  it("offers a branch's own buyer neither, though she holds the keys", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<CatalogTab entity="BSS" />));
    expect(container.textContent).toContain("A4 paper");
    expect(button("New Item")).toBeUndefined();
    clickRow();
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("A4 paper");
    expect(button("Edit Item")).toBeUndefined();
  });
});
