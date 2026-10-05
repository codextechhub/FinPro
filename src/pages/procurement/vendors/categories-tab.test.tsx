/**
 * A vendor category has no branch: every branch files its spend under the same
 * taxonomy, so the server takes a new category or an edit only from a reader
 * who covers the whole school. Bright Star's proprietor, holding both keys, is
 * offered New Category and Edit Category. Lekki's buyer holds the same keys but
 * reaches Lekki alone: she reads the list and opens a category, and is offered
 * neither.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ wholeSchool: true, held: new Set<string>() }));
const { category } = vi.hoisted(() => ({
  category: {
    id: 1, code: "STAT", name: "Stationery", parent_id: null, parent_code: null, parent_name: null, level: 1,
    default_expense_account_id: null, default_expense_code: null, is_active: true, vendor_count: 2, child_count: 0, catalog_item_count: 4,
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
  useGetCategoriesQuery: () => ({ currentData: { data: [category] }, data: { data: [category] }, isLoading: false, isFetching: false, isError: false, error: undefined, refetch: vi.fn() }),
  useGetCategoryInsightsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useGetCategoryQuery: () => ({ data: { data: category }, isLoading: false, isError: false, error: undefined, refetch: vi.fn() }),
  useCreateCategoryMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateCategoryMutation: () => [vi.fn(), { isLoading: false }],
}));

import { P } from "../../../permissions";
import { CategoriesTab } from "./categories-tab";

const KEYS = [P.PROC_VIEW_CATEGORIES, P.PROC_CREATE_CATEGORY, P.PROC_UPDATE_CATEGORY];

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

describe("Vendor categories", () => {
  it("offer a whole-school holder of the keys a new category and an edit", () => {
    act(() => root.render(<CategoriesTab entity="BSS" />));
    expect(button("New Category")).toBeDefined();
    clickRow();
    expect(button("Edit Category")).toBeDefined();
  });

  it("offer a branch's own buyer neither, though she holds the keys", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<CategoriesTab entity="BSS" />));
    expect(container.textContent).toContain("Stationery");
    expect(button("New Category")).toBeUndefined();
    clickRow();
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("Stationery");
    expect(button("Edit Category")).toBeUndefined();
  });
});
