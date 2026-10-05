/**
 * Bright Star's April PAYE-LA return lists Aisha and Bayo with what was
 * deducted here, and the 2026 annual return shows each person's year at this
 * employer. A role that may not read every pay figure is never sent either:
 * the screen does not ask, and says why. Mrs Adeyemi is told she is shown
 * Lekki's part. A VAT return has no people behind it and no schedule.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  scheduleArgs: [] as unknown[],
  annualArgs: [] as unknown[],
  wholeSchool: true,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true, fieldAccess: mocks.fieldAccess }),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [20], covers: () => true }),
}));
vi.mock("@/redux/services/finance/payroll-api", () => ({
  useGetTaxFilingScheduleQuery: (args: unknown) => {
    mocks.scheduleArgs.push(args);
    return { data: { data: {
      obligation: "PAYE-LA", authority_name: "Lagos State Internal Revenue Service",
      rows: [
        { line_id: 1, employee_name: "Aisha Bello", tax_id: "TIN-1", pension_pin: "", pfa: "", tax_state: "Lagos", branch_id: 19, branch_name: "Ikeja Branch", pay_date: "2026-04-28", run: "PR-4", employee_amount: 9_533_000, employer_amount: 0, total: 9_533_000 },
        { line_id: 2, employee_name: "Bayo Ade", tax_id: "", pension_pin: "", pfa: "", tax_state: "Lagos", branch_id: 19, branch_name: "Ikeja Branch", pay_date: "2026-04-28", run: "PR-4", employee_amount: 3_083_000, employer_amount: 0, total: 3_083_000 },
      ],
      employee_total: 12_616_000, employer_total: 0, total: 12_616_000,
    } }, isLoading: false, isError: false };
  },
  useGetAnnualPayeReturnQuery: (args: unknown) => {
    mocks.annualArgs.push(args);
    return { data: { data: {
      year: 2026, entity: "BSS", issuer: "Bright Star School",
      rows: [{ salary_id: 41, employee_name: "Ngozi Eze", tax_id: "TIN-9", tax_states: ["Lagos"], gross: 240_000_000, taxable_pay: 240_000_000, paye: 20_220_000, pension: 0, months: 7, opening_gross: 100_000_000, opening_paye: 8_425_000 }],
      totals: { gross: 240_000_000, taxable_pay: 240_000_000, paye: 20_220_000, pension: 0, opening_gross: 100_000_000, opening_paye: 8_425_000 },
    } }, isLoading: false, isError: false };
  },
}));

import { AnnualPayeReturnDrawer, RemittanceSchedulePanel } from "./payroll-returns";
import type { TaxFiling } from "@/redux/services/finance/ops-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const filing = (obligation_type: string) => ({ id: 12, obligation_type, obligation_code: `${obligation_type}-LA` } as TaxFiling);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.scheduleArgs = [];
  mocks.annualArgs = [];
  mocks.wholeSchool = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("a payroll return's schedule", () => {
  it("lists the people behind PAYE-LA with what was deducted here", () => {
    act(() => root.render(<RemittanceSchedulePanel filing={filing("PAYE")} entity="BSS" />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("People on this return · 2");
    expect(text).toContain("Aisha Bello");
    expect(text).toContain("TIN-1");
    expect(text).toContain("Only what payroll deducted here");
    expect(mocks.scheduleArgs.at(-1)).toEqual({ entity: "BSS", id: 12 });
  });

  it("is not asked for when the role may not read every pay figure", () => {
    mocks.fieldAccess = { "finance.payrollrun": { hidden: ["paye_amount"], read_only: [], open_on_create: [] } };
    act(() => root.render(<RemittanceSchedulePanel filing={filing("PAYE")} entity="BSS" />));
    expect(document.body.textContent).toContain("your role does not see every figure on it");
    expect(document.body.textContent).not.toContain("Aisha Bello");
    expect(mocks.scheduleArgs.every((args) => typeof args === "symbol")).toBe(true);
  });

  it("is absent from a VAT return", () => {
    act(() => root.render(<RemittanceSchedulePanel filing={filing("VAT")} entity="BSS" />));
    expect(document.body.textContent).toBe("");
  });
});

describe("the annual PAYE return", () => {
  it("shows each person's year here, with the months before this payroll named", () => {
    act(() => root.render(<AnnualPayeReturnDrawer open entity="BSS" onClose={() => undefined} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Ngozi Eze");
    expect(text).toContain("before this payroll");
    expect(text).toContain("A previous employer's pay is never in it");
    expect(text).not.toContain("You are shown your branch's part");
  });

  it("tells a branch bursar they see their branch's part", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<AnnualPayeReturnDrawer open entity="BSS" onClose={() => undefined} />));
    expect(document.body.textContent).toContain("You are shown your branch's part of the return.");
  });

  it("is not asked for by a role that may not read every roster figure", () => {
    mocks.fieldAccess = { "finance.salary": { hidden: ["pension_amount"], read_only: [], open_on_create: [] } };
    act(() => root.render(<AnnualPayeReturnDrawer open entity="BSS" onClose={() => undefined} />));
    expect(document.body.textContent).toContain("your role does not see every figure on it");
    expect(mocks.annualArgs.every((args) => typeof args === "symbol")).toBe(true);
  });
});
