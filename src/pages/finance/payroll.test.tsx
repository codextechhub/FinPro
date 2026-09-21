/**
 * An employee's salary figures follow Field Access on `finance.salary`. A
 * payroll clerk at Bright Star may see pension, see gross without changing it,
 * and not see PAYE or net at all:
 *
 *   1. PAYE and the take-home line are not on the form;
 *   2. gross is shown greyed, and the save neither sends it nor waits for it;
 *   3. the figure the clerk may change is sent as usual.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetSalaryStructuresQuery: () => ({ data: { data: [] } }),
  useCreateEmployeeSalaryMutation: () => [mocks.create, { isLoading: false }],
  useUpdateEmployeeSalaryMutation: () => [mocks.update, { isLoading: false }],
}));
vi.mock("@/redux/services/finance/reports-api", () => ({}));
vi.mock("@/redux/services/tenants-api", () => ({}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CostCenterPicker: () => null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EmployeeDrawer } from "./payroll";
import type { EmployeeSalary } from "@/redux/services/finance/ops-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CLERK = {
  "finance.salary": {
    hidden: ["net_amount", "paye_amount"],
    read_only: ["components", "gross_amount"],
    open_on_create: [],
  },
};

/** Mrs. Okafor's roster row as the clerk receives it: no PAYE, no net. */
const OKAFOR = {
  id: 12, name: "Ngozi Okafor", structure_id: null, structure_name: null,
  branch_id: null, branch_name: null, gross_amount: 45_000_000, pension_amount: 3_600_000,
  cost_center: null, is_active: true,
} as EmployeeSalary;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = CLERK;
  mocks.update.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const field = (name: string) => document.body.querySelector<HTMLFieldSetElement>(`fieldset[data-field=${name}]`);

describe("EmployeeDrawer under Field Access", () => {
  it("hides PAYE and net, greys gross, and sends only what may change", async () => {
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Updated." }) });
    act(() => root.render(<EmployeeDrawer open salary={OKAFOR} entity="COD" branches={[]} onClose={() => undefined} />));

    expect(field("paye_amount")).toBeNull();
    expect(document.body.textContent).not.toContain("Net (take-home)");
    expect(field("gross_amount")!.disabled).toBe(true);
    expect(field("pension_amount")!.disabled).toBe(false);

    const save = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Save changes"))!;
    expect(save.disabled).toBe(false);
    await act(async () => { save.click(); });

    const body = mocks.update.mock.calls[0][0];
    expect(body).toMatchObject({ id: 12, name: "Ngozi Okafor", pension_amount: 3_600_000 });
    expect(body).not.toHaveProperty("gross_amount");
    expect(body).not.toHaveProperty("paye_amount");
  });

  it("offers every figure to a role with full access", () => {
    mocks.fieldAccess = {};
    act(() => root.render(<EmployeeDrawer open salary={{ ...OKAFOR, paye_amount: 5_000_000, net_amount: 36_400_000 }} entity="COD" branches={[]} onClose={() => undefined} />));
    expect(field("gross_amount")!.disabled).toBe(false);
    expect(field("paye_amount")).not.toBeNull();
    expect(document.body.textContent).toContain("Net (take-home)");
  });
});
