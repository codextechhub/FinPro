/**
 * Kemi's previous employer deducted N200,000 where N45,000 was due. Her April
 * working shows nothing deducted and the excess still to be used up. A line
 * whose PAYE was set by hand says so, with the reason; a supplied line says
 * where its figure came from and shows no table working.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PayeWorkingView, ratePercent } from "./payroll-working";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const inputs = { gross_this_month: 30_000_000, taxable_this_month: 30_000_000, pension_this_month: 2_400_000, nhf_this_month: 0, annual_rent: 0, gross_before: 0, taxable_before: 0, pension_before: 0, nhf_before: 0, paye_before: 0 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("how PAYE was worked out", () => {
  it("shows an over-deduction elsewhere being used up, never refunded", () => {
    act(() => root.render(<PayeWorkingView line={{ paye_source: "COMPUTED", paye_source_label: "Computed from the national tax table", paye_amount: 0, tax_basis: {
      month: 4, inputs, brought_forward: { gross: 90_000_000, taxable_pay: 90_000_000, paye: 20_000_000, pension: 0, nhf: 0, employer_name: "Crest Academy" },
      tax_to_date: 14_033_000, paye_this_month: 0, excess_withheld: 5_967_000, reliefs: [],
    } }} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Earlier this tax year with Crest Academy");
    expect(text).toContain("Deducted beyond the tax due so far");
    expect(text).toContain("payroll does not refund tax");
  });

  it("names a hand override and its reason", () => {
    act(() => root.render(<PayeWorkingView line={{ paye_source: "OVERRIDE", paye_source_label: "Overridden on the employee's salary", paye_amount: 2_000_000, tax_basis: { month: 4, inputs, override: { amount: 2_000_000, reason: "Tax office direction", computed: 3_083_000 } } }} />));
    expect(document.body.textContent).toContain("Reason: Tax office direction");
    expect(document.body.textContent).toContain("PAYE: Overridden on the employee's salary");
  });

  it("says where a supplied figure came from, with no table working", () => {
    act(() => root.render(<PayeWorkingView line={{ paye_source: "SUPPLIED", paye_source_label: "Taken from the salary structure or roster", paye_amount: 2_000_000, tax_basis: {} }} />));
    expect(document.body.textContent).toContain("Taken from the salary structure or roster");
    expect(document.body.textContent).toContain("No table working is kept");
  });

  it("shows the server's words for a line's PAYE source, and none of its own", () => {
    act(() => root.render(<PayeWorkingView line={{ paye_source: "MANUAL", paye_source_label: "Typed on a hand-raised run", paye_amount: 1_000_000, tax_basis: {} }} />));
    expect(document.body.textContent).toContain("PAYE: Typed on a hand-raised run");
    act(() => root.render(<PayeWorkingView line={{ paye_source: "MANUAL", paye_amount: 1_000_000, tax_basis: {} }} />));
    expect(document.body.textContent).not.toContain("PAYE:");
  });

  it("writes a rate as a percentage", () => {
    expect(ratePercent(250)).toBe("2.5%");
    expect(ratePercent(1000)).toBe("10%");
  });
});
