/**
 * An employee's salary figures follow Field Access on `finance.salary`. A
 * payroll clerk at Bright Star may see pension, see gross without changing it,
 * and not see PAYE or net at all:
 *
 *   1. PAYE and the take-home line are not on the form;
 *   2. gross is shown greyed, and the save neither sends it nor waits for it;
 *   3. the figure the clerk may change is sent as usual.
 *
 * Paying a run posted per branch gives each unpaid branch its own account
 * picker, narrowed to that branch's accounts, and sends the accounts chosen as
 * `bank_accounts`. Mrs Bello keeps Ikeja's payroll at Corona, which pays all
 * staff in one central run: they are not offered a roster run for all staff, only
 * a run they type for their own branch.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  create: vi.fn(),
  update: vi.fn(),
  pay: vi.fn(),
  pickers: [] as { documentBranchId?: number | null }[],
  wholeSchool: true,
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
  usePayPayrollRunMutation: () => [mocks.pay, { isLoading: false }],
  useGetEmployeeSalariesQuery: () => ({ data: { data: [] } }),
  useGeneratePayrollRunMutation: () => [vi.fn(), { isLoading: false }],
  useCreatePayrollRunMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/redux/services/finance/reports-api", () => ({}));
vi.mock("@/redux/services/tenants-api", () => ({ useGetBranchOptionsQuery: () => ({ data: { data: [] } }) }));
vi.mock("../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: null, covers: () => true }),
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CostCenterPicker: () => null,
  PostingDateField: () => null,
  useRaisingBranchChoice: () => ({ raising: { ask: false }, value: "", setValue: vi.fn(), reset: vi.fn(), ready: true, body: () => ({}) }),
  RaisingBranchChoiceField: () => null,
  BankAccountPicker: (props: { documentBranchId?: number | null; onChange: (v: string) => void; placeholder?: string }) => {
    mocks.pickers.push(props);
    return <button type="button" data-picker={String(props.documentBranchId)} onClick={() => props.onChange(String(props.documentBranchId))}>{props.placeholder}</button>;
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EmployeeDrawer, NewRunDrawer, PayDrawer } from "./payroll";
import type { EmployeeSalary, PayrollRun } from "@/redux/services/finance/ops-types";

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

const SEPT: PayrollRun = {
  id: 7, document_number: "PR-7", pay_date: "2026-09-28", period_label: "September 2026",
  branch_id: null, branch_name: null, narration: "", run_status: "POSTED", status: "POSTED",
  gross_total: 200, paye_total: 20, pension_total: 10, net_total: 170, net_total_naira: "",
  bank_account_id: null, paye_payable_account: null, paye_payable_account_id: null,
  pension_payable_account: null, pension_payable_account_id: null, journal_id: null, disbursement_journal_id: null,
  lines: [],
  branch_shares: [
    { id: 1, branch_id: 10, branch_name: "Ikeja Branch", status: "POSTED", gross_total: 100, paye_total: 10, pension_total: 5, net_total: 85, journal_id: 3, disbursement_journal_id: null, bank_account_id: null },
    { id: 2, branch_id: 20, branch_name: "Lekki Branch", status: "POSTED", gross_total: 100, paye_total: 10, pension_total: 5, net_total: 85, journal_id: 4, disbursement_journal_id: null, bank_account_id: null },
  ],
};

describe("Paying a run posted per branch", () => {
  it("offers each branch its own account picker and pays the branches given one", async () => {
    mocks.pickers = [];
    mocks.pay.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Paid." }) });
    act(() => root.render(<PayDrawer run={SEPT} entity="CORONA" onClose={() => undefined} />));

    expect(mocks.pickers.map((p) => p.documentBranchId)).toEqual([10, 20]);
    const ikeja = document.body.querySelector<HTMLButtonElement>('[data-picker="10"]')!;
    act(() => ikeja.click());
    const pay = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Pay"))!;
    expect(pay.disabled).toBe(false);
    await act(async () => { pay.click(); });

    expect(mocks.pay.mock.calls[0][0]).toMatchObject({ id: 7, bank_accounts: [10] });
  });

  it("holds the payment until at least one branch is given an account", () => {
    act(() => root.render(<PayDrawer run={SEPT} entity="CORONA" onClose={() => undefined} />));
    const pay = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Pay"))!;
    expect(pay.disabled).toBe(true);
  });
});

describe("A branch officer at a central school", () => {
  afterEach(() => { mocks.wholeSchool = true; });

  it("is not offered a roster run for all staff", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<NewRunDrawer open entity="CORONA" perBranch={false} onClose={() => undefined} />));
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("From roster");
    expect(text).not.toContain("Generate run");
    expect(text).toContain("raised by someone who covers the whole school");
  });

  it("leaves the roster run to a whole-school reader", () => {
    act(() => root.render(<NewRunDrawer open entity="CORONA" perBranch={false} onClose={() => undefined} />));
    expect(document.body.textContent).toContain("Generate run");
  });
});
