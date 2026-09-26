// Finance operations types (banking, expenses, petty cash, payroll, budgets,
// fixed assets, tax) - mirror the vs_finance serializers. Money is kobo. A field
// under a Field Access switch is optional, because it is absent for a caller who
// cannot read it; a detail response lists the present ones the caller cannot
// change in `_read_only_fields`.

// ── Banking ──────────────────────────────────────────────────────────────────
export interface BankAccount {
  id: number;
  name: string;
  bank_name: string;
  account_number?: string; // Field Access: finance.bankaccount
  gl_account: string;
  gl_account_name?: string;
  gl_account_id: number;
  currency: string | null;
  is_active: boolean;
  is_primary: boolean;
  is_primary_collection: boolean;
  book_balance: number;
  book_balance_naira: string;
  unreconciled_count: number;
  last_reconciled_at: string | null;
  _read_only_fields?: string[];
}

export interface BankTransaction {
  id: number;
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  running_balance: number;
  matched: boolean;
}

export interface BankBookLine {
  id: number;
  date: string;
  description: string;
  reference: string;
  amount: number; // signed kobo (debit − credit)
}

export interface BankStatement {
  id: number;
  statement_date: string;
  period_label: string;
  opening_balance: number;
  opening_balance_naira: string;
  closing_balance: number;
  closing_balance_naira: string;
  line_count: number;
  status: string;
  status_display: string;
  can_edit: boolean;
  edit_block_reason: string | null;
}

export interface BankReconciliationRun {
  id: number;
  as_of_date: string;
  book_balance: number;
  book_balance_naira: string;
  statement_balance: number;
  statement_balance_naira: string;
  difference: number;
  difference_naira: string;
  matched_count: number;
  status: string;
  status_display: string;
  performed_by_name: string | null;
  created_at: string;
}

export interface BankAccountDetail extends BankAccount {
  metrics: { book_balance: number; statement_balance: number; unreconciled_diff: number; unreconciled_count: number };
  transactions: BankTransaction[];
  statements: BankStatement[];
  reconciliations: BankReconciliationRun[];
}

export interface BankStatementLine {
  id: number;
  bank_account_id: number;
  statement_id: number | null;
  txn_date: string;
  description: string;
  reference: string;
  amount: number;
  amount_naira: string;
  status: string;
  matched_line_id: number | null;
  adjusting_journal_id: number | null;
  match_source: string;
  match_source_display: string;
  matched_reference: string | null;
  external_id: string;
  reconciled_at: string | null;
  can_delete: boolean;
  delete_block_reason: string | null;
}

export interface BankStatementDetail extends BankStatement {
  lines: BankStatementLine[];
}

// ── Expense claims ───────────────────────────────────────────────────────────
export interface ExpenseClaimLine {
  id: number;
  line_no: number;
  description: string;
  expense_account: string;
  quantity: string;
  unit_price: number;
  tax_code: string | null;
  net_amount: number;
  tax_amount: number;
  line_total: number;
  cost_center: string | null;
  receipt_name: string | null;
  receipt_url: string | null;
}

export interface ExpenseClaim {
  id: number;
  document_number: string;
  claimant_id: number | null;
  claimant_name: string;
  claim_date: string;
  title: string;
  narration: string;
  status: string;
  payment_status: string;
  subtotal: number;
  tax_total: number;
  total: number;
  total_naira: string;
  amount_paid: number;
  balance_due: number;
  journal_id: number | null;
  approval_required: boolean;
  lines: ExpenseClaimLine[];
}

// ── Petty cash ───────────────────────────────────────────────────────────────
export interface PettyCashFund {
  id: number;
  name: string;
  gl_account: string;
  gl_account_id: number;
  custodian_id: number | null;
  custodian_name: string;
  custodian_label: string;
  float_amount: number;
  float_amount_naira: string;
  current_balance: number;
  current_balance_naira: string;
  shortfall: number;
  currency: string | null;
  last_replenished_at: string | null;
  is_active: boolean;
}

export interface PettyCashMovement {
  id: number;
  date: string;
  description: string;
  category: string;
  in: number;
  out: number;
  balance: number;
}
export interface PettyCashFundDetail extends PettyCashFund {
  spent_this_week: number;
  register: PettyCashMovement[];
}
export interface PettyCashVoucher {
  id: number;
  document_number: string;
  fund_id: number;
  voucher_date: string;
  payee: string;
  spent_by_id: number | null;
  narration: string;
  reference: string;
  status: string;
  subtotal: number;
  tax_total: number;
  total: number;
  total_naira: string;
  journal_id: number | null;
  expense_account: string | null;
}

// ── Payroll (Field Access on per-employee figures) ───────────────────────────
// A computed payslip line item (snapshot copied from the salary structure).
export interface PayslipComponent {
  name: string;
  kind: "EARNING" | "DEDUCTION";
  statutory_type: "NONE" | "PAYE" | "PENSION";
  amount: number; // kobo
}

export interface PayrollLine {
  id: number;
  line_no: number;
  employee_id: number | null;
  employee_name?: string; // Field Access: finance.payrollrun
  gross_amount?: number; // Field Access: finance.payrollrun
  paye_amount?: number; // Field Access: finance.payrollrun
  pension_amount?: number; // Field Access: finance.payrollrun
  net_amount?: number; // Field Access: finance.payrollrun
  components?: PayslipComponent[]; // Field Access: finance.payrollrun
  cost_center: string | null;
  _read_only_fields?: string[];
}

export interface EmployeeSalary {
  id: number;
  name: string;
  structure_id: number | null;
  structure_name: string | null;
  // Which branch the person works at. Deliberately not under Field Access:
  // it is not a pay figure, and whoever assigns branches before a school can
  // switch to per-branch payroll has to be able to read it. Null means
  // unassigned, which is the state that blocks that switch.
  branch_id: number | null;
  branch_name: string | null;
  gross_amount?: number; // Field Access: finance.salary
  paye_amount?: number; // Field Access: finance.salary (derived when a structure is set)
  pension_amount?: number; // Field Access: finance.salary
  net_amount?: number; // Field Access: finance.salary
  components?: PayslipComponent[]; // Field Access: finance.salary
  cost_center: string | null;
  is_active: boolean;
  _read_only_fields?: string[];
}

// ── Salary structures (reusable pay templates) ───────────────────────────────
export type SalaryComponentKind = "EARNING" | "DEDUCTION";
export type SalaryCalcMethod = "FIXED" | "PERCENT_OF_GROSS" | "PERCENT_OF_BASIC";
export type StatutoryType = "NONE" | "PAYE" | "PENSION";

export interface SalaryComponent {
  id?: number;
  name: string;
  kind: SalaryComponentKind;
  calc_method: SalaryCalcMethod;
  rate_bps: number; // basis points (4000 = 40%)
  amount: number; // kobo, for FIXED
  is_basic: boolean;
  statutory_type: StatutoryType;
  sequence: number;
}

export interface SalaryStructure {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  components: SalaryComponent[];
  employee_count: number;
}
export interface PayrollRun {
  id: number;
  document_number: string;
  pay_date: string;
  period_label: string;
  // Which branch the run covers. Null is a central run over the whole entity -
  // the shape every run had before per-branch payroll existed - so null and
  // "a branch I cannot read" are deliberately different answers.
  branch_id: number | null;
  branch_name: string | null;
  narration: string;
  run_status: string;
  status: string;
  gross_total: number;
  paye_total: number;
  pension_total: number;
  net_total: number;
  net_total_naira: string;
  bank_account_id: number | null;
  paye_payable_account: string | null; // GL code (e.g. "2310")
  paye_payable_account_id: number | null;
  pension_payable_account: string | null;
  pension_payable_account_id: number | null;
  journal_id: number | null;
  disbursement_journal_id: number | null;
  lines: PayrollLine[];
}

// ── Budgets ──────────────────────────────────────────────────────────────────
export interface BudgetLine {
  id: number;
  account: string;
  account_id: number;
  cost_center: string | null;
  period_no: number;
  amount: number;
}

export interface FiscalYear {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

export interface Budget {
  id: number;
  code: string;
  name: string;
  fiscal_year: number;
  fiscal_year_id: number;
  status: string;
  is_locked: boolean;
  approved_at: string | null;
  lines: BudgetLine[];
  /** The branch whose plan this is; null for the school's own plan. */
  branch_id: number | null;
  branch_name: string | null;
  /** Whether the reader may change it. A branch-bound reader may read the
   *  school's plan but not change it. */
  can_manage?: boolean;
  /** Headline figures the list enriches each budget with. The actual and
   *  consumed figures are null where the reader sees the plan only: the
   *  school's plan, read by a branch-bound reader (see BudgetVariance). */
  budgeted_total?: number;
  actual_ytd?: number | null;
  consumed_pct?: number | null;
}

/** Whose plan the reader may create: the school's, and which branches'. */
export interface BudgetFiling {
  school: boolean;
  branches: { id: number; name: string }[];
}

// Payload for creating/replacing budget cells (account × cost-centre × period).
export interface BudgetLineInput {
  account: string;
  cost_center?: string;
  period_no: number;
  amount: number;
}

export interface KoboNaira { kobo: number; naira: string }

export interface BudgetVarianceRow {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  budget: KoboNaira;
  actual: KoboNaira | null;
  variance: KoboNaira | null;
}
/**
 * A budget set against the ledger.
 *
 * A branch's plan is measured against that branch's own journals and comes with
 * its actuals. The school's plan is measured against the whole ledger, so a
 * branch-bound reader of it (`narrowed`) gets the plan with every actual and
 * variance `null`: the school's actuals would show them other branches' money,
 * and their own against the whole plan would read as a shortfall that is only
 * the other branches' share. Rows for accounts the plan does not cover are left
 * out too.
 */
export interface BudgetVariance {
  budget_id: number;
  fiscal_year_id: number;
  period_no: number | null;
  narrowed?: boolean;
  rows: BudgetVarianceRow[];
  total_budget: KoboNaira;
  total_actual: KoboNaira | null;
  total_variance: KoboNaira | null;
}

export interface BudgetHeatmapCell { period_no: number; budget: number; actual: number | null }
export interface BudgetHeatmapRow {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  cells: BudgetHeatmapCell[];
  budget_total: number;
  actual_total: number | null;
}
/** The plan per account and period; actuals are `null` when `narrowed` (see BudgetVariance). */
export interface BudgetHeatmap {
  budget_id: number;
  fiscal_year_id: number;
  periods: { period_no: number; label: string }[];
  narrowed?: boolean;
  rows: BudgetHeatmapRow[];
  total_budget: number;
  total_actual: number | null;
}

// ── Fixed assets ─────────────────────────────────────────────────────────────
export interface DepreciationScheduleRow {
  id: number;
  seq: number;
  depreciation_date: string;
  amount: number;
  is_posted: boolean;
  journal_id: number | null;
  posted_at: string | null;
}

export interface FixedAsset {
  id: number;
  document_number: string;
  name: string;
  asset_code: string;
  category: string;
  category_display: string;
  acquisition_date: string;
  cost: number;
  cost_naira: string;
  salvage_value: number;
  useful_life_months: number;
  method: string;
  method_display: string;
  asset_status: string;
  status: string;
  accumulated_depreciation: number;
  net_book_value: number;
  depreciable_base: number;
  acquisition_journal_id: number | null;
  disposal_date: string | null;
  disposal_journal_id: number | null;
  schedule: DepreciationScheduleRow[];
}

// Run-depreciation preview: the compound journal a period run will post.
export interface DepreciationPreviewLine { account: string; name: string; amount: number }
export interface DepreciationPreview {
  debits: DepreciationPreviewLine[];
  credits: DepreciationPreviewLine[];
  total: number;
  asset_count: number;
}

// ── Tax ──────────────────────────────────────────────────────────────────────
export interface TaxObligation {
  id: number;
  code: string;
  name: string;
  obligation_type: string;
  liability_account: string;
  authority_name: string;
  frequency: string;
  filing_day: number;
  is_active: boolean;
}

export interface TaxFiling {
  id: number;
  document_number: string;
  obligation_id: number;
  obligation_code: string;
  obligation_type: string;
  authority_name: string;
  liability_account: string | null;
  liability_account_name: string | null;
  period_start: string;
  period_end: string;
  due_date: string | null;
  filing_status: string;
  status: string;
  gross_liability: number;
  recoverable_amount: number;
  adjustment_amount: number;
  amount_due: number;
  amount_due_naira: string;
  amount_paid: number;
  balance_due: number;
  payment_status: string;
  filing_reference: string;
  filed_at: string | null;
  narration: string;
}
