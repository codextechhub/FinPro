/**
 * Bright Star's deferred income. September's release posted one journal at
 * Ikeja and one at Lekki and its month is open; August's is closed; a July
 * release was already reversed. The undo form offers September alone, with
 * what it holds, and the list follows the branch picked. When Lekki has closed
 * its own September while the school's is still open, the undo (which
 * reverses Ikeja's and Lekki's releases together) would be refused, so the
 * form lists September disabled as "closed at Lekki" and says why.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ summary: vi.fn(), releases: vi.fn(), periods: vi.fn(), rows: [] as unknown[], periodRows: [] as unknown[] }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  hostBranchLens: () => ({ applies: true, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false }),
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetDeferredIncomeQuery: (args: unknown) => {
    mocks.summary(args);
    return { data: { data: { pending: 0, released: 0, by_month: [] } }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useGetDeferredIncomeReleasesQuery: (args: unknown) => {
    mocks.releases(args);
    return { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  useReleaseDeferredIncomeMutation: () => [vi.fn(), { isLoading: false }],
  useReverseDeferredIncomeMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetPeriodsQuery: (args: unknown) => {
    mocks.periods(args);
    return { data: { data: mocks.periodRows } };
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { DeferredIncomeReleaseRow } from "@/redux/services/finance/fees-types";
import { DeferredIncomeTab, undoableMonths } from "./deferred-income-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (over: Partial<DeferredIncomeReleaseRow>): DeferredIncomeReleaseRow => ({
  id: 1, branch_id: 1, branch_name: "Ikeja", date: "2026-09-30", month: "2026-09", period_id: 9, period_name: "September 2026",
  period_status: "OPEN", amount: 1_000_000, journal_id: 400, journal_number: "JE-0400", reversed: false, reversed_at: null,
  can_reverse: true, ...over,
});
const ROWS = [
  row({}),
  row({ id: 2, branch_id: 2, branch_name: "Lekki", amount: 500_000, journal_id: 401, journal_number: "JE-0401" }),
  row({ id: 3, date: "2026-08-31", month: "2026-08", period_id: 8, period_name: "August 2026", period_status: "CLOSED", can_reverse: false }),
  row({ id: 4, date: "2026-07-31", month: "2026-07", period_id: 7, period_name: "July 2026", reversed: true, can_reverse: false }),
];

const LEKKI_CLOSED_SEPTEMBER = {
  id: 9, branch_states: [
    { branch: 1, branch_name: "Ikeja", status: "OPEN", closed_at: null },
    { branch: 2, branch_name: "Lekki", status: "CLOSED", closed_at: "2026-10-02T09:00:00Z" },
  ],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.summary.mockReset();
  mocks.releases.mockReset();
  mocks.periods.mockReset();
  mocks.rows = ROWS;
  mocks.periodRows = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the months a release can be undone in", () => {
  it("are the open months with a release not yet reversed, each once with its total", () => {
    expect(undoableMonths(ROWS)).toEqual([{ periodId: 9, name: "September 2026", amount: 1_500_000, journals: 2, closedAt: [] }]);
  });

  it("name a branch that closed its own month, where it holds a release", () => {
    expect(undoableMonths(ROWS, [LEKKI_CLOSED_SEPTEMBER])[0].closedAt).toEqual(["Lekki"]);
    const ikejaOnly = ROWS.filter((r) => r.branch_id === 1);
    expect(undoableMonths(ikejaOnly, [LEKKI_CLOSED_SEPTEMBER])[0].closedAt).toEqual([]);
  });
});

describe("the deferred income tab", () => {
  it("lists the releases posted, and follows the branch picked", () => {
    act(() => root.render(<MemoryRouter initialEntries={["/finance/receivables/deferred-income?branch=2"]}><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
    expect(mocks.summary).toHaveBeenLastCalledWith({ entity: "BSS", branch: 2 });
    expect(mocks.releases).toHaveBeenCalledWith({ entity: "BSS", page: 1, branch: 2 });
    expect(container.textContent).toContain("JE-0401");
  });

  it("offers in the undo form only the months that can be undone", async () => {
    act(() => root.render(<MemoryRouter><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
    const undo = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Undo a month"));
    await act(async () => { undo?.click(); });
    expect(mocks.releases).toHaveBeenCalledWith({ entity: "BSS", reversed: "false", page_size: 100 });
    const options = Array.from(document.body.querySelectorAll('select[aria-label="Month"] option')).map((o) => o.textContent);
    expect(options).toEqual(["Select a month", "September 2026: ₦15,000.00 in 2 journals"]);
    expect(mocks.periods).toHaveBeenCalledWith({ entity: "BSS", status: "OPEN", include_branches: "true" });
  });

  it("lists a month one branch has closed as disabled, and says why", async () => {
    mocks.periodRows = [LEKKI_CLOSED_SEPTEMBER];
    act(() => root.render(<MemoryRouter><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
    const undo = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Undo a month"));
    await act(async () => { undo?.click(); });
    const september = Array.from(document.body.querySelectorAll<HTMLOptionElement>('select[aria-label="Month"] option'))
      .find((o) => o.value === "9");
    expect(september?.textContent).toBe("September 2026: closed at Lekki");
    expect(september?.disabled).toBe(true);
    expect(document.body.textContent).toContain("A month closed at any branch cannot be undone until that branch re-opens it.");
  });
});
