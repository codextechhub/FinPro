/**
 * Aisha opens My payslips. She sees her own April payslip and opens the
 * server's PDF of it; her 2026 tax summary totals only this employer's months
 * and shows Unity Schools' months apart. With nothing paid yet she is told
 * when payslips appear.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payslips: [] as unknown[],
  openPayslip: vi.fn(),
  openSummary: vi.fn(),
}));

vi.mock("@/redux/services/finance/payroll-api", () => ({
  useGetMyPayslipsQuery: () => ({ data: { data: mocks.payslips }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetMyPayslipQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useGetMyTaxSummaryQuery: () => ({ data: { data: [{
    year: 2026, employee_name: "Aisha Bello", issuer: "Bright Star School", entity: "BSS", tax_id: "TIN-1", tax_states: ["Lagos"],
    months: [{ pay_date: "2026-04-28", period_label: "April 2026", run: "PR-4", tax_state: "Lagos", paye_source: "COMPUTED", gross: 30_000_000, taxable_pay: 30_000_000, paye: 9_533_000, pension: 2_400_000, other_deductions: 750_000, net: 17_317_000 }],
    totals: { gross: 30_000_000, taxable_pay: 30_000_000, paye: 9_533_000, pension: 2_400_000, other_deductions: 750_000, net: 17_317_000 },
    opening: null,
    brought_forward: { gross: 90_000_000, taxable_pay: 90_000_000, paye: 4_500_000, pension: 0, nhf: 0, employer_name: "Unity Schools Ltd", evidence_reference: "TDC-2026-0147" },
  }] }, isLoading: false, isError: false }),
}));
vi.mock("../../utils/payroll-documents", () => ({ openMyPayslip: mocks.openPayslip, openMyTaxSummary: mocks.openSummary }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

import { MyPayslipList, MyTaxSummary } from "./my-payslips";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.payslips = [];
  mocks.openPayslip.mockReset();
  mocks.openSummary.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("My payslips", () => {
  it("lists the reader's own payslips and opens the server's PDF", () => {
    mocks.payslips = [{ id: 88, entity: "BSS", run: "PR-4", pay_date: "2026-04-28", period_label: "April 2026", branch_name: "Ikeja Branch", gross_amount: 30_000_000, paye_amount: 9_533_000, net_amount: 17_317_000, issued_at: "", email_status: "SENT" }];
    act(() => root.render(<MyPayslipList />));
    expect(document.body.textContent).toContain("April 2026");
    act(() => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("PDF"))!.click());
    expect(mocks.openPayslip).toHaveBeenCalledWith(88);
  });

  it("says when payslips appear while there are none", () => {
    act(() => root.render(<MyPayslipList />));
    expect(document.body.textContent).toContain("No payslips yet");
  });
});

describe("My tax summary", () => {
  it("totals this employer's months and shows a previous employer's apart", () => {
    act(() => root.render(<MyTaxSummary />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("This employer's year");
    expect(text).toContain("Earlier this tax year with Unity Schools Ltd");
    expect(text).toContain("not in the totals above");
    act(() => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("PDF"))!.click());
    expect(mocks.openSummary.mock.calls[0][1]).toBe("BSS");
  });
});
