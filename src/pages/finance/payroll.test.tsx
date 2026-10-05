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
  openPayslip: vi.fn(),
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
vi.mock("@/redux/services/finance/payroll-api", () => ({
  useGetPayrollTaxStatesQuery: () => ({ data: { data: [
    { id: 1, country: "NG", code: "LA", name: "Lagos", authority_name: "LIRS", is_active: true },
    { id: 2, country: "NG", code: "OG", name: "Ogun", authority_name: "OGIRS", is_active: true },
  ] } }),
  useGetPensionFundAdministratorsQuery: () => ({ data: { data: [{ id: 9, code: "STANBIC", name: "Stanbic IBTC Pension", is_active: true }] } }),
  useGetPayslipContentQuery: () => ({ data: undefined, isLoading: false }),
  useGetPreviousPayMissingQuery: () => ({ data: undefined }),
}));
vi.mock("../../utils/payroll-documents", () => ({ openLinePayslip: mocks.openPayslip }));
vi.mock("../../components/workflow/person-picker", () => ({
  PersonPicker: (props: { onChange: (id: string) => void }) => <button type="button" data-person-picker onClick={() => props.onChange("77")}>Pick Aisha</button>,
}));
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: (props: { value?: string; onChange?: (event: { target: { value: string } }) => void }) => (
    <input value={props.value ?? ""} onChange={(event) => props.onChange?.({ target: { value: event.target.value } })} />
  ),
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
  useReaderBranchLens: () => ({ applies: true, pinnedBranch: null, branch: "all", choices: [], isLoading: false }),
  RaisingBranchChoiceField: () => null,
  BankAccountPicker: (props: { documentBranchId?: number | null; onChange: (v: string) => void; placeholder?: string }) => {
    mocks.pickers.push(props);
    return <button type="button" data-picker={String(props.documentBranchId)} onClick={() => props.onChange(String(props.documentBranchId))}>{props.placeholder}</button>;
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EmployeeDrawer, GeneratedRunNotice, NewRunDrawer, PayDrawer, PreviousPayMissingBanner, RunDrawer, canPrintPayslip, offeredStructures, salaryChanges, statutoryTotals, withSequences } from "./payroll";
import { withPayAliases } from "./payroll-access";
import { resolveFieldAccess } from "@/components/finance-ui";
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

/**
 * Aisha's record at Ikeja. A bursar with full access sets her state of
 * residence, pension administrator, PIN, tax ID and rent; a role that may read
 * pay but not change PAYE sees her state greyed and never sends one; an
 * override needs its reason, and clearing it sends the clearing alone.
 */
const aisha: EmployeeSalary = {
  id: 31, name: "Aisha Bello", structure_id: null, structure_name: null, employee_id: 77,
  branch_id: 19, branch_name: "Ikeja Branch", gross_amount: 30_000_000, paye_amount: 0,
  pension_amount: 0, net_amount: 30_000_000, cost_center: null, is_active: true,
  residence_state: "LA", residence_state_name: "Lagos", pfa_id: null, pfa_name: null,
  tax_id: "", pension_pin: "", annual_rent: 0, paye_override: null, paye_override_reason: "",
} as EmployeeSalary;

const PAYE_READ_ONLY = { "finance.salary": { hidden: [], read_only: ["annual_rent", "paye_amount", "paye_override", "paye_override_reason", "tax_id"], open_on_create: [] } };

describe("a salary record's statutory details", () => {
  const flat = { name: "Aisha Bello", structure: null, gross_amount: 30_000_000, paye_amount: 0, pension_amount: 0 };

  it("sends the details that changed for a role that may change pay", () => {
    expect(salaryChanges(aisha, { ...flat, residence_state: "OG", pfa: 9, pension_pin: "PEN100", tax_id: "TIN-1", annual_rent: 120_000_000 }, true, mayChangePay, editing))
      .toEqual({ residence_state: "OG", pfa: 9, pension_pin: "PEN100", tax_id: "TIN-1", annual_rent: 120_000_000 });
  });

  it("keeps a new state out of the body when PAYE may not be changed", () => {
    const access = withPayAliases(resolveFieldAccess(PAYE_READ_ONLY, "finance.salary"));
    expect(access.isReadOnly("residence_state")).toBe(true);
    expect(access.isReadOnly("pfa")).toBe(false);
    expect(salaryChanges(aisha, { ...flat, name: "Aisha Bello-Okoro", residence_state: "OG", pfa: 9 }, true, access, editing))
      .toEqual({ name: "Aisha Bello-Okoro", pfa: 9 });
  });

  it("sends an override with its reason, and a clearing without one", () => {
    expect(salaryChanges(aisha, { ...flat, paye_override: 2_000_000, paye_override_reason: "Tax office direction" }, true, mayChangePay, editing))
      .toEqual({ paye_override: 2_000_000, paye_override_reason: "Tax office direction" });
    const overridden = { ...aisha, paye_override: 2_000_000, paye_override_reason: "Tax office direction" } as EmployeeSalary;
    expect(salaryChanges(overridden, { ...flat, paye_override: null, paye_override_reason: "" }, true, mayChangePay, editing))
      .toEqual({ paye_override: null });
    expect(salaryChanges(overridden, { ...flat, paye_override: 2_000_000, paye_override_reason: "Corrected direction" }, true, mayChangePay, editing))
      .toEqual({ paye_override: 2_000_000, paye_override_reason: "Corrected direction" });
  });
});

describe("EmployeeDrawer moves and refusals", () => {
  const select = (label: string) => [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith(label))?.querySelector("select") as HTMLSelectElement;
  const setValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  };
  const branches = [{ id: 19, name: "Ikeja Branch", code: 1, is_main: true, status: "ACTIVE" }, { id: 20, name: "Lekki Branch", code: 2, is_main: false, status: "ACTIVE" }];
  const saveButton = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Save changes") || b.textContent?.includes("Add employee"))!;

  it("sends a branch move with the day it takes effect", async () => {
    mocks.fieldAccess = {};
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Updated." }) });
    act(() => root.render(<EmployeeDrawer open salary={aisha} entity="BSS" branches={branches} onClose={() => undefined} />));
    act(() => setValue(select("Branch"), "20"));
    const date = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Takes effect on"))!.querySelector("input")!;
    act(() => setValue(date, "2026-09-01"));
    expect(document.body.textContent).toContain("Ikeja Branch keeps paying them until");
    await act(async () => { saveButton().click(); });
    expect(mocks.update.mock.calls.at(-1)![0]).toEqual({ id: 31, entity: "BSS", branch: 20, effective_from: "2026-09-01" });
  });

  it("greys the state of residence for a role that may not change PAYE", () => {
    mocks.fieldAccess = PAYE_READ_ONLY;
    act(() => root.render(<EmployeeDrawer open salary={aisha} entity="BSS" branches={branches} onClose={() => undefined} />));
    expect(field("residence_state")!.disabled).toBe(true);
    expect(field("pfa")!.disabled).toBe(false);
    expect(field("tax_id")!.disabled).toBe(true);
  });

  it("keeps the refusal of a second record for somebody already paid in view", async () => {
    mocks.fieldAccess = {};
    const message = "Aisha Bello is already on the payroll at Ikeja Branch. Each person is paid by one branch: to move them, change the branch on their existing salary record instead of adding another.";
    mocks.create.mockReturnValue({ unwrap: () => Promise.reject({ status: 400, data: { error: { code: "REQUEST_ERROR", detail: { employee: [message] } } } }) });
    act(() => root.render(<EmployeeDrawer open salary={null} entity="BSS" branches={branches} onClose={() => undefined} />));
    act(() => (document.body.querySelector("[data-person-picker]") as HTMLButtonElement).click());
    const name = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Employee name"))!.querySelector("input")!;
    act(() => setValue(name, "Aisha Bello"));
    const gross = field("gross_amount")!.querySelector("input")!;
    act(() => setValue(gross, "300000"));
    act(() => setValue(select("Branch"), "20"));
    await act(async () => { saveButton().click(); });
    expect(mocks.create.mock.calls.at(-1)![0]).toMatchObject({ entity: "BSS", employee: 77, branch: 20, name: "Aisha Bello" });
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(message);
  });
});

describe("what a generated run warns about", () => {
  const run = { ...SEPT, id: 9, document_number: "PR-9" };

  it("names the joiners with no earlier pay recorded", () => {
    act(() => root.render(<GeneratedRunNotice run={{ ...run, previous_pay_missing: ["Bayo Ade", "Kemi Oke"], skipped: [] }} onOpen={() => undefined} onDismiss={() => undefined} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("2 people on it joined after January with no earlier pay recorded");
    expect(text).toContain("Bayo Ade, Kemi Oke");
  });

  it("counts them without names for a reader who may not read names", () => {
    act(() => root.render(<GeneratedRunNotice run={{ ...run, previous_pay_missing: [null], skipped: [] }} onOpen={() => undefined} onDismiss={() => undefined} />));
    expect(document.body.textContent).toContain("1 person on it joined after January");
    expect(document.body.textContent).not.toContain("null");
  });

  it("says nothing when there is nothing to say", () => {
    act(() => root.render(<GeneratedRunNotice run={{ ...run, previous_pay_missing: [], skipped: [] }} onOpen={() => undefined} onDismiss={() => undefined} />));
    expect(document.body.textContent).toBe("");
  });
});

describe("the earlier-pay list above the roster", () => {
  it("lists each person with their branch and first month, and opens their record", () => {
    const onOpen = vi.fn();
    act(() => root.render(<PreviousPayMissingBanner multiBranch onOpen={onOpen} missing={{ tax_year: 2026, required: false, people: [{ salary_id: 31, name: "Bayo Ade", branch_id: 19, branch_name: "Ikeja Branch", first_month: 4 }] }} />));
    expect(document.body.textContent).toContain("Ikeja Branch · first paid April");
    act(() => [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Bayo Ade")!.click());
    expect(onOpen).toHaveBeenCalledWith(31);
  });

  it("leaves the branch out at a school with one branch, and says a run is refused when required", () => {
    act(() => root.render(<PreviousPayMissingBanner multiBranch={false} onOpen={() => undefined} missing={{ tax_year: 2026, required: true, people: [{ salary_id: 31, name: "Bayo Ade", branch_id: 19, branch_name: "Ikeja Branch", first_month: 4 }] }} />));
    expect(document.body.textContent).not.toContain("Ikeja Branch");
    expect(document.body.textContent).toContain("a run that includes them is refused");
  });
});

/** Aisha's April line: PAYE worked out with Unity Schools' three months counted. */
const APRIL_LINE = {
  id: 51, line_no: 1, employee_id: 77, salary_id: 31, employee_name: "Aisha Bello", gross_amount: 30_000_000, paye_amount: 9_533_000,
  pension_amount: 2_400_000, net_amount: 17_317_000, other_deductions_amount: 750_000, employer_contributions_amount: 3_600_000,
  components: [], cost_center: null, branch_id: 19, branch_name: "Ikeja Branch", paye_source: "COMPUTED" as const,
  items: [
    { id: 1, kind: "DEDUCTION" as const, code: "PAYE" as const, label: "PAYE", amount: 9_533_000, basis_amount: 0, rate_bps: 0, deduction_type_id: null, liability_account_id: 1, expense_account_id: null },
    { id: 2, kind: "DEDUCTION" as const, code: "NHF" as const, label: "National Housing Fund", amount: 750_000, basis_amount: 30_000_000, rate_bps: 250, deduction_type_id: null, liability_account_id: 2, expense_account_id: null },
    { id: 3, kind: "EMPLOYER" as const, code: "NSITF" as const, label: "NSITF employee compensation", amount: 300_000, basis_amount: 30_000_000, rate_bps: 100, deduction_type_id: null, liability_account_id: 3, expense_account_id: 4 },
    { id: 4, kind: "EMPLOYER" as const, code: "ITF" as const, label: "ITF training levy", amount: 300_000, basis_amount: 30_000_000, rate_bps: 100, deduction_type_id: null, liability_account_id: 5, expense_account_id: 6 },
  ],
  tax_basis: {
    month: 4, table: { id: 1, country: "NG", tax_year: 2026, revision: 1, name: "NG PAYE 2026" },
    inputs: { gross_this_month: 30_000_000, taxable_this_month: 30_000_000, pension_this_month: 2_400_000, nhf_this_month: 750_000, annual_rent: 0, gross_before: 0, taxable_before: 0, pension_before: 0, nhf_before: 0, paye_before: 0 },
    brought_forward: { gross: 90_000_000, taxable_pay: 90_000_000, paye: 4_500_000, pension: 0, nhf: 0, employer_name: "Unity Schools Ltd" },
    reliefs: [], taxable_to_date: 120_000_000, relief_to_date: 0, chargeable_to_date: 120_000_000,
    tax_to_date: 14_033_000, excess_withheld: 0, paye_this_month: 9_533_000,
  },
};

describe("a run's lines", () => {
  afterEach(() => { mocks.run = null; mocks.openPayslip.mockReset(); });

  it("shows NHF, NSITF and ITF, how PAYE was worked out, and prints the server's payslip", () => {
    mocks.fieldAccess = {};
    mocks.run = { ...SEPT, other_deductions_total: 750_000, employer_contributions_total: 3_600_000, lines: [APRIL_LINE] };
    act(() => root.render(<RunDrawer runId={7} entity="BSS" onClose={() => undefined} />));
    const text = () => document.body.textContent ?? "";
    expect(text()).toContain("Other deductions (NHF, voluntary)");
    expect(text()).toContain("NSITF");
    act(() => [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Details")!.click());
    expect(text()).toContain("National Housing Fund");
    expect(text()).toContain("2.5% of");
    expect(text()).toContain("Earlier this tax year with Unity Schools Ltd");
    expect(text()).toContain("NG PAYE 2026 · month 4 of 12");
    act(() => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Payslip"))!.click());
    expect(mocks.openPayslip).toHaveBeenCalledWith("BSS", 7, 51);
  });

  it("hides the PAYE column, its working and the payslip from a role that may not read PAYE", () => {
    mocks.fieldAccess = { "finance.payrollrun": { hidden: ["paye_amount", "tax_basis"], read_only: [], open_on_create: [] } };
    const { paye_amount: _paye, tax_basis: _basis, ...line } = APRIL_LINE;
    mocks.run = { ...SEPT, lines: [line] };
    act(() => root.render(<RunDrawer runId={7} entity="BSS" onClose={() => undefined} />));
    const headers = [...document.body.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).not.toContain("PAYE");
    expect(buttonLabels().some((label) => label.includes("Payslip"))).toBe(false);
    act(() => [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Details")!.click());
    expect(document.body.textContent).not.toContain("How PAYE was worked out");
  });

  it("sums the statutory items of the lines held", () => {
    expect(statutoryTotals([APRIL_LINE, APRIL_LINE])).toEqual([
      { code: "NHF", label: "NHF", amount: 1_500_000 },
      { code: "NSITF", label: "NSITF", amount: 600_000 },
      { code: "ITF", label: "ITF", amount: 600_000 },
    ]);
  });

  it("offers a payslip only to a role that reads every figure on it", () => {
    expect(canPrintPayslip(resolveFieldAccess({}, "finance.payrollrun"))).toBe(true);
    expect(canPrintPayslip(resolveFieldAccess({ "finance.payrollrun": { hidden: ["components"] } }, "finance.payrollrun"))).toBe(false);
  });
});
