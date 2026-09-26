/**
 * The Budgets list and the New budget drawer, for a branch bursar and for the school.
 *
 * Chukwuemeka is the bursar at Holy Cross College Main Branch. He sees two plans:
 * the school's, which the server sends without actuals because they would cover
 * the Annex too, and his branch's own, which comes with its actuals. The list
 * must show the branch plan's figures and a dash for the school's, offer only
 * the branch plan in the heatmap, and file anything he creates to his branch
 * without asking. The proprietor sees every figure and chooses School-wide or a
 * branch for a new plan.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Budget, BudgetFiling } from "@/redux/services/finance/ops-types";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../../permissions";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  list: null as unknown,
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
  useCreateBudgetMutation: mocks.mutation,
  useUpdateBudgetMutation: mocks.mutation,
  useSetBudgetLinesMutation: mocks.mutation,
  useApproveBudgetMutation: mocks.mutation,
  useDeleteBudgetMutation: mocks.mutation,
}));

import { BudgetsTab } from "./budgets-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIN = { id: 19, name: "Holy Cross College Main Branch" };
const ANNEX = { id: 31, name: "Annex" };

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
  mocks.held = new Set(["finance.budget.view", ...keys]);
  mocks.list = { data: rows, narrowed, filing, pagination: { currentPage: 1, totalPages: 1 } };
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
  const filing = { school: false, branches: [MAIN] };

  it("names each plan's branch and shows actuals only for his branch's plan", () => {
    const text = render([MAIN_PLAN, SCHOOL_PLAN_TO_BRANCH], filing, true);

    expect(text).toContain("Branch");
    expect(text).toContain("School-wide");
    expect(text).toContain(MAIN.name);
    expect(text).toContain("Actual YTD");
    expect(text).not.toContain("The school’s plan only");
  });

  it("offers only his branch's plan in the variance heatmap", () => {
    render([MAIN_PLAN, SCHOOL_PLAN_TO_BRANCH], filing, true);

    const heatmapPicker = [...container.querySelectorAll("select")].find((s) => s.textContent?.includes("BUD-2"));
    expect(heatmapPicker).toBeDefined();
    expect(optionLabels(heatmapPicker!)).toEqual(["BUD-2 · Main plan"]);
  });

  it("shows the school's plan alone as a plan, with no actual columns", () => {
    const text = render([SCHOOL_PLAN_TO_BRANCH], filing, true);

    expect(text).toContain("The school’s plan only");
    expect(text).not.toContain("Actual YTD");
    expect(text).not.toContain("Variance heatmap");
  });

  it("files a new plan to his branch without offering a choice", () => {
    render([SCHOOL_PLAN_TO_BRANCH], filing, true, "finance.budget.create");
    openNewBudget();

    const drawer = document.body.textContent ?? "";
    expect(drawer).toContain(MAIN.name);
    expect(optionLabels(document.body)).not.toContain("School-wide");
    expect(optionLabels(document.body)).not.toContain(ANNEX.name);
  });

  it("offers no New budget to a reader who may file for nobody", () => {
    const text = render([SCHOOL_PLAN_TO_BRANCH], { school: false, branches: [] }, true, "finance.budget.create");
    expect(text).not.toContain("New budget");
  });
});

describe("Budgets for the proprietor", () => {
  it("shows every plan's actuals and offers School-wide or any branch for a new one", () => {
    const text = render(
      [MAIN_PLAN, budget({})], { school: true, branches: [ANNEX, MAIN] }, false, "finance.budget.create",
    );
    expect(text).not.toContain("The school’s plan only");
    expect(text).toContain("Actual YTD");

    openNewBudget();
    const labels = optionLabels(document.body);
    expect(labels).toContain("School-wide");
    expect(labels).toContain(ANNEX.name);
    expect(labels).toContain(MAIN.name);
  });
});
