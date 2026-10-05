/**
 * Aisha joined Ikeja on 1 April 2026 after three months at Unity Schools Ltd,
 * which paid her N900,000 taxable and deducted N45,000 PAYE (tax deduction card
 * TDC-2026-0147). Her salary record records that as earlier pay:
 *
 *   1. a new record sends the source, year, employer, figures and reference;
 *   2. Bayo, straight from university, is recorded as zeros with one click;
 *   3. a correction sends only what changed, and a refusal because a draft run
 *      still holds her stays in view;
 *   4. a role that may not read PAYE never sees or sends the PAYE figure, and
 *      an auditor with no pay switch sees that a record exists and no figure;
 *   5. a move entered in July for September reads as still to come.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  create: vi.fn(),
  update: vi.fn(),
  records: [] as unknown[],
  history: [] as unknown[],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));
vi.mock("@/redux/services/finance/payroll-api", () => ({
  useCreatePayBroughtForwardMutation: () => [mocks.create, { isLoading: false }],
  useUpdatePayBroughtForwardMutation: () => [mocks.update, { isLoading: false }],
  useDeletePayBroughtForwardMutation: () => [vi.fn(), { isLoading: false }],
  useGetPayBroughtForwardQuery: () => ({ data: { data: mocks.records }, isLoading: false, isError: false }),
  useGetSalaryHistoryQuery: () => ({ data: { data: mocks.history }, isLoading: false, isError: false }),
  useGetEmployeeDeductionsQuery: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  useGetPayrollDeductionTypesQuery: () => ({ data: { data: [] } }),
  useCreateEmployeeDeductionMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateEmployeeDeductionMutation: () => [vi.fn(), { isLoading: false }],
  useStopEmployeeDeductionMutation: () => [vi.fn(), { isLoading: false }],
  useGetSalaryTaxSummaryQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("../../lib/display-prefs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/display-prefs")>();
  return { ...original, useDates: () => ({ ...original.useDates(), today: () => "2026-07-10" }) };
});
vi.mock("../../utils/payroll-documents", () => ({ openSalaryTaxSummary: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EarlierPayForm, EarlierPayPanel, HistoryPanel, earlierPayChanges, isNilRecord, pendingVersions } from "./payroll-record";
import type { EmployeeSalary } from "@/redux/services/finance/ops-types";
import type { PayBroughtForward, SalaryVersion } from "@/redux/services/finance/payroll-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AISHA = {
  id: 31, name: "Aisha Bello", structure_id: null, structure_name: null, branch_id: 19, branch_name: "Ikeja Branch",
  cost_center: null, is_active: true,
} as EmployeeSalary;

const UNITY: PayBroughtForward = {
  id: 5, salary_id: 31, tax_year: 2026, source: "PREVIOUS_EMPLOYER", employer_name: "Unity Schools Ltd",
  evidence_reference: "TDC-2026-0147", brought_forward_gross_amount: 90_000_000, brought_forward_taxable_pay: 90_000_000,
  brought_forward_paye_amount: 4_500_000, brought_forward_pension_amount: 0, brought_forward_nhf_amount: 0,
  created_by: "bello@brightstar.example.com", updated_by: "bello@brightstar.example.com", created_at: "", updated_at: "",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.records = [];
  mocks.history = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const setValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
};
const inputIn = (label: string) => [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith(label))!.querySelector("input, select") as HTMLInputElement;
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent === text)!;
const ok = (message: string) => ({ unwrap: () => Promise.resolve({ message }) });

describe("recording earlier pay", () => {
  it("sends the previous employer, the figures and the reference", async () => {
    mocks.create.mockReturnValue(ok("Earlier pay recorded."));
    act(() => root.render(<EarlierPayForm salary={AISHA} entity="BSS" record={null} onDone={() => undefined} />));
    expect(inputIn("Tax year").value).toBe("2026");
    act(() => setValue(inputIn("Previous employer"), "Unity Schools Ltd"));
    act(() => setValue(inputIn("Taxable pay"), "900000"));
    act(() => setValue(inputIn("Gross pay"), "900000"));
    act(() => setValue(inputIn("PAYE deducted"), "45000"));
    act(() => setValue(inputIn("Evidence reference"), "TDC-2026-0147"));
    await act(async () => { button("Record").click(); });
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      entity: "BSS", salaryId: 31, tax_year: 2026, source: "PREVIOUS_EMPLOYER", employer_name: "Unity Schools Ltd",
      brought_forward_gross_amount: 90_000_000, brought_forward_taxable_pay: 90_000_000, brought_forward_paye_amount: 4_500_000,
      evidence_reference: "TDC-2026-0147",
    });
  });

  it("asks for the employer once a figure is entered", () => {
    act(() => root.render(<EarlierPayForm salary={AISHA} entity="BSS" record={null} onDone={() => undefined} />));
    act(() => setValue(inputIn("Gross pay"), "900000"));
    expect(button("Record").disabled).toBe(true);
  });

  it("records zeros for somebody with no previous employer", async () => {
    mocks.create.mockReturnValue(ok("Earlier pay recorded."));
    act(() => root.render(<EarlierPayForm salary={{ ...AISHA, id: 32, name: "Bayo Ade" }} entity="BSS" record={null} onDone={() => undefined} />));
    await act(async () => { button("No previous employer").click(); });
    expect(mocks.create.mock.calls[0][0]).toEqual({ entity: "BSS", salaryId: 32, tax_year: 2026, source: "PREVIOUS_EMPLOYER" });
  });

  it("names no employer for the school's own earlier months", () => {
    act(() => root.render(<EarlierPayForm salary={AISHA} entity="BSS" record={null} onDone={() => undefined} />));
    act(() => setValue(inputIn("Where it was earned"), "THIS_EMPLOYER"));
    expect([...document.body.querySelectorAll("label")].some((l) => l.textContent?.startsWith("Previous employer"))).toBe(false);
    expect(document.body.textContent).not.toContain("No previous employer");
  });
});

describe("correcting earlier pay", () => {
  it("sends only the PAYE that changed", async () => {
    mocks.update.mockReturnValue(ok("Earlier pay corrected."));
    act(() => root.render(<EarlierPayForm salary={AISHA} entity="BSS" record={UNITY} onDone={() => undefined} />));
    act(() => setValue(inputIn("PAYE deducted"), "60000"));
    await act(async () => { button("Save correction").click(); });
    expect(mocks.update.mock.calls[0][0]).toEqual({ entity: "BSS", id: 5, brought_forward_paye_amount: 6_000_000 });
  });

  it("keeps the refusal in view while a draft run holds the person", async () => {
    const message = "Draft payroll run PR-0012 already works out Aisha Bello's PAYE for 2026 on the figures held now. Void it and raise it again after this change, so it is priced on the corrected figures.";
    mocks.update.mockReturnValue({ unwrap: () => Promise.reject({ status: 400, data: { error: { detail: { tax_year: [message] } } } }) });
    act(() => root.render(<EarlierPayForm salary={AISHA} entity="BSS" record={UNITY} onDone={() => undefined} />));
    act(() => setValue(inputIn("PAYE deducted"), "60000"));
    await act(async () => { button("Save correction").click(); });
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(message);
  });

  it("never sends a figure the role may not read", () => {
    const { brought_forward_paye_amount: _hidden, ...withoutPaye } = UNITY;
    const access = { writableOnly: <T extends object>(body: T) => body };
    const body = earlierPayChanges(withoutPaye, {
      brought_forward_gross_amount: 90_000_000, brought_forward_taxable_pay: 90_000_000, brought_forward_paye_amount: 0,
      brought_forward_pension_amount: 0, brought_forward_nhf_amount: 0, employer_name: "Unity Schools Ltd", evidence_reference: "TDC-2026-0147",
    }, access);
    expect(body).toEqual({});
  });
});

describe("reading earlier pay", () => {
  it("shows every figure but PAYE to a role without PAYE read", () => {
    mocks.fieldAccess = { "finance.salary": { hidden: ["brought_forward_paye_amount", "paye_amount"], read_only: [], open_on_create: [] } };
    const { brought_forward_paye_amount: _hidden, ...withoutPaye } = UNITY;
    mocks.records = [withoutPaye];
    act(() => root.render(<EarlierPayPanel salary={AISHA} entity="BSS" />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Unity Schools Ltd");
    expect(text).toContain("Taxable pay");
    expect(text).not.toContain("PAYE deducted");
  });

  it("tells an auditor with no pay switch that a record exists, and no figure", () => {
    const names = ["brought_forward_gross_amount", "brought_forward_taxable_pay", "brought_forward_paye_amount", "brought_forward_pension_amount", "brought_forward_nhf_amount"];
    mocks.fieldAccess = { "finance.salary": { hidden: names, read_only: [], open_on_create: [] } };
    mocks.records = [{ ...UNITY, brought_forward_gross_amount: undefined, brought_forward_taxable_pay: undefined, brought_forward_paye_amount: undefined, brought_forward_pension_amount: undefined, brought_forward_nhf_amount: undefined }];
    act(() => root.render(<EarlierPayPanel salary={AISHA} entity="BSS" />));
    expect(document.body.textContent).toContain("Recorded. Your role does not show its figures.");
    expect(document.body.textContent).not.toContain("₦");
  });

  it("reads a record of zeros as none", () => {
    expect(isNilRecord({ ...UNITY, employer_name: "", brought_forward_gross_amount: 0, brought_forward_taxable_pay: 0, brought_forward_paye_amount: 0 })).toBe(true);
    expect(isNilRecord(UNITY)).toBe(false);
  });
});

describe("pay history", () => {
  const version = (over: Partial<SalaryVersion>): SalaryVersion => ({
    id: 1, effective_from: "1900-01-01", branch_id: 19, branch_name: "Ikeja Branch", structure_id: null, structure_name: null,
    gross_amount: 30_000_000, paye_amount: 0, pension_amount: 0, cost_center: null, residence_state: null, reason: "",
    created_by: null, created_at: "", ...over,
  });

  it("marks a move entered ahead as still to come", () => {
    const move = version({ id: 2, effective_from: "2026-09-01", branch_id: 20, branch_name: "Lekki Branch", created_by: "bello@brightstar.example.com", reason: "Moves to Lekki" });
    expect(pendingVersions([version({}), move], "2026-07-10")).toEqual([move]);
    mocks.history = [version({}), move];
    act(() => root.render(<HistoryPanel salary={AISHA} entity="BSS" multiBranch />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Moves to Lekki Branch on");
    expect(text).toContain("Until then Ikeja Branch pays them");
    expect(text).toContain("bello@brightstar.example.com");
    expect(text).toContain("The start");
  });

  it("leaves the branch out at a school with one branch, and a hidden figure out everywhere", () => {
    mocks.fieldAccess = { "finance.salary": { hidden: ["gross_amount"], read_only: [], open_on_create: [] } };
    mocks.history = [version({ gross_amount: undefined }), version({ id: 2, effective_from: "2027-01-01", gross_amount: undefined, reason: "Annual review" })];
    act(() => root.render(<HistoryPanel salary={AISHA} entity="BSS" multiBranch={false} />));
    const headers = [...document.body.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).not.toContain("Branch");
    expect(headers).not.toContain("Gross");
    expect(document.body.textContent).toContain("New terms take effect on");
  });
});
