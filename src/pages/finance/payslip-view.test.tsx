/**
 * Aisha's April payslip keeps two employers apart: this employer's year to
 * date, and Unity Schools' months under their own heading. Ngozi's June
 * payslip at a school that moved its payroll here shows the months before
 * this payroll as this employer's own.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PayslipContentView } from "./payslip-view";
import type { PayslipContent } from "@/redux/services/finance/payroll-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APRIL: PayslipContent = {
  issuer: "Bright Star School", document_number: "PR-4/1", employee_name: "Aisha Bello", period_label: "April 2026", pay_date: "28 Apr 2026",
  branch: "Ikeja Branch", tax_id: "TIN-1", tax_state: "Lagos", pfa: "", pension_pin: "",
  earnings: [{ name: "Basic", amount: "₦300,000.00" }], deductions: [{ name: "PAYE", amount: "₦95,330.00" }], employer: [{ name: "NSITF employee compensation", amount: "₦3,000.00" }],
  gross: "₦300,000.00", total_deductions: "₦95,330.00", net: "₦204,670.00", paye_source: "Computed from the national tax table", tax_table: "NG PAYE 2026",
  ytd: { gross: "₦300,000.00", paye: "₦95,330.00", pension: "₦0.00", net: "₦204,670.00" },
  brought_forward: { employer_name: "Unity Schools Ltd", gross: "₦900,000.00", taxable_pay: "₦900,000.00", paye: "₦45,000.00", pension: "₦0.00" },
  opening: null,
  figures: { gross: 0, paye: 0, pension: 0, other_deductions: 0, employer_contributions: 0, net: 0, brought_forward: null, opening: null },
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("a payslip on screen", () => {
  it("shows a previous employer's months apart from this employer's year to date", () => {
    act(() => root.render(<PayslipContentView content={APRIL} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("This employer, year to date");
    expect(text).toContain("Earlier this tax year with Unity Schools Ltd");
    expect(text).toContain("never in the year to date above");
    expect(text).not.toContain("Before this payroll");
  });

  it("shows this school's months before its payroll ran here as its own", () => {
    act(() => root.render(<PayslipContentView content={{ ...APRIL, brought_forward: null, opening: { gross: "₦1,000,000.00", taxable_pay: "₦1,000,000.00", paye: "₦84,250.00", pension: "₦0.00" } }} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Before this payroll");
    expect(text).toContain("They are in the year to date above");
    expect(text).not.toContain("Earlier this tax year");
  });
});
