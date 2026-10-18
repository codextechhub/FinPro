/**
 * The fixed asset register's branch and year, at Bright Star (Ikeja and Lekki).
 *
 * Mrs Bello switches the sidebar to Lekki and picks FY 2015: the register and
 * the figures above it answer for the assets Lekki acquired in 2015, and the
 * page offers no branch picker of its own. With nothing picked the figures
 * count every asset. Picking a year goes back to the first page.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  lens: { applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false } as unknown,
}));

const { idle } = vi.hoisted(() => ({ idle: () => [vi.fn(), { isLoading: false }] }));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFixedAssetsQuery: (args: unknown) => (mocks.list(args), {
    data: { data: [], pagination: { currentPage: 1, totalPages: 2 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useGetFixedAssetSummaryQuery: (args: unknown) => (mocks.summary(args), { data: { data: { cost: 0, accum: 0, nbv: 0, monthly: 0 } } }),
  useGetFiscalYearsQuery: () => ({ data: { data: [{ id: 1, year: 2015, start_date: "2014-09-01", end_date: "2015-08-31", is_archived: false }] } }),
  useGetDepreciationPreviewQuery: () => ({ data: undefined, isFetching: false }),
  useCreateFixedAssetMutation: idle,
  useAcquireFixedAssetMutation: idle,
  useDepreciateFixedAssetMutation: idle,
  useRunDepreciationMutation: idle,
  useDisposeFixedAssetMutation: idle,
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  BankAccountPicker: () => null,
  AccountPicker: () => null,
  PostingDateField: () => null,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true }),
}));

vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  hostBranchLens: () => mocks.lens,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AssetsTab } from "./assets-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LEKKI = { applies: true, pinnedBranch: null, branch: 2, choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.list.mockReset();
  mocks.summary.mockReset();
  mocks.lens = { applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** The register at a page address, which holds the year or dates picked. */
const routed = (node: ReactNode, path: string) => <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>;
const show = (path = "/finance/budgets/assets") => act(() => root.render(routed(<AssetsTab entity="BSS" currency="NGN" />, path)));
const year = () => container.querySelector<HTMLSelectElement>('select[aria-label="Year"]')!;

describe("the asset register's branch and year", () => {
  it("opens on All years and counts every asset", () => {
    show();
    expect(year().value).toBe("all");
    expect(mocks.list.mock.lastCall?.[0]).toEqual({ entity: "BSS", page: 1 });
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS" });
  });

  it("asks the register and its figures for the switcher's branch and the year in the page address", () => {
    mocks.lens = LEKKI;
    show("/finance/budgets/assets?year=2015");
    expect(container.querySelector('select[aria-label="Branch"]')).toBeNull();
    expect(mocks.list.mock.lastCall?.[0]).toEqual({ entity: "BSS", page: 1, branch: 2, fiscal_year: 2015 });
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS", branch: 2, fiscal_year: 2015 });
  });

  it("sends custom dates as a range and never with a year", () => {
    show("/finance/budgets/assets?year=custom&from=2015-03-01&to=2015-05-31");
    expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ date_from: "2015-03-01", date_to: "2015-05-31" });
    expect(mocks.list.mock.lastCall?.[0]).not.toHaveProperty("fiscal_year");
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS", date_from: "2015-03-01", date_to: "2015-05-31" });
  });

  it("goes back to the first page when the year changes", () => {
    show();
    const next = Array.from(container.querySelectorAll("button")).find((b) => /next/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    act(() => next!.click());
    expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ page: 2 });
    act(() => {
      year().value = "2015";
      year().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ page: 1, fiscal_year: 2015 });
  });
});
