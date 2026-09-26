// Financial-statement report types - mirror the JSON the vs_finance report
// views emit. Money is the `{kobo, naira}` pair these endpoints return (not a
// bare integer), so the UI can show either without re-deriving.

export interface ReportMoney {
  kobo: number;
  naira: string;
}

export interface TrialBalanceRow {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  debit: ReportMoney;
  credit: ReportMoney;
}

// Analytics slice - net activity per account, bucketed by one axis (a cost centre
// or a dimension). Reads posted journal lines, so it can answer "per bucket".
export interface AnalyticsSliceRow {
  bucket: string;
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  debit: ReportMoney;
  credit: ReportMoney;
  net: ReportMoney;
}

export interface AnalyticsSlice {
  /** True when the figures cover only the reader's branches and the school-wide entries. */
  narrowed?: boolean;
  entity: string;
  period: string | null;
  axis: string;
  rows: AnalyticsSliceRow[];
  bucket_totals: Record<string, ReportMoney>;
  total_net: ReportMoney;
}

export interface TrialBalance {
  /** True when the figures cover only the reader's branches and the school-wide entries. */
  narrowed?: boolean;
  entity: string;
  period: string | null;
  rows: TrialBalanceRow[];
  total_debit: ReportMoney;
  total_credit: ReportMoney;
  is_balanced: boolean;
}

export interface StatementLine {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  amount: ReportMoney;
}

// Income Statement (P&L) with optional Budget + Prior-year comparison columns.
// `budget`/`variance`/`prior_year` are null when that comparison isn't available.
export interface IncomeStatementLine {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  amount: ReportMoney;
  budget: ReportMoney | null;
  variance: ReportMoney | null;
  prior_year: ReportMoney | null;
}
export interface IncomeStatementTotals {
  amount: ReportMoney;
  budget: ReportMoney | null;
  variance: ReportMoney | null;
  prior_year: ReportMoney | null;
}
export interface IncomeStatement {
  /** True when the figures cover only the reader's branches and the school-wide entries. */
  narrowed?: boolean;
  entity: string;
  period: string | null;
  fiscal_year: number | null;
  prior_fiscal_year: number | null;
  has_budget: boolean;
  has_prior_year: boolean;
  income: IncomeStatementLine[];
  expense: IncomeStatementLine[];
  totals: {
    income: IncomeStatementTotals;
    expense: IncomeStatementTotals;
    net: IncomeStatementTotals;
  };
}

export interface ArAgingRow {
  customer_id: number;
  code: string;
  name: string;
  buckets: Record<string, ReportMoney>;
  outstanding: ReportMoney;
  unallocated_credit: ReportMoney;
  net: ReportMoney;
}

export interface ArAging {
  /** True when the figures cover only the reader's branches and the school-wide entries. */
  narrowed?: boolean;
  entity: string;
  as_of: string;
  rows: ArAgingRow[];
  bucket_totals: Record<string, ReportMoney>;
  total_net: ReportMoney;
}

// Balance Sheet grouped into IFRS Statement-of-Financial-Position sections.
export interface BalanceSheetGroup {
  line: string;
  label: string;
  amount: ReportMoney;
  accounts: { account_id: number; code: string; name: string; amount: ReportMoney }[];
}
export interface BalanceSheetSection {
  key: string;   // non_current_assets | current_assets | equity | non_current_liabilities | current_liabilities
  label: string;
  total: ReportMoney;
  groups: BalanceSheetGroup[];
}
export interface BalanceSheet {
  /** True when the figures cover only the reader's branches and the school-wide entries. */
  narrowed?: boolean;
  entity: string;
  as_of: string;
  sections: BalanceSheetSection[];
  total_assets: ReportMoney;
  total_liabilities: ReportMoney;
  total_equity: ReportMoney;
  retained_earnings: ReportMoney;   // current-year (unclosed) earnings
  is_balanced: boolean;
  difference: ReportMoney;
}

export interface CashFlowLine {
  account_id: number;
  code: string;
  name: string;
  amount: ReportMoney;   // credit − debit on the non-cash leg: + = cash in, − = cash out
}
export interface CashFlow {
  /** True when the figures cover only the reader's branches and the school-wide entries. */
  narrowed?: boolean;
  entity: string;
  period: string | null;
  opening_cash: ReportMoney;
  closing_cash: ReportMoney;
  by_activity: Record<string, ReportMoney>;
  activity_lines: Record<string, CashFlowLine[]>;   // operating | investing | financing
  net_change: ReportMoney;
  is_reconciled: boolean;
}

export interface EquityColumn {
  key: string;
  label: string;
  code: string;
  account_id: number;
  opening: ReportMoney;
  profit: ReportMoney;
  contributions: ReportMoney;
  closing: ReportMoney;
}

export interface ChangesInEquity {
  /** True when the figures cover only the reader's branches and the school-wide entries. */
  narrowed?: boolean;
  entity: string;
  period: string | null;
  as_of: string;
  columns: EquityColumn[];
  total_opening: ReportMoney;
  total_profit: ReportMoney;
  total_contributions: ReportMoney;
  total_closing: ReportMoney;
  balance_sheet_equity: ReportMoney;
  is_reconciled: boolean;
}

export interface ReportParams {
  entity: string;
  period?: string | number;
  as_of?: string;
}

// ── Finance overview dashboard (aggregated) ──────────────────────────────────
export interface DashboardKpi {
  value: ReportMoney;
  delta_pct: number | null;
  spark: number[];
}

export interface BudgetLineMetric {
  actual: ReportMoney;
  plan: ReportMoney;
  pct_of_plan: number | null;
}

/**
 * How much fiscal calendar the entity has left. Periods are created a year at a
 * time, and when the last one's end date passes with no new year created, every
 * posting in the entity fails at once - so the backend reads the runway ahead of
 * that date. Always read as of today, even on a dashboard pinned to a past period.
 */
/**
 * A span the window-aware cards read. `billed_for` counts the fees billed for a
 * billing period (a school's term) whenever they were paid; `dates` counts what
 * was invoiced and received between `start` and `end`.
 */
export interface DashboardWindow {
  key: string;
  label: string;
  name: string;
  start: string;
  end: string;
  basis: "billed_for" | "dates";
}

export interface FiscalRunway {
  status: "HEALTHY" | "EXPIRING" | "EXPIRED";
  calendar_end: string | null;    // Last postable day; null when there are no periods at all.
  days_remaining: number | null;  // Negative once it has lapsed; null when there are no periods.
  threshold_days: number;         // The notice window the status was decided against.
}

/**
 * The Finance overview as one reader may see it.
 *
 * The endpoint opens to anyone working in finance and computes each block only
 * for a reader who holds the key behind it, so every block may be `null`: absent,
 * not empty. `narrowed` says every figure covers only the reader's branches and
 * the school-wide entries, ledger figures included; the budget and the period
 * close are then always `null`, because both belong to the school as a whole.
 */
export interface FinanceDashboard {
  entity: string;
  /** Whose books these are: a school's get school words and a term window. */
  books: "school" | "general";
  /** The reader's first name, for the greeting; null when the account has none. */
  reader_first_name: string | null;
  /** The span the window-aware cards read, and every span on offer (default first). */
  window: DashboardWindow;
  windows: { key: string; label: string; name: string }[];
  collections: {
    billed: ReportMoney | null;
    invoice_count: number | null;
    collected: ReportMoney | null;
    rate_pct: number | null;
  } | null;
  channels: {
    total: ReportMoney;
    receipts: number;
    items: { key: string; label: string; amount: ReportMoney; receipts: number; pct: number | null }[];
  } | null;
  /** Per-branch comparison; null for a branch reader and for a one-branch school. */
  branches: {
    branch_id: number | null;
    name: string | null;
    billed: ReportMoney;
    collected: ReportMoney;
    rate_pct: number | null;
    overdue: ReportMoney;
  }[] | null;
  bank_accounts: {
    id: number;
    name: string;
    bank_name: string;
    balance: ReportMoney;
    unmatched_lines: number;
    unmatched_amount: ReportMoney;
    last_reconciled: string | null;
    /** Month-end balances over the same window as the headline tiles, oldest first. */
    spark: number[];
  }[] | null;
  /** The school's plan line by line, with how much of the year has gone. */
  budget: {
    budget_name: string;
    year_elapsed_pct: number;
    lines: { label: string; kind: "income" | "expense"; actual: ReportMoney; plan: ReportMoney; pct: number | null }[];
  } | null;
  top_payers: {
    customer_id: number;
    name: string;
    code: string;
    branch: string | null;
    amount: ReportMoney;
    invoices: number;
    days_overdue: number;
  }[] | null;
  /** Payers owing, overdue and falling due within 7 days (counts of payers). */
  receivables_summary: {
    owing_payers: number;
    overdue_payers: number;
    overdue_amount: ReportMoney;
    oldest_days_overdue: number | null;
    due_soon_payers: number;
    due_soon_amount: ReportMoney;
  } | null;
  /** Things to act on, most urgent first; each appears only for its key holders. */
  attention: {
    key: string;
    tone: "urgent" | "warning" | "info";
    title: string;
    detail: string;
    count: number;
    amount: ReportMoney | null;
  }[];
  /** Money due in or out over the next 30 days, soonest first. */
  upcoming: {
    date: string;
    kind: "payroll" | "instalments" | "vendor_bills" | "tax";
    direction: "in" | "out";
    title: string;
    detail: string;
    amount: ReportMoney;
  }[];
  payables_due: {
    due_count: number;
    due_amount: ReportMoney;
    overdue_count: number;
    overdue_amount: ReportMoney;
  } | null;
  fiscal_year: string | null;
  period: string | null;
  as_of: string;
  narrowed: boolean;
  fiscal_runway: FiscalRunway;
  kpis: {
    cash_position: DashboardKpi | null;
    receivables: DashboardKpi | null;
    payables: DashboardKpi | null;
    net_income_ytd: DashboardKpi | null;
  };
  revenue_vs_budget: {
    has_budget: boolean;
    budget_name: string | null;
    revenue: BudgetLineMetric;
    expense: BudgetLineMetric;
    net: { actual: ReportMoney; delta_pct: number | null };
  } | null;
  ar_aging: {
    buckets: { key: string; pct: number; amount: ReportMoney }[];
    total: ReportMoney;
  } | null;
  /** A series the reader may not read is `null`, never a row of zeros. */
  trend: { labels: string[]; issued: number[] | null; collected: number[] | null } | null;
  top_overdue: {
    customer: string;
    customer_code: string;
    reference: string;
    amount: ReportMoney;
    days_overdue: number;
  }[] | null;
  vendor_due: {
    vendor: string;
    reference: string;
    due_date: string;
    amount: ReportMoney;
    days_until: number;
  }[] | null;
  approvals: { items: { label: string; count: number }[]; total: number } | null;
  close_progress: {
    period: string;
    done: number;
    total: number;
    checks: { name: string; passed: boolean; blocking: boolean }[];
  } | null;
  recent_journals: {
    document_number: string;
    date: string;
    source: string;
    /** The document that raised the journal. */
    kind: "receipt" | "invoice" | "payroll" | "manual" | "other";
    narration: string;
    amount: ReportMoney;
    status: string;
    created_by: string;
  }[] | null;
}
