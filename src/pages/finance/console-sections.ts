// The sections each Finance console screen actually has.
//
// Same contract as the Procurement equivalent: the route table declares one path
// per section and the page maps each to a screen, so both need these lists and
// neither may drift. The pages are lazy, so importing the lists from them would
// pull their chunks into the entry bundle.
//
// Registering `:section` instead matches *any* URL, which leaves the page choosing
// what is real - a mistyped or retired section then renders the default screen
// under its own heading instead of saying the address is wrong. With only these
// declared, an unknown section matches no route and falls through to the app's own
// 404, outside the console layout.
//
// Two of these are reachable but not in the sidebar, and are listed deliberately:
// `receivables/receipts` (linked as routesPath FINANCE.RECEIPTS_ALLOCATION) and
// `reports/periods` (the fiscal close workbench). Dropping either would 404 a
// working screen.

export const SETUP_SECTIONS = [
  "entities",
  "accounts",
  "periods",
  "currencies",
  "tax-codes",
  "cost-centers",
  "dimensions",
] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];
export const DEFAULT_SETUP_SECTION: SetupSection = "entities";

export const RECEIVABLES_SECTIONS = [
  "invoices",
  "credit-notes",
  "refunds",
  "concessions",
  "payment-plans",
  "dunning",
  "customers",
  "fee-structures",
  "receipts",
] as const;
export type ReceivablesSection = (typeof RECEIVABLES_SECTIONS)[number];
export const DEFAULT_RECEIVABLES_SECTION: ReceivablesSection = "invoices";

export const COLLECTIONS_SECTIONS = ["gateway", "virtual-accounts"] as const;
export type CollectionsSection = (typeof COLLECTIONS_SECTIONS)[number];
export const DEFAULT_COLLECTIONS_SECTION: CollectionsSection = "gateway";

export const EXPENSES_SECTIONS = ["claims", "petty-cash"] as const;
export type ExpensesSection = (typeof EXPENSES_SECTIONS)[number];
export const DEFAULT_EXPENSES_SECTION: ExpensesSection = "claims";

export const BUDGETS_SECTIONS = ["budgets", "assets", "tax"] as const;
export type BudgetsSection = (typeof BUDGETS_SECTIONS)[number];
export const DEFAULT_BUDGETS_SECTION: BudgetsSection = "budgets";

export const PAYMENTS_SECTIONS = [
  "payouts",
  "batches",
  "settlement",
  "transactions",
  "webhooks",
] as const;
export type PaymentsSection = (typeof PAYMENTS_SECTIONS)[number];
export const DEFAULT_PAYMENTS_SECTION: PaymentsSection = "payouts";

export const REPORTS_SECTIONS = [
  "trial-balance",
  "income-statement",
  "balance-sheet",
  "cash-flow",
  "changes-in-equity",
  "analytics",
  "periods",
] as const;
export type ReportsSection = (typeof REPORTS_SECTIONS)[number];
export const DEFAULT_REPORTS_SECTION: ReportsSection = "trial-balance";

export const FINANCE_SETTINGS_SECTIONS = [
  "overview",
  "entities",
  "fiscal-calendar",
  "accounting",
  "documents",
  "banking-cash",
  "reference-data",
  "approvals",
] as const;
export type FinanceSettingsSection = (typeof FINANCE_SETTINGS_SECTIONS)[number];
export const DEFAULT_FINANCE_SETTINGS_SECTION: FinanceSettingsSection = "overview";
