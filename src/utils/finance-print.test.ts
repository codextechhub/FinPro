import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BankAccount,
  BankStatementLine,
  ExpenseClaim,
  PayrollLine,
  PayrollRun,
  TaxFiling,
} from "../redux/services/finance/ops-types";
import {
  buildBankReconciliationPrintDocument,
  buildExpenseClaimPrintDocument,
  buildPayrollSchedulePrintDocument,
  buildPayslipPrintDocument,
  buildTaxFilingPackPrintDocument,
  openFinancePrintDocument,
  renderFinancePrintHtml,
} from "./finance-print";

const attack = '<img src=x onerror="globalThis.compromised=true"><script>globalThis.compromised=true</script>';

function expectAttackIsText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.body.textContent).toContain(attack);
  expect(doc.querySelector("img")).toBeNull();
  const scripts = [...doc.querySelectorAll("script")];
  expect(scripts).toHaveLength(1);
  expect(scripts[0].textContent).toContain("window.print()");
  expect(scripts[0].textContent).not.toContain("compromised");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>globalThis.compromised=true</script>");
  expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toContain("default-src 'none'");
}

const payrollRun = (line: PayrollLine): PayrollRun => ({
  id: 1,
  document_number: attack,
  pay_date: "2026-09-08",
  period_label: attack,
  branch_id: null,
  branch_name: null,
  narration: "",
  run_status: "POSTED",
  status: "POSTED",
  gross_total: 100_000,
  paye_total: 10_000,
  pension_total: 8_000,
  net_total: 82_000,
  net_total_naira: "820.00",
  bank_account_id: null,
  paye_payable_account: null,
  paye_payable_account_id: null,
  pension_payable_account: null,
  pension_payable_account_id: null,
  journal_id: null,
  disbursement_journal_id: null,
  lines: [line],
});

const payrollLine: PayrollLine = {
  id: 1,
  line_no: 1,
  employee_id: 1,
  employee_name: attack,
  gross_amount: 100_000,
  paye_amount: 10_000,
  pension_amount: 8_000,
  net_amount: 82_000,
  components: [{ name: attack, kind: "EARNING", statutory_type: "NONE", amount: 100_000 }],
  cost_center: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("finance print document rendering", () => {
  it("keeps malicious payroll schedule values as text", () => {
    expectAttackIsText(renderFinancePrintHtml(buildPayrollSchedulePrintDocument(payrollRun(payrollLine), "PAYE", "NGN")));
  });

  it("keeps malicious payslip values as text", () => {
    expectAttackIsText(renderFinancePrintHtml(buildPayslipPrintDocument(payrollRun(payrollLine), payrollLine, "NGN")));
  });

  it("keeps malicious bank reconciliation values as text", () => {
    const account = {
      id: 1,
      name: attack,
      bank_name: attack,
      gl_account: attack,
      gl_account_id: 1,
      currency: "NGN",
      is_active: true,
      is_primary: true,
      is_primary_collection: false,
      book_balance: 0,
      book_balance_naira: "0.00",
      unreconciled_count: 1,
      last_reconciled_at: null,
    } satisfies BankAccount;
    const line = {
      id: 1,
      bank_account_id: 1,
      statement_id: 1,
      txn_date: "2026-09-08",
      description: attack,
      reference: attack,
      amount: 100,
      amount_naira: "1.00",
      status: "UNMATCHED",
      matched_line_id: null,
      adjusting_journal_id: null,
      match_source: "",
      match_source_display: "",
      matched_reference: null,
      external_id: "1",
      reconciled_at: null,
      can_delete: false,
      delete_block_reason: null,
    } satisfies BankStatementLine;
    expectAttackIsText(renderFinancePrintHtml(buildBankReconciliationPrintDocument({
      account,
      currency: "NGN",
      book: 100,
      statement: 100,
      difference: 0,
      matched: [line],
      unmatched: [line],
    })));
  });

  it("keeps malicious expense claim values as text", () => {
    const claim = {
      id: 1,
      document_number: attack,
      claimant_id: 1,
      claimant_name: attack,
      claim_date: "2026-09-08",
      title: attack,
      narration: attack,
      status: "POSTED",
      payment_status: "UNPAID",
      subtotal: 100,
      tax_total: 0,
      total: 100,
      total_naira: "1.00",
      amount_paid: 0,
      balance_due: 100,
      journal_id: 1,
      approval_required: true,
      lines: [{
        id: 1,
        line_no: 1,
        description: attack,
        expense_account: attack,
        quantity: "1",
        unit_price: 100,
        tax_code: null,
        net_amount: 100,
        tax_amount: 0,
        line_total: 100,
        cost_center: attack,
        receipt_name: null,
        receipt_url: null,
      }],
    } satisfies ExpenseClaim;
    expectAttackIsText(renderFinancePrintHtml(buildExpenseClaimPrintDocument(claim, attack, "NGN")));
  });

  it("keeps malicious tax filing values as text", () => {
    const filing = {
      id: 1,
      document_number: attack,
      obligation_id: 1,
      obligation_code: attack,
      obligation_type: "VAT",
      authority_name: attack,
      liability_account: null,
      liability_account_name: null,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      due_date: "2026-09-21",
      filing_status: "FILED",
      status: "POSTED",
      gross_liability: 100,
      recoverable_amount: 0,
      adjustment_amount: 0,
      amount_due: 100,
      amount_due_naira: "1.00",
      amount_paid: 0,
      balance_due: 100,
      payment_status: "UNPAID",
      filing_reference: attack,
      filed_at: "2026-09-08",
      narration: attack,
    } satisfies TaxFiling;
    expectAttackIsText(renderFinancePrintHtml(buildTaxFilingPackPrintDocument([filing], "NGN")));
  });

  it("opens the generated document with noopener and removes any returned opener", () => {
    const popup = { opener: window };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:safe-print");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    openFinancePrintDocument(buildPayslipPrintDocument(payrollRun(payrollLine), payrollLine, "NGN"));

    expect(openSpy).toHaveBeenCalledWith(
      "blob:safe-print",
      "_blank",
      expect.stringContaining("noopener"),
    );
    expect(openSpy.mock.calls[0][2]).toContain("noreferrer");
    expect(popup.opener).toBeNull();
  });
});
