/**
 * The Budgets list and the New budget drawer, for a branch bursar and for the school.
 *
 * Chukwuemeka is the bursar at Holy Cross College Main Branch. They see their
 * branch's plan with its actuals, and files anything they create to their branch
 * without being asked. A server that still keeps a plan for the whole school
 * sends them that one too, without actuals: it reads "All branches", its actual
 * is a dash rather than a zero, and it stays out of the heatmap. The proprietor
 * sees every figure, must name a branch for a new plan (every budget belongs to
 * one), and sees the school's total across Main and Annex as one line; a server
 * without the roll-up draws no total at all.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Budget, BudgetFiling, BudgetRollup } from "@/redux/services/finance/ops-types";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../../permissions";

const mocks = vi.hoisted(() => ({
  state: { auth: {} } as { auth: Record<string, unknown> },
  held: new Set<string>(),
  list: null as unknown,
  rollup: undefined as unknown,
  mutation: () => [() => undefined, { isLoading: false }],
}));

const holds = (code: PermissionCode) => mocks.held.has(FINANCE_PERMISSION_REGISTRY[code]);

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: holds,
    hasAnyPermission: (...codes: PermissionCode[]) => codes.some(holds),
    hasAllPermissions: (...codes: PermissionCode[]) => codes.every(holds),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));

vi.mock("@/hooks/use-action-param", () => ({ useActionParam: () => undefined }));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mocks.state),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBranches: () => ({ data: [ANNEX, MAIN], isLoading: false, isError: false }),
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AccountPicker: () => <div>account-picker</div>,
  CostCenterPicker: () => <div>cost-centre-picker</div>,
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetBudgetsQuery: () => ({ data: mocks.list, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetBudgetQuery: () => ({ data: undefined }),
  useGetBudgetVarianceQuery: () => ({ data: undefined }),
  useGetBudgetHeatmapQuery: () => ({ data: { data: { periods: [], rows: [] } }, isFetching: false, isError: false }),
  useGetFiscalYearsQuery: () => ({ data: { data: [{ id: 1, year: 2026, status: "OPEN" }] } }),
  useGetBudgetRollupQuery: () => ({ data: mocks.rollup }),
  useCreateBudgetMutation: mocks.mutation,
  useUpdateBudgetMutation: mocks.mutation,
  useSetBudgetLinesMutation: mocks.mutation,
  useApproveBudgetMutation: mocks.mutation,
  useDeleteBudgetMutation: mocks.mutation,
}));

import { BudgetsTab, schoolTotal } from "./budgets-tab";

const { MAIN, ANNEX } = vi.hoisted(() => ({
  MAIN: { id: 19, name: "Holy Cross College Main Branch" },
  ANNEX: { id: 31, name: "Annex" },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;


const budget = (over: Partial<Budget>): Budget => ({
  id: 1, code: "BUD-1", name: "Operating plan", fiscal_year: 2026, fiscal_year_id: 1,
  status: "DRAFT", is_locked: false, approved_at: null, lines: [],
  branch_id: null, branch_name: null, can_manage: true,
  budgeted_total: 500_000, actual_ytd: 400_000, consumed_pct: 80, ...over,
});

const SCHOOL_PLAN_TO_BRANCH = budget({ actual_ytd: null, consumed_pct: null, can_manage: false });
const MAIN_PLAN = budget({
  id: 2, code: "BUD-2", name: "Main plan", branch_id: MAIN.id, branch_name: MAIN.name,
  budgeted_total: 200_000, actual_ytd: 100_000, consumed_pct: 50,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (rows: Budget[], filing: BudgetFiling, narrowed: boolean, ...keys: string[]) => {
  mocks.rollup = undefined;
  mocks.state = {
    auth: { tenant: {}, branch_reach: narrowed ? { whole_tenant: false, branch_ids: [MAIN.id] } : { whole_tenant: true, branch_ids: [] } },
  };
  mocks.held = new Set(["finance.budget.view", ...keys]);
  mocks.list = { data: rows, filing, pagination: { currentPage: 1, totalPages: 1 } };
  act(() => root.render(<BudgetsTab entity="HOLYCROSS" currency="NGN" />));
  return container.textContent ?? "";
};

const openNewBudget = () => {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("New budget"));
  expect(button).toBeDefined();
  act(() => button!.click());
};

const optionLabels = (scope: ParentNode) => [...scope.querySelectorAll("option")].map((o) => o.textContent);

describe("Budgets for a branch bursar", () => {
  const filing = { branches: [MAIN] };

  it("names each plan's branch and shows actuals only for their branch's plan", () => {
    const text = render([MAIN_PLAN, SCHOOL_PLAN_TO_BRANCH], filing, true);

    expect(text).toContain("Branch");
    expect(text).toContain("All branches");
    expect(text).toContain(MAIN.name);
    expect(text).toContain("Actual YTD");
  });

  it("offers only their branch's plan in the variance heatmap", () => {
    render([MAIN_PLAN, SCHOOL_PLAN_TO_BRANCH], filing, true);

    const heatmapPicker = [...container.querySelectorAll("select")].find((s) => s.textContent?.includes("BUD-2"));
    expect(heatmapPicker).toBeDefined();
    expect(optionLabels(heatmapPicker!)).toEqual(["BUD-2 · Main plan"]);
  });

  it("shows a plan whose actuals were withheld with no actual columns, never a zero", () => {
    const text = render([SCHOOL_PLAN_TO_BRANCH], filing, true);

    expect(text).not.toContain("Actual YTD");
    expect(text).not.toContain("₦0.00");
    expect(text).not.toContain("Variance heatmap");
  });

  it("files a new plan to their branch without offering a choice", () => {
    render([SCHOOL_PLAN_TO_BRANCH], filing, true, "finance.budget.create");
    openNewBudget();

    expect(document.body.querySelector('[aria-label="Branch"]')).toBeNull();
    expect(optionLabels(document.body)).not.toContain("Select branch");
    expect(optionLabels(document.body)).not.toContain(ANNEX.name);
  });

  it("offers no New budget to a reader who may file for nobody", () => {
    const text = render([SCHOOL_PLAN_TO_BRANCH], { branches: [] }, true, "finance.budget.create");
    expect(text).not.toContain("New budget");
  });
});

describe("Budgets for the proprietor", () => {
  it("shows every plan's actuals and asks which branch a new one is for, with no School-wide choice", () => {
    const text = render(
      [MAIN_PLAN, budget({})], { branches: [ANNEX, MAIN] }, false, "finance.budget.create",
    );
    expect(text).toContain("Actual YTD");

    openNewBudget();
    const labels = optionLabels(document.body);
    expect(labels).not.toContain("School-wide");
    expect(labels).toContain("Select branch");
    expect(labels).toContain(ANNEX.name);
    expect(labels).toContain(MAIN.name);
    const create = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Create budget"));
    expect(create?.disabled).toBe(true);
  });
});

describe("The school's total", () => {
  const plan = (id: number, name: string) => ({ id, code: `BUD-${id}`, name, status: "APPROVED", branch_id: id, branch_name: name });
  const ROLLUP: BudgetRollup = {
    fiscal_year: 2026, fiscal_year_id: 1, period_no: null, narrowed: false, rows: [],
    total_budget: { kobo: 700_000, naira: "" }, total_actual: { kobo: 350_000, naira: "" }, total_variance: null,
    budgets: [plan(MAIN.id, MAIN.name), plan(ANNEX.id, ANNEX.name)],
  };

  it("adds every branch's plan into one All branches line", () => {
    render([MAIN_PLAN], { branches: [ANNEX, MAIN] }, false);
    mocks.rollup = { data: ROLLUP };
    act(() => root.render(<BudgetsTab entity="HOLYCROSS" currency="NGN" />));

    const text = container.textContent ?? "";
    expect(text).toContain("All branches");
    expect(text).toContain("2 budgets added together");
    expect(schoolTotal(ROLLUP)).toMatchObject({ budgeted: 700_000, actual: 350_000, pct: 50 });
  });

  it("names a branch reader's total for their branches, and leaves out a total of one plan", () => {
    expect(schoolTotal({ ...ROLLUP, narrowed: true })?.label).toBe("All my branches");
    expect(schoolTotal({ ...ROLLUP, budgets: [plan(MAIN.id, MAIN.name)] })).toBeNull();
  });

  it("draws no total from a server without the roll-up", () => {
    const text = render([MAIN_PLAN], { branches: [ANNEX, MAIN] }, false);
    expect(text).not.toContain("added together");
    expect(schoolTotal(undefined)).toBeNull();
  });
});
