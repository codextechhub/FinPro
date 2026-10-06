/**
 * Statutory payroll shapes, as `vs_finance`'s statutory payroll endpoints send
 * them: salary history, voluntary deductions, pay brought forward, payslips,
 * tax summaries, remittance schedules, the annual PAYE return and the payroll
 * settings.
 *
 * Every figure is integer kobo. A figure marked "Field Access" is absent from
 * the payload when the reader's role may not read it, so each is optional; a
 * screen leaves it out rather than showing a zero.
 */

import type { PayrollRun } from "./ops-types";
import type { ChoiceOption, FinanceAuditLog, SettingConsumer } from "./setup-types";

/** Where a person's PAYE figure on a line came from. */
export type PayeSource = "COMPUTED" | "OVERRIDE" | "SUPPLIED" | "MANUAL";

/** A tenant's PAYE policy: worked out from the national tax table, or supplied. */
export type PayeMethod = "COMPUTED" | "SUPPLIED";

/** One deduction or employer contribution on a payroll line. */
export interface PayrollLineItem {
  id: number;
  kind: "DEDUCTION" | "EMPLOYER";
  code: "PAYE" | "PENSION" | "NHF" | "VOLUNTARY" | "EMPLOYER_PENSION" | "NSITF" | "ITF";
  label: string;
  amount: number;
  /** What a rate was applied to (pensionable, basic or gross pay); 0 for a flat item. */
  basis_amount: number;
  rate_bps: number;
  deduction_type_id: number | null;
  liability_account_id: number | null;
  expense_account_id: number | null;
}

/** A year to date as a PAYE working records it. */
export interface PayeYearFigures {
  gross: number;
  taxable_pay: number;
  paye: number;
  pension: number;
  nhf: number;
}

/** How one line's PAYE was worked out (`tax_basis`), cumulatively over the tax year. */
export interface PayeWorking {
  method?: string;
  tax_year?: number;
  /** The payroll month's number in the tax year, 1 to 12. */
  month?: number;
  table?: { id: number; country: string; tax_year: number; revision: number; name: string };
  bands?: { lower: number; upper: number | null; rate_bps: number }[];
  minimum_tax_rate_bps?: number;
  exempt_income_threshold?: number;
  inputs?: {
    gross_this_month: number;
    taxable_this_month: number;
    pension_this_month: number;
    nhf_this_month: number;
    annual_rent: number;
    gross_before: number;
    taxable_before: number;
    pension_before: number;
    nhf_before: number;
    paye_before: number;
  };
  reliefs?: { code: string; name: string; amount: number }[];
  taxable_to_date?: number;
  relief_to_date?: number;
  chargeable_to_date?: number;
  exempt?: boolean;
  minimum_tax_applied?: boolean;
  tax_to_date?: number;
  /** What a previous employer deducted beyond the tax due so far, still to be used up. */
  excess_withheld?: number;
  paye_this_month?: number;
  /** A previous employer's months of the year, counted but never this employer's. */
  brought_forward?: PayeYearFigures & { employer_name?: string; evidence_reference?: string };
  /** This employer's own months before its payroll ran here. */
  opening?: PayeYearFigures & { evidence_reference?: string };
  /** A hand override on the salary record, which replaced the computed figure. */
  override?: { amount: number; reason: string; computed: number };
}

/** One dated version of a person's pay terms. */
export interface SalaryVersion {
  id: number;
  effective_from: string;
  branch_id: number | null;
  branch_name: string | null;
  structure_id: number | null;
  structure_name: string | null;
  gross_amount?: number; // Field Access: finance.salary
  paye_amount?: number; // Field Access: finance.salary
  pension_amount?: number; // Field Access: finance.salary
  cost_center: string | null;
  residence_state: string | null;
  reason: string;
  created_by: string | null;
  created_at: string;
}

/** A state PAYE is remitted to. National data, read by anyone in finance. */
export interface PayrollTaxState {
  id: number;
  country: string;
  code: string;
  name: string;
  authority_name: string;
  is_active: boolean;
}

/** A pension fund administrator. National data, read by anyone in finance. */
export interface PensionFundAdministrator {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

/** A tenant's kind of voluntary deduction (a staff loan, cooperative savings). */
export interface PayrollDeductionType {
  id: number;
  code: string;
  name: string;
  liability_account: string;
  liability_account_id: number;
  is_active: boolean;
}

/** One person's voluntary deduction; its amount and limit are their pay breakdown. */
export interface EmployeeDeduction {
  id: number;
  salary_id: number;
  deduction_type_id: number;
  deduction_type_code: string;
  deduction_type_name: string;
  amount?: number; // Field Access: finance.salary components
  start_date: string | null;
  end_date: string | null;
  total_limit?: number | null; // Field Access: finance.salary components
  reference: string;
  is_active: boolean;
}

/** Whose months a record of pay brought forward holds. */
export type PayBroughtForwardSource = "PREVIOUS_EMPLOYER" | "THIS_EMPLOYER";

/** A person's pay brought forward into a tax year. Each figure follows the
 *  switch of the same figure of their pay: gross and taxable with Gross pay,
 *  PAYE with PAYE, pension with Pension, NHF with Pay breakdown. */
export interface PayBroughtForward {
  id: number;
  salary_id: number;
  tax_year: number;
  source: PayBroughtForwardSource;
  employer_name: string;
  evidence_reference: string;
  brought_forward_gross_amount?: number;
  brought_forward_taxable_pay?: number;
  brought_forward_paye_amount?: number;
  brought_forward_pension_amount?: number;
  brought_forward_nhf_amount?: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  _read_only_fields?: string[];
}

/** The body that records or corrects pay brought forward. */
export interface PayBroughtForwardBody {
  tax_year?: number;
  source?: PayBroughtForwardSource;
  employer_name?: string;
  evidence_reference?: string;
  brought_forward_gross_amount?: number;
  brought_forward_taxable_pay?: number;
  brought_forward_paye_amount?: number;
  brought_forward_pension_amount?: number;
  brought_forward_nhf_amount?: number;
}

/** Who joined after January with no earlier pay recorded for a tax year. */
export interface PreviousPayMissing {
  tax_year: number;
  /** Whether the school refuses to pay them until it is recorded. */
  required: boolean;
  people: {
    salary_id: number;
    name: string;
    branch_id: number | null;
    branch_name: string | null;
    /** The payroll month (1 to 12) they were, or will be, first paid in. */
    first_month: number;
  }[];
}

/** A payslip in the reader's own list. */
export interface MyPayslip {
  id: number;
  entity: string;
  run: string;
  pay_date: string;
  period_label: string;
  branch_name: string | null;
  gross_amount: number;
  paye_amount: number;
  net_amount: number;
  issued_at: string;
  email_status: string;
}

/** Earlier figures as a payslip prints them: formatted text. */
export interface PayslipEarlierText {
  gross: string;
  taxable_pay: string;
  paye: string;
  pension: string;
  employer_name?: string;
}

/** Earlier figures as kobo, beside the text a payslip prints. */
export interface PayslipEarlierFigures {
  gross: number;
  taxable_pay: number;
  paye: number;
  pension: number;
  employer_name?: string;
  evidence_reference?: string;
}

/** Everything a payslip shows, as the server's own PDF prints it. */
export interface PayslipContent {
  issuer: string;
  document_number: string;
  employee_name: string;
  period_label: string;
  pay_date: string;
  branch: string;
  tax_id: string;
  tax_state: string;
  pfa: string;
  pension_pin: string;
  earnings: { name: string; amount: string }[];
  deductions: { name: string; amount: string }[];
  employer: { name: string; amount: string }[];
  gross: string;
  total_deductions: string;
  net: string;
  paye_source: string;
  tax_table: string;
  /** This employer's year to date, including its own months before this payroll. */
  ytd: { gross: string; paye: string; pension: string; net: string };
  /** A previous employer's months of the year, never added to the year to date. */
  brought_forward: PayslipEarlierText | null;
  /** This employer's own months before its payroll ran here. */
  opening: PayslipEarlierText | null;
  figures: {
    gross: number;
    paye: number;
    pension: number;
    other_deductions: number;
    employer_contributions: number;
    net: number;
    brought_forward: PayslipEarlierFigures | null;
    opening: PayslipEarlierFigures | null;
  };
}

/** Earlier pay as a tax summary carries it. */
export interface TaxSummaryEarlier {
  gross: number;
  taxable_pay: number;
  paye: number;
  pension: number;
  nhf: number;
  employer_name: string;
  evidence_reference: string;
}

/** One person's tax year on one set of books. */
export interface TaxSummary {
  year: number;
  employee_name: string;
  issuer: string;
  entity: string;
  tax_id: string;
  tax_states: string[];
  months: {
    pay_date: string;
    period_label: string;
    run: string;
    tax_state: string;
    paye_source: PayeSource;
    gross: number;
    taxable_pay: number;
    paye: number;
    pension: number;
    other_deductions: number;
    net: number;
  }[];
  /** This employer's year: the months paid here plus its own months before this payroll. */
  totals: { gross: number; taxable_pay: number; paye: number; pension: number; other_deductions: number; net: number };
  opening: TaxSummaryEarlier | null;
  brought_forward: TaxSummaryEarlier | null;
}

/** The people behind one payroll return. */
export interface RemittanceSchedule {
  obligation: string;
  authority_name: string;
  rows: {
    line_id: number;
    employee_name: string;
    tax_id: string;
    pension_pin: string;
    pfa: string;
    tax_state: string;
    branch_id: number | null;
    branch_name: string;
    pay_date: string;
    run: string;
    employee_amount: number;
    employer_amount: number;
    total: number;
  }[];
  employee_total: number;
  employer_total: number;
  total: number;
}

/**
 * Each person's year for the employer's annual PAYE return, one row per person.
 *
 * A person is told apart by their user account (`employee_id`), then their
 * salary record (`salary_id`), then, for a hand-typed line naming neither, the
 * name and tax number as typed (both ids null). Two people who share a name are
 * two rows.
 */
export type AnnualPayeReturnRow = AnnualPayeReturn["rows"][number];

export interface AnnualPayeReturn {
  year: number;
  entity: string;
  issuer: string;
  rows: {
    salary_id: number | null;
    /** The person's user account; null for someone known only by salary record or typed by hand. */
    employee_id: number | null;
    employee_name: string;
    tax_id: string;
    tax_states: string[];
    gross: number;
    taxable_pay: number;
    paye: number;
    pension: number;
    months: number;
    /** The part of gross and PAYE from this employer's months before this payroll. */
    opening_gross: number;
    opening_paye: number;
  }[];
  totals: { gross: number; taxable_pay: number; paye: number; pension: number; opening_gross: number; opening_paye: number };
}

/** The payroll policy of one set of books. Rates are basis points (800 is 8%). */
export interface FinancePayrollSettingsValues {
  paye_method: PayeMethod;
  paye_method_label: string;
  paye_method_options: ChoiceOption<PayeMethod>[];
  tax_country: string;
  employee_pension_enabled: boolean;
  employee_pension_rate_bps: number;
  employer_pension_enabled: boolean;
  employer_pension_rate_bps: number;
  nhf_enabled: boolean;
  nhf_rate_bps: number;
  nsitf_enabled: boolean;
  nsitf_rate_bps: number;
  itf_enabled: boolean;
  itf_rate_bps: number;
  payslip_in_app: boolean;
  payslip_email: boolean;
  previous_pay_required: boolean;
  /** `YYYY-MM-DD`, or null when payroll has always run here. */
  payroll_moved_here_on: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface FinancePayrollSettingsPayload {
  settings: FinancePayrollSettingsValues;
  consumers: Record<string, SettingConsumer>;
  history: FinanceAuditLog[];
}

/** A partial payroll settings write. */
export type FinancePayrollSettingsBody = Partial<Omit<FinancePayrollSettingsValues, "paye_method_label" | "paye_method_options" | "updated_at" | "updated_by">>;

/** The statutory details a salary record's create and edit accept. A state or
 *  PFA is named by id or code; `null` or "" clears it. */
export interface SalaryStatutoryBody {
  residence_state?: string | null;
  pfa?: number | null;
  tax_id?: string;
  pension_pin?: string;
  annual_rent?: number;
  /** PAYE in kobo used in place of the computed figure on every run until cleared (null). */
  paye_override?: number | null;
  paye_override_reason?: string;
}

/** A run raised from the roster, with who it left off and who it warns about. */
export type GeneratedPayrollRun = PayrollRun & {
  /** People a live run of the period already pays; the name is null for a reader who may not read names. */
  skipped?: { name: string | null; run: string | number }[];
  /** Joiners after January with no earlier pay recorded; a name is null for a reader who may not read names. */
  previous_pay_missing?: (string | null)[];
};
