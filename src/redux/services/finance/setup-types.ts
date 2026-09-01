// Setup / master-data + close types - mirror the vs_finance serializers.

export interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  is_contra: boolean;
  is_postable: boolean;
  is_active: boolean;
  parent_id: number | null;
  parent_code: string | null;
  subtype: string;
  // Present only on the chart-of-accounts (?with_balance=true) response.
  balance?: { kobo: number; naira: string } | null;
  tag?: "CONTROL" | "CASH" | null;
}

export interface AccountActivityLine {
  date: string;
  journal_no: string;
  source: string;
  description: string;
  cost_center: string;
  debit: { kobo: number; naira: string };
  credit: { kobo: number; naira: string };
  running_balance: { kobo: number; naira: string };
}

export interface AccountDetail {
  account: Account;
  type_label: string;
  summary: {
    current_balance: { kobo: number; naira: string };
    opening_balance: { kobo: number; naira: string };
    line_count: number;
    journal_count: number;
    fiscal_year_start: string | null;
    as_of: string;
  };
  activity: AccountActivityLine[];
}

export interface ConsolidatedAccountActivityLine {
  id: number;
  date: string;
  account_id: number;
  account_code: string;
  account_name: string;
  journal_no: string;
  source: string;
  description: string;
  cost_center: string;
  debit: { kobo: number; naira: string };
  credit: { kobo: number; naira: string };
}

export interface ConsolidatedAccountActivityTotals {
  debit: { kobo: number; naira: string };
  credit: { kobo: number; naira: string };
  net_movement: { kobo: number; naira: string };
}

export interface FiscalPeriod {
  id: number;
  period_no: number;
  name: string;
  fiscal_year: number;
  start_date: string;
  end_date: string;
  status: "OPEN" | "SOFT_CLOSED" | "CLOSED" | "LOCKED";
  closed_at: string | null;
}

export interface StartedFiscalYear {
  fiscal_year: {
    id: number;
    year: number;
    start_date: string;
    end_date: string;
    status: string;
  };
  periods: FiscalPeriod[];
}

/** A period reduced to what a date picker needs: when it is, and why it's blocked. */
export interface PeriodBrief {
  id: number;
  name: string;
  period_no: number;
  status: FiscalPeriod["status"];
  start_date: string;
  end_date: string;
}

/**
 * Which dates the entity will accept a posting on right now - GET
 * /finance/posting-window/. The read-side mirror of the backend's
 * `ensure_period_open` guard, so a date a picker offers is one the guard accepts.
 *
 * `default_date` is null when the entity has no open period at all; that is a real
 * state (nothing can be posted until finance opens one), not a loading blip.
 */
export interface PostingWindow {
  today: string;
  today_is_open: boolean;
  default_date: string | null;
  default_period: PeriodBrief | null;
  open: PeriodBrief[];
  blocked: PeriodBrief[];
}

export interface ChecklistItem {
  name: string;
  passed: boolean;
  blocking: boolean;
  detail: string;
}

export interface PeriodChecklist {
  period: FiscalPeriod;
  passed: boolean;
  done: number;
  total: number;
  items: ChecklistItem[];
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  minor_unit: number;
  is_active: boolean;
}

export interface FxRate {
  id: number;
  base: string;
  quote: string;
  rate: string;
  as_of: string;
  source: string;
}

export interface TaxCode {
  id: number;
  code: string;
  name: string;
  rate_bps: number;
  is_recoverable: boolean;
  collected_account: string | null;
  paid_account: string | null;
  is_active: boolean;
}

export interface CostCenter {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  parent_code: string | null;
  is_active: boolean;
}

// Analytical axis (e.g. FUND, PROJECT) with a constrained value list, tagged on
// journal lines and sliced by the analytics-slice report.
export interface Dimension {
  id: number;
  code: string;
  name: string;
  allowed_values: string[];
  is_active: boolean;
}

export interface FinanceAuditLog {
  id: number;
  action: string;
  action_display: string;
  status: string;
  actor: string | null;
  target_type: string;
  target_id: number | null;
  document_number: string | null;
  message: string;
  // Field-level snapshot of the audited change; the UI summarises the diff.
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  created_at: string;
}

export interface SettingConsumer {
  service: string;
  consumer: string;
  impact: string;
}

export interface FinanceAccountMapping {
  key: string;
  label: string;
  expected_account_type: string;
  default_code: string;
  source: "DEFAULT" | "OVERRIDE";
  account: Pick<Account, "id" | "code" | "name" | "account_type" | "is_active" | "is_postable"> | null;
  is_valid: boolean;
}

export interface FinanceAccountSettings {
  mappings: FinanceAccountMapping[];
  consumers: Record<string, SettingConsumer>;
  account_options: Pick<Account, "id" | "code" | "name" | "account_type">[];
  history: FinanceAuditLog[];
}

export interface FinanceDocumentBankOption {
  id: number;
  name: string;
  bank_name: string;
  currency: string;
}

export interface FinanceDocumentSettingsValues {
  default_invoice_due_days: number;
  default_invoice_narration: string;
  auto_post_manual_invoices: boolean;
  allow_customer_opening_balances: boolean;
  primary_collection_bank_account: FinanceDocumentBankOption | null;
  bank_account_options: FinanceDocumentBankOption[];
  updated_at: string | null;
  updated_by: string | null;
}

export interface FinanceDocumentSettingsPayload {
  settings: FinanceDocumentSettingsValues;
  consumers: Record<string, SettingConsumer>;
  history: FinanceAuditLog[];
}

export interface FinanceBankingSettingsValues {
  default_bank_reconciliation_tolerance_days: number;
  default_group_reconciliation_matches: boolean;
  default_receipt_allocation_strategy: "oldest" | "largest";
  default_receipt_allocation_strategy_label: string;
  petty_cash_low_balance_threshold_bps: number;
  updated_at: string | null;
  updated_by: string | null;
}

export interface FinanceBankingSettingsPayload {
  settings: FinanceBankingSettingsValues;
  consumers: Record<string, SettingConsumer>;
  history: FinanceAuditLog[];
}

// Distinct filter options for the entity's audit trail (drives the dropdowns).
export interface FinanceAuditFacets {
  actors: { id: number; email: string }[];
  target_types: string[];
  actions: { value: string; label: string }[];
}

export interface CloseChecklistItem {
  name: string;
  passed: boolean;
  blocking: boolean;
  detail: string;
}

export interface PeriodCloseResult {
  period: FiscalPeriod;
  checklist: { passed: boolean; items: CloseChecklistItem[] };
}
