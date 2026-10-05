/**
 * Bright Star's April PAYE-LA return lists Aisha and Bayo with what was
 * deducted here, and the 2026 annual return shows each person's year at this
 * employer. A role that may not read every pay figure is never sent either:
 * the screen does not ask, and says why. Mrs Adeyemi is told she is shown
 * Lekki's part. A VAT return has no people behind it and no schedule. Two
 * people called Kemi Ade, one at Ikeja and one at Lekki, are two rows, and each
 * says which one it is.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  scheduleArgs: [] as unknown[],
  annualArgs: [] as unknown[],
  annualRows: null as unknown[] | null,
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
      rows: mocks.annualRows ?? [{ salary_id: 41, employee_id: 7, employee_name: "Ngozi Eze", tax_id: "TIN-9", tax_states: ["Lagos"], gross: 240_000_000, taxable_pay: 240_000_000, paye: 20_220_000, pension: 0, months: 7, opening_gross: 100_000_000, opening_paye: 8_425_000 }],
      totals: { gross: 240_000_000, taxable_pay: 240_000_000, paye: 20_220_000, pension: 0, opening_gross: 100_000_000, opening_paye: 8_425_000 },
    } }, isLoading: false, isError: false };
  },
}));

import { AnnualPayeReturnDrawer, RemittanceSchedulePanel, annualRowKey, namesakeNote } from "./payroll-returns";
import type { AnnualPayeReturnRow } from "@/redux/services/finance/payroll-types";
import type { TaxFiling } from "@/redux/services/finance/ops-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const filing = (obligation_type: string) => ({ id: 12, obligation_type, obligation_code: `${obligation_type}-LA` } as TaxFiling);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.annualRows = null;
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

const person = (over: Partial<AnnualPayeReturnRow>): AnnualPayeReturnRow => ({
  salary_id: null, employee_id: null, employee_name: "Kemi Ade", tax_id: "", tax_states: ["Lagos"], gross: 120_000_000,
  taxable_pay: 120_000_000, paye: 9_000_000, pension: 0, months: 6, opening_gross: 0, opening_paye: 0, ...over,
});

describe("namesakes on the annual return", () => {
  const ikeja = person({ employee_id: 31, salary_id: 50, tax_id: "TIN-002" });
  const lekki = person({ employee_id: 32, salary_id: 51, employee_name: "kemi  ade" });
  const typed = person({ employee_name: "Bayo Ade" });

  it("key each row by the person, not the name", () => {
    expect(annualRowKey(ikeja, 0)).toBe("user-31");
    expect(annualRowKey(person({ salary_id: 51 }), 1)).toBe("salary-51");
    expect(annualRowKey(typed, 2)).toBe("typed-2-Bayo Ade-");
    expect(annualRowKey(ikeja, 0)).not.toBe(annualRowKey(lekki, 1));
  });

  it("say which person each namesake is, and say nothing for a unique name", () => {
    const rows = [ikeja, lekki, typed];
    expect(namesakeNote(ikeja, rows)).toBe("Tax ID TIN-002");
    expect(namesakeNote(lekki, rows)).toBe("On the roster, with no tax ID recorded");
    expect(namesakeNote(person({}), [person({}), person({ tax_id: "TIN-9" })])).toBe("Typed by hand on a payroll run, with no tax ID");
    expect(namesakeNote(typed, rows)).toBeNull();
  });

  it("list two people with one name as two rows, each told apart", () => {
    mocks.annualRows = [ikeja, lekki];
    act(() => root.render(<AnnualPayeReturnDrawer open entity="BSS" onClose={() => undefined} />));
    const names = [...document.body.querySelectorAll("[data-testid=annual-return] tbody tr td:first-child")].map((td) => td.textContent);
    expect(names).toEqual(["Kemi AdeTax ID TIN-002", "kemi  adeOn the roster, with no tax ID recorded", "Total"]);
  });
});
