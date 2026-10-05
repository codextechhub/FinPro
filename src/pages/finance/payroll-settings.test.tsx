/**
 * Bright Star's payroll policy. Mrs Bello, who covers the whole school, switches
 * NHF off, raises employer pension from 10% to 12%, turns payslip email off and
 * says payroll moved here on 1 June 2026: the save carries exactly those four
 * changes. Mrs Adeyemi, who keeps Lekki's books only, reads the same policy
 * greyed and is told why.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), wholeSchool: true }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true, fieldAccess: {} }),
}));
vi.mock("../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [20], covers: () => mocks.wholeSchool }),
}));
vi.mock("@/redux/services/finance/payroll-api", () => ({
  useUpdateFinancePayrollSettingsMutation: () => [mocks.update, { isLoading: false }],
  useGetFinancePayrollSettingsQuery: () => ({ data: undefined, isLoading: true }),
  useGetPayrollDeductionTypesQuery: () => ({ data: { data: [] }, isLoading: false }),
  useCreatePayrollDeductionTypeMutation: () => [vi.fn(), { isLoading: false }],
  useUpdatePayrollDeductionTypeMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/components/settings/settings-layout", () => ({
  SettingsPanel: ({ title, children }: { title?: string; children: ReactNode }) => <section><h3>{title}</h3>{children}</section>,
  SettingsRow: ({ label }: { label: string }) => <p>{label}</p>,
  SettingsSectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
  SettingsConsumer: () => null,
  SettingsAuditHistory: () => null,
  PolicyBadge: () => null,
}));
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: (props: { value?: string; disabled?: boolean; "aria-label"?: string; onChange?: (event: { target: { value: string } }) => void }) => (
    <input aria-label={props["aria-label"]} disabled={props.disabled} value={props.value ?? ""} onChange={(event) => props.onChange?.({ target: { value: event.target.value } })} />
  ),
}));
vi.mock("@/components/ui/switch", () => ({
  Switch: (props: { checked: boolean; disabled?: boolean; "aria-label"?: string; onCheckedChange: (checked: boolean) => void }) => (
    <input type="checkbox" role="switch" aria-label={props["aria-label"]} checked={props.checked} disabled={props.disabled} onChange={(event) => props.onCheckedChange(event.target.checked)} />
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PayrollSettingsForm, payrollSettingsChanges, percentToBps } from "./payroll-settings";
import type { FinancePayrollSettingsValues } from "@/redux/services/finance/payroll-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED: FinancePayrollSettingsValues = {
  paye_method: "COMPUTED", paye_method_label: "Computed from the national tax table", tax_country: "NG",
  employee_pension_enabled: true, employee_pension_rate_bps: 800, employer_pension_enabled: true, employer_pension_rate_bps: 1000,
  nhf_enabled: true, nhf_rate_bps: 250, nsitf_enabled: true, nsitf_rate_bps: 100, itf_enabled: true, itf_rate_bps: 100,
  payslip_in_app: true, payslip_email: true, previous_pay_required: false, payroll_moved_here_on: null,
  updated_at: null, updated_by: null,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.update.mockReset();
  mocks.wholeSchool = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const byLabel = (label: string) => document.body.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const setValue = (element: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};
const saveButton = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Save payroll settings"))!;

describe("the payroll policy form", () => {
  it("saves only what changed", async () => {
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Saved." }) });
    act(() => root.render(<PayrollSettingsForm entityCode="BSS" values={SAVED} consumers={{}} canUpdate readOnlyReason={null} />));
    expect(saveButton().disabled).toBe(true);
    act(() => byLabel("National Housing Fund (NHF)").click());
    act(() => setValue(byLabel("Employer pension rate"), "12"));
    act(() => byLabel("Email payslips").click());
    act(() => setValue(byLabel("Payroll moved here on"), "2026-06-01"));
    await act(async () => { saveButton().click(); });
    expect(mocks.update.mock.calls[0][0]).toEqual({
      entity: "BSS", nhf_enabled: false, employer_pension_rate_bps: 1200, payslip_email: false, payroll_moved_here_on: "2026-06-01",
    });
  });

  it("greys everything for a reader who keeps one branch's books, and says why", () => {
    act(() => root.render(<PayrollSettingsForm entityCode="BSS" values={SAVED} consumers={{}} canUpdate={false}
      readOnlyReason="The payroll policy binds every branch, so only someone who covers the whole school may change it." />));
    expect(byLabel("Earlier pay required").disabled).toBe(true);
    expect(byLabel("Where PAYE comes from").hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("only someone who covers the whole school may change it");
    expect(saveButton().disabled).toBe(true);
  });

  it("refuses a rate outside 0 to 100%", () => {
    act(() => root.render(<PayrollSettingsForm entityCode="BSS" values={SAVED} consumers={{}} canUpdate readOnlyReason={null} />));
    act(() => setValue(byLabel("ITF training levy rate"), "120"));
    expect(document.body.textContent).toContain("Use a rate from 0 to 100%.");
    expect(saveButton().disabled).toBe(true);
  });
});

describe("rates and changes", () => {
  it("reads a percentage as basis points", () => {
    expect(percentToBps("2.5")).toBe(250);
    expect(percentToBps("12")).toBe(1200);
    expect(percentToBps("")).toBeNull();
    expect(percentToBps("101")).toBeNull();
  });

  it("drops what matches the saved policy", () => {
    expect(payrollSettingsChanges(SAVED, { nhf_enabled: true, previous_pay_required: true, payroll_moved_here_on: null })).toEqual({ previous_pay_required: true });
  });
});
