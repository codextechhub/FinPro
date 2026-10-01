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
 * a run they type for their own branch. When they open that central run they
 * are told it covers the whole school and that they see only Lekki's part, and
 * are offered nothing to post, pay or void; a whole-school bursar opening the
 * same run is offered paying and voiding as before.
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
  branchIds: null as number[] | null,
  run: null as unknown,
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
  useGetPayrollRunQuery: () => ({ data: mocks.run ? { data: mocks.run } : undefined }),
  usePostPayrollRunMutation: () => [vi.fn(), { isLoading: false }],
  useCancelPayrollRunMutation: () => [vi.fn(), { isLoading: false }],
  useGetEmployeeSalariesQuery: () => ({ data: { data: [] } }),
  useGeneratePayrollRunMutation: () => [vi.fn(), { isLoading: false }],
  useCreatePayrollRunMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/redux/services/finance/reports-api", () => ({}));
vi.mock("@/redux/services/tenants-api", () => ({ useGetBranchOptionsQuery: () => ({ data: { data: [] } }) }));
vi.mock("../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.branchIds, covers: () => true }),
  hostBranchLens: undefined,
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

import { EmployeeDrawer, NewRunDrawer, PayDrawer, RunDrawer, offeredStructures, salaryChanges, withSequences } from "./payroll";
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

    // Nothing was changed, so nothing is echoed back: not even the figures she may change.
    expect(mocks.update.mock.calls[0][0]).toEqual({ id: 12, entity: "COD" });
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

/** Lekki's part of September as the server sends it to Lekki's bursar. */
const SEPT_LEKKI_PART: PayrollRun = {
  ...SEPT, gross_total: 100, paye_total: 10, pension_total: 5, net_total: 85, partial_view: true,
  branch_shares: [SEPT.branch_shares![1]],
  lines: [{ id: 41, line_no: 1, employee_id: null, employee_name: "Bola Lawal", gross_amount: 100, paye_amount: 10, pension_amount: 5, net_amount: 85, components: [], cost_center: null, branch_id: 20, branch_name: "Lekki Branch" }],
};

const buttonLabels = () => [...document.body.querySelectorAll("button")].map((b) => b.textContent ?? "");

describe("Opening a run for the whole school", () => {
  afterEach(() => { mocks.wholeSchool = true; mocks.branchIds = null; mocks.run = null; });

  it("tells a branch bursar they see only their branch's part, and offers no action", () => {
    mocks.wholeSchool = false;
    mocks.branchIds = [20];
    mocks.run = SEPT_LEKKI_PART;
    act(() => root.render(<RunDrawer runId={7} entity="CORONA" onClose={() => undefined} />));

    const text = document.body.textContent ?? "";
    expect(text).toContain("This run covers the whole school. You are shown only your branch's part.");
    expect(text).toContain("Bola Lawal");
    expect(text).not.toContain("Ikeja");
    const labels = buttonLabels();
    for (const action of ["Pay net", "Void run", "Cancel run", "Calculate & post"]) {
      expect(labels.some((label) => label.includes(action))).toBe(false);
    }
  });

  it("says so from the server's flag alone, whatever the reach reads", () => {
    mocks.run = SEPT_LEKKI_PART;
    act(() => root.render(<RunDrawer runId={7} entity="CORONA" onClose={() => undefined} />));

    expect(document.body.textContent).toContain("You are shown only your branch's part.");
    expect(buttonLabels().some((label) => label.includes("Pay net"))).toBe(false);
  });

  it("offers a whole-school bursar paying and voiding, with no note", () => {
    mocks.run = SEPT;
    act(() => root.render(<RunDrawer runId={7} entity="CORONA" onClose={() => undefined} />));

    expect(document.body.textContent).not.toContain("You are shown only");
    const labels = buttonLabels();
    expect(labels.some((label) => label.includes("Pay net"))).toBe(true);
    expect(labels.some((label) => label.includes("Void run"))).toBe(true);
  });
});

/**
 * Tunde is on the Ikeja roster at N300,000 on the Standard structure. Mrs Bello
 * may read his pay but not change it, and corrects a misspelt name: the body
 * carries the name alone, never the structure or gross she cannot change. A
 * bursar who may change pay and raises his gross sends the gross; saving with
 * nothing changed sends nothing.
 */
const tunde: EmployeeSalary = {
  id: 7, name: "Tunde Adeymi", structure_id: 3, structure_name: "Standard",
  branch_id: 19, branch_name: "Ikeja Branch", gross_amount: 30_000_000, paye_amount: 2_500_000,
  pension_amount: 2_400_000, net_amount: 25_100_000, cost_center: null, is_active: true,
} as EmployeeSalary;

const readOnlyPay = { writableOnly: <T extends object>(body: T) => Object.fromEntries(
  Object.entries(body).filter(([name]) => !["structure", "gross_amount", "paye_amount", "pension_amount"].includes(name)),
) as T };
const mayChangePay = { writableOnly: <T extends object>(body: T) => body };
const editing = { creating: false };

const fields = (over: Partial<Parameters<typeof salaryChanges>[1]> = {}) => ({
  name: "Tunde Adeymi", cost_center: undefined, structure: 3, gross_amount: 30_000_000, ...over,
});

describe("what a roster edit sends", () => {
  it("sends only the corrected name when pay is read-only", () => {
    expect(salaryChanges(tunde, fields({ name: "Tunde Adeyemi" }), true, readOnlyPay, editing))
      .toEqual({ name: "Tunde Adeyemi" });
  });

  it("never sends a pay field the reader may not change, even when it differs", () => {
    expect(salaryChanges(tunde, fields({ gross_amount: 35_000_000 }), true, readOnlyPay, editing)).toEqual({});
  });

  it("sends a changed gross for a reader who may change pay", () => {
    expect(salaryChanges(tunde, fields({ gross_amount: 35_000_000 }), true, mayChangePay, editing))
      .toEqual({ gross_amount: 35_000_000 });
  });

  it("sends nothing when nothing changed, and the active flag only when it did", () => {
    expect(salaryChanges(tunde, fields(), true, mayChangePay, editing)).toEqual({});
    expect(salaryChanges(tunde, fields(), false, mayChangePay, editing)).toEqual({ is_active: false });
  });
});

/**
 * Tunde is still on "2025 Scale", which the school has since retired; "2026
 * Scale" is active. His drawer offers 2026 Scale and keeps 2025 Scale for him,
 * so a save that changes nothing leaves his structure alone. Ada, on no
 * structure, is offered 2026 Scale only.
 */
describe("the structures a roster drawer offers", () => {
  const scale2025 = { id: 4, name: "2025 Scale", description: "", is_active: false, components: [], employee_count: 1 };
  const scale2026 = { id: 5, name: "2026 Scale", description: "", is_active: true, components: [], employee_count: 9 };

  it("keeps a retired structure for the person already on it", () => {
    expect(offeredStructures([scale2025, scale2026], "4").map((s) => s.id)).toEqual([4, 5]);
  });

  it("offers only active structures to everyone else", () => {
    expect(offeredStructures([scale2025, scale2026], "").map((s) => s.id)).toEqual([5]);
  });

  it("sends no structure change when a person on a retired structure is saved unchanged", () => {
    const onRetired = { ...tunde, structure_id: 4 } as EmployeeSalary;
    expect(salaryChanges(onRetired, fields({ structure: 4 }), true, mayChangePay, editing)).toEqual({});
  });
});

/**
 * The Standard structure was saved with its lines numbered 1, 2, 3. Saving it
 * again unchanged keeps those numbers; adding a line renumbers from 0 in the
 * order shown.
 */
describe("the order numbers a structure is saved with", () => {
  const line = (sequence: number) => ({ sequence });

  it("keeps the stored numbers while the order is unchanged", () => {
    expect(withSequences([line(1), line(2), line(3)]).map((l) => l.sequence)).toEqual([1, 2, 3]);
  });

  it("renumbers from 0 once a line is added or moved", () => {
    expect(withSequences([line(1), line(2), line(0)]).map((l) => l.sequence)).toEqual([0, 1, 2]);
    expect(withSequences([line(2), line(1)]).map((l) => l.sequence)).toEqual([0, 1]);
  });
});
