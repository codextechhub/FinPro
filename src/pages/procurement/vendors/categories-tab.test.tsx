/**
 * A vendor category has no branch: every branch files its spend under the same
 * taxonomy, so the server takes a new category or an edit only from a reader
 * who covers the whole school. Bright Star's proprietor, holding both keys, is
 * offered New Category and Edit Category. Lekki's buyer holds the same keys but
 * reaches Lekki alone: she reads the list and opens a category, and is offered
 * neither.
 *
 * Spend per category is read through the vendor's category field. Bright Star's
 * buyer holds the reports key but her role hides the category on vendors, so the
 * list has no Spend MTD column, the drawer no Spend tab, and the insights
 * request is never sent: the server would refuse it, and the screen must not
 * answer that refusal with "Unavailable".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  wholeSchool: true,
  held: new Set<string>(),
  fieldAccess: {} as Record<string, { hidden?: string[]; read_only?: string[] }>,
  insights: vi.fn(),
}));
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
    fieldAccess: mocks.fieldAccess,
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
  DetailDrawer: ({ open, title, footer, children }: { open: boolean; title: string; footer?: React.ReactNode; children?: React.ReactNode }) =>
    open ? <div role="dialog"><p>{title}</p>{children}{footer}</div> : null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetCategoriesQuery: () => ({ currentData: { data: [category] }, data: { data: [category] }, isLoading: false, isFetching: false, isError: false, error: undefined, refetch: vi.fn() }),
  useGetCategoryInsightsQuery: (args: unknown, options: unknown) => {
    mocks.insights(args, options);
    return { data: { data: [{ category_id: 1, spend_mtd: 250_000, spend_prior_month: 0, spend_ytd: 900_000 }] }, isLoading: false, isError: false };
  },
  useGetCategoryQuery: () => ({ data: { data: category }, isLoading: false, isError: false, error: undefined, refetch: vi.fn() }),
  useCreateCategoryMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateCategoryMutation: () => [vi.fn(), { isLoading: false }],
}));

import { P } from "../../../permissions";
import { CategoriesTab } from "./categories-tab";

const KEYS = [P.PROC_VIEW_CATEGORIES, P.PROC_CREATE_CATEGORY, P.PROC_UPDATE_CATEGORY, P.PROC_VIEW_PROC_REPORTS];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.wholeSchool = true;
  mocks.held = new Set(KEYS);
  mocks.fieldAccess = {};
  mocks.insights.mockClear();
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

  it("shows a reader who may read the category its spend, and asks the server for it", () => {
    act(() => root.render(<CategoriesTab entity="BSS" />));
    const headers = [...container.querySelectorAll("th")].map((h) => h.textContent);
    expect(headers).toContain("Spend MTD");
    expect(container.textContent).toContain("2,500");
    expect(mocks.insights).toHaveBeenCalledWith({ entity: "BSS" }, { skip: false });
    clickRow();
    expect(button("Spend")).toBeDefined();
  });

  it("gives a reader whose role hides the vendor category no spend column, tab or request", () => {
    mocks.fieldAccess = { "procurement.vendor": { hidden: ["category_id", "category_code"] } };
    act(() => root.render(<CategoriesTab entity="BSS" />));
    const headers = [...container.querySelectorAll("th")].map((h) => h.textContent);
    expect(headers).not.toContain("Spend MTD");
    expect(container.textContent).toContain("Stationery");
    expect(container.textContent).not.toContain("Unavailable");
    expect(container.textContent).not.toContain("Restricted");
    expect(mocks.insights).toHaveBeenCalledWith({ entity: "BSS" }, { skip: true });
    clickRow();
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("Stationery");
    expect(button("Overview")).toBeDefined();
    expect(button("Usage")).toBeDefined();
    expect(button("Spend")).toBeUndefined();
  });

  it("keeps the report-key refusal separate: no reports key reads Restricted, not hidden", () => {
    mocks.held = new Set([P.PROC_VIEW_CATEGORIES]);
    act(() => root.render(<CategoriesTab entity="BSS" />));
    expect([...container.querySelectorAll("th")].map((h) => h.textContent)).toContain("Spend MTD");
    expect(container.textContent).toContain("Restricted");
    expect(mocks.insights).toHaveBeenCalledWith({ entity: "BSS" }, { skip: true });
  });
});
