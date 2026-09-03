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
  entity: string;
  period: string | null;
  axis: string;
  rows: AnalyticsSliceRow[];
  bucket_totals: Record<string, ReportMoney>;
  total_net: ReportMoney;
}

export interface TrialBalance {
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
export interface FiscalRunway {
  status: "HEALTHY" | "EXPIRING" | "EXPIRED";
  calendar_end: string | null;    // Last postable day; null when there are no periods at all.
  days_remaining: number | null;  // Negative once it has lapsed; null when there are no periods.
  threshold_days: number;         // The notice window the status was decided against.
}

export interface FinanceDashboard {
  entity: string;
  fiscal_year: string | null;
  period: string | null;
  as_of: string;
  fiscal_runway: FiscalRunway;
  kpis: {
    cash_position: DashboardKpi;
    receivables: DashboardKpi;
    payables: DashboardKpi;
    net_income_ytd: DashboardKpi;
  };
  revenue_vs_budget: {
    has_budget: boolean;
    budget_name: string | null;
    revenue: BudgetLineMetric;
    expense: BudgetLineMetric;
    net: { actual: ReportMoney; delta_pct: number | null };
  };
  ar_aging: {
    buckets: { key: string; pct: number; amount: ReportMoney }[];
    total: ReportMoney;
  };
  trend: { labels: string[]; issued: number[]; collected: number[] };
  top_overdue: {
    customer: string;
    customer_code: string;
    reference: string;
    amount: ReportMoney;
    days_overdue: number;
  }[];
  vendor_due: {
    vendor: string;
    reference: string;
    due_date: string;
    amount: ReportMoney;
    days_until: number;
  }[];
  approvals: { items: { label: string; count: number }[]; total: number };
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
    narration: string;
    amount: ReportMoney;
    status: string;
    created_by: string;
  }[];
}
