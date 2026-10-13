/**
 * The finance dashboards follow the Field Access switches that close a card.
 *
 * Ngozi, the proprietor of Holy Cross, is sent every block. Mr Bello, the
 * bursar, is sent the same payload minus the cards his administrator closed
 * for his role: a closed card is a key that is missing, where a card his
 * permission keys withhold is `null`. A missing card leaves no shell, no
 * placeholder and no gap: the cards beside it fill the row, the headline tiles
 * share the row between them, and a close check his role may not read is not
 * counted in the close progress.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FinanceDashboard as Dashboard, ReceivablesDashboard, SpendDashboard,
} from "@/redux/services/finance/reports-types";
import { BankAccountsCard } from "./dashboard-cards";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  dashboard: null as unknown,
  receivables: null as unknown,
  spend: null as unknown,
  search: "",
}));

const holds = (code: PermissionCode) => mocks.held.has(FINANCE_PERMISSION_REGISTRY[code]);

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: holds,
    hasAnyPermission: (...codes: PermissionCode[]) => codes.some(holds),
    hasAllPermissions: (...codes: PermissionCode[]) => codes.every(holds),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(mocks.search), vi.fn()],
}));

vi.mock("./finance-shell", () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/layout/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN", entity: null, isLoading: false }),
}));

vi.mock("@/redux/services/finance/reports-api", () => ({
  useGetFinanceDashboardQuery: () => ({ data: { data: mocks.dashboard }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetReceivablesDashboardQuery: () => ({ data: { data: mocks.receivables }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetSpendDashboardQuery: () => ({ data: { data: mocks.spend }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetPeriodsQuery: () => ({ data: { data: [] } }),
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useGetBudgetRollupQuery: () => ({ data: undefined }),
}));

import FinanceDashboard from "./dashboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const kpi = (kobo: number) => ({ value: money(kobo), delta_pct: null, spark: [0, kobo] });
const TERM = { key: "term", label: "This term", name: "First Term 2026/2027", start: "2026-08-17", end: "2026-11-15", basis: "billed_for" as const };
const MONTH = { key: "month", label: "This month", name: "September 2026", start: "2026-09-01", end: "2026-09-26", basis: "dates" as const };

const CHECKS = [
  { name: "trial_balance_balanced", passed: true, blocking: true },
  { name: "no_draft_journals", passed: false, blocking: true },
  { name: "ar_reconciled", passed: true, blocking: true },
];

/** The overview as Ngozi is sent it. */
const FULL: Dashboard = {
  entity: "HOLYCROSS", fiscal_year: "2026", period: "2026-09", period_label: "September 2026", as_of: "2026-09-26",
  books: "school", reader_first_name: null, window: TERM,
  windows: [TERM],
  narrowed: false,
  fiscal_runway: { status: "HEALTHY", calendar_end: "2026-12-31", days_remaining: 96, threshold_days: 60 },
  kpis: { cash_position: kpi(31_500_000), receivables: kpi(1_113_000_000), payables: kpi(5_000), net_income_ytd: kpi(900_000) },
  collections: { billed: money(100), invoice_count: 1, collected: money(50), rate_pct: 50 },
  channels: { total: money(100), receipts: 3, items: [{ key: "ONLINE", label: "Online", amount: money(100), receipts: 3, pct: 100 }] },
  branches: null,
  bank_accounts: [{ id: 1, name: "GTBank collections", bank_name: "Guaranty Trust Bank", balance: money(100), unmatched_lines: 0, unmatched_amount: money(0), last_reconciled: null, spark: [50, 100] }],
  budget: null,
  top_payers: [{ customer_id: 1, name: "Tunde Okoro", code: "CU-1", branch: null, amount: money(32_000), invoices: 2, days_overdue: 12 }],
  receivables_summary: { owing_payers: 4, overdue_payers: 1, overdue_amount: money(32_000), oldest_days_overdue: 12, due_soon_payers: 0, due_soon_amount: money(0) },
  attention: [{ key: "bank_lines", tone: "warning", title: "Unmatched bank lines", detail: "3 lines", count: 3, amount: money(1_000) }],
  upcoming: [{ date: "2026-09-28", kind: "payroll", direction: "out", title: "September payroll", detail: "24 staff", amount: money(100) }],
  payables_due: { due_count: 2, due_amount: money(100), overdue_count: 0, overdue_amount: money(0) },
  revenue_vs_budget: null,
  ar_aging: { buckets: [{ key: "current", pct: 100, amount: money(1_089_000_000) }], total: money(1_089_000_000) },
  trend: { labels: ["Sep 26"], issued: [1], collected: [1] },
  top_overdue: null, vendor_due: null, approvals: null,
  close_progress: { period: "2026-09", period_label: "September 2026", done: 2, total: 3, checks: CHECKS },
  recent_journals: [{ document_number: "JV-1", date: "2026-09-20", source: "manual", kind: "manual", narration: "Rent", amount: money(100), status: "POSTED", created_by: "Ngozi" }],
};

/** The overview with these keys missing, the way a closed card arrives. */
const without = (...keys: string[]): Dashboard => {
  const copy: Record<string, unknown> = { ...FULL, kpis: { ...FULL.kpis } };
  for (const key of keys) {
    if (key.startsWith("kpis.")) delete (copy.kpis as Record<string, unknown>)[key.slice(5)];
    else delete copy[key];
  }
  return copy as unknown as Dashboard;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.held = new Set();
  mocks.search = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderPage = (extra: Partial<{ dashboard: unknown; receivables: unknown; spend: unknown; search: string }>, ...keys: string[]) => {
  mocks.held = new Set(keys);
  mocks.dashboard = extra.dashboard ?? null;
  mocks.receivables = extra.receivables ?? null;
  mocks.spend = extra.spend ?? null;
  mocks.search = extra.search ?? "";
  act(() => root.render(<FinanceDashboard />));
  return container.textContent ?? "";
};

const gridOf = (heading: string) => {
  const title = Array.from(container.querySelectorAll("h2")).find((h) => h.textContent?.includes(heading));
  return title?.closest(".grid");
};

describe("the overview with cards a Field Access switch closed", () => {
  it("draws every card for a reader sent every block", () => {
    const text = renderPage({ dashboard: FULL }, "finance.report.view");

    for (const present of ["Cash & bank", "Payables", "Billed vs collected", "Needs your attention", "Receivables aging",
      "Cash by account", "Most overdue payers", "Coming up in 30 days", "Recent postings", "September 2026 close",
      "Fiscal year runway"]) {
      expect(text).toContain(present);
    }
  });

  it("leaves out a closed trend and a closed attention list, with no placeholder", () => {
    const text = renderPage({ dashboard: without("trend", "attention") }, "finance.report.view");

    expect(text).not.toContain("Billed vs collected");
    expect(text).not.toContain("Needs your attention");
    expect(text).not.toContain("Nothing needs you right now");
    expect(text).toContain("Receivables aging");
  });

  it("keeps the attention card for a role whose keys leave it empty", () => {
    const text = renderPage({ dashboard: { ...FULL, attention: [], trend: null } }, "finance.report.view");

    expect(text).toContain("Needs your attention");
    expect(text).toContain("Nothing needs you right now");
  });

  it("gives the trend the whole row when the attention list is closed", () => {
    renderPage({ dashboard: without("attention") }, "finance.report.view");

    const row = gridOf("Billed vs collected");
    expect(row).not.toBeNull();
    expect(row!.className).not.toContain("xl:grid-cols-[");
  });

  it("splits the row between the trend and the attention list when both arrive", () => {
    renderPage({ dashboard: FULL }, "finance.report.view");

    expect(gridOf("Billed vs collected")!.className).toContain("xl:grid-cols-[");
  });

  it("shares the headline row between the tiles that remain", () => {
    renderPage({ dashboard: without("kpis.cash_position", "kpis.net_income_ytd") }, "finance.report.view");

    const row = container.querySelector("[data-kpi-row]");
    expect(row).not.toBeNull();
    expect(row!.children).toHaveLength(3);
    expect(row!.className).toContain("xl:grid-cols-3");
    expect(row!.textContent).not.toContain("Cash & bank");
    expect(row!.textContent).not.toContain("Net income");
  });

  it("draws no headline row when every tile is closed", () => {
    renderPage({
      dashboard: without("kpis.cash_position", "kpis.receivables", "kpis.payables", "kpis.net_income_ytd", "collections"),
    }, "finance.report.view");

    expect(container.querySelector("[data-kpi-row]")).toBeNull();
    expect(container.textContent).toContain("Receivables aging");
  });

  it("fills the lower row with the cards that remain", () => {
    renderPage({ dashboard: without("top_payers", "upcoming") }, "finance.report.view");

    const row = gridOf("Recent postings");
    expect(row!.className).not.toContain("md:grid-cols");
  });

  it("recounts the close progress from the checks it was sent", () => {
    const text = renderPage({
      dashboard: { ...FULL, close_progress: { ...FULL.close_progress!, done: 1, total: 2, checks: CHECKS.slice(0, 2) } },
    }, "finance.report.view");

    expect(text).toContain("1 of 2 checks");
    expect(text).toContain("trial balance balanced");
    expect(text).not.toContain("ar reconciled");
  });

  it("draws no close strip when every check is closed, and keeps the runway", () => {
    const text = renderPage({
      dashboard: { ...FULL, close_progress: { ...FULL.close_progress!, done: 0, total: 0, checks: [] } },
    }, "finance.report.view");

    expect(text).not.toContain("September 2026 close");
    expect(text).not.toContain("0 of 0 checks");
    expect(text).toContain("Fiscal year runway");
  });

  it("draws the close progress alone when the runway is closed", () => {
    const text = renderPage({ dashboard: without("fiscal_runway") }, "finance.report.view");

    expect(text).toContain("September 2026 close");
    expect(text).not.toContain("Fiscal year runway");
    expect(text).not.toContain("No fiscal periods are set up yet");
  });

  it("draws no strip at all when both the runway and the close progress are closed", () => {
    const text = renderPage({ dashboard: without("fiscal_runway", "close_progress") }, "finance.report.view");

    expect(text).not.toContain("Fiscal year runway");
    expect(text).not.toContain("close");
  });

  it("says nothing is in the reader's access once every card is closed", () => {
    const bare = without(
      "kpis.cash_position", "kpis.receivables", "kpis.payables", "kpis.net_income_ytd", "collections", "channels",
      "bank_accounts", "top_payers", "receivables_summary", "attention", "upcoming", "payables_due", "ar_aging",
      "trend", "close_progress", "recent_journals", "fiscal_runway",
    );
    const text = renderPage({ dashboard: bare }, "finance.report.view");

    expect(text).toContain("Nothing to show here yet");
  });

  it("reads a payers card without the summary it restated", () => {
    const text = renderPage({ dashboard: without("receivables_summary") }, "finance.report.view");

    expect(text).toContain("Tunde Okoro");
    expect(text).not.toContain("Falling due in 7 days");
  });
});

const RECEIVABLES: ReceivablesDashboard = {
  entity: "HOLYCROSS", books: "school", reader_first_name: null, as_of: "2026-09-26", narrowed: false,
  window: TERM, windows: [TERM],
  collections: { billed: money(1_000), invoice_count: 4, collected: money(500), rate_pct: 50 },
  days_to_pay: 7,
  receivables_summary: { owing_payers: 4, overdue_payers: 1, overdue_amount: money(300), oldest_days_overdue: 9, due_soon_payers: 0, due_soon_amount: money(0) },
  credit: { total: money(900), unapplied_receipts: 1, unapplied_receipts_amount: money(900), credit_notes_amount: money(0), payers: 1, older_than_days: 90, older_amount: money(0) },
  curve: { weeks: 13, week_now: 6, current: [0, 10, 20, 30, 40, 50], previous: null, previous_name: null, target_pct: 85, projection_pct: null, vs_previous_pts: null },
  plans: { active: 2, on_track: 1, on_track_amount: money(100), behind: 1, behind_amount: money(100), next: [] },
  groups: { label: "Class", items: [{ name: "JSS1 A", billed: money(100), collected: money(50), rate_pct: 50 }] },
  dunning: [{ level: 1, stage: "Friendly reminder", min_days_overdue: 1, sent: 2, paid_within_days: 7, paid_pct: 50 }],
  concessions: { total: money(100), payers: 1, share_of_billed_pct: 1, items: [{ kind: "DISCOUNT", label: "Discount", amount: money(100), payers: 1 }] },
  adjustments: [{ key: "credit_notes", label: "Credit notes", count: 1, pending: 0, amount: money(100) }],
  largest: [{
    customer_id: 43, name: "Tunde Okoro", code: "CU-1", branch: "Main Branch", group: "JSS1 A", owed: money(32_000),
    current: money(32_000), days_1_30: money(0), days_31_90: money(0), over_90: money(0), last_action: "Paid 20 Sep",
  }],
};

const receivablesWithout = (...keys: string[]): ReceivablesDashboard => {
  const copy: Record<string, unknown> = { ...RECEIVABLES };
  for (const key of keys) delete copy[key];
  return copy as unknown as ReceivablesDashboard;
};

const onReceivables = (payload: ReceivablesDashboard) =>
  renderPage({ receivables: payload, search: "view=receivables" }, "finance.invoice.view", "finance.payment.view");

describe("the receivables dashboard with cards a Field Access switch closed", () => {
  it("draws every card for a reader sent every block", () => {
    const text = onReceivables(RECEIVABLES);

    for (const present of ["collection curve", "Payment plans", "Collection by class", "Reminders", "Concessions granted",
      "Adjustments", "Credit held", "Largest balances"]) {
      expect(text).toContain(present);
    }
  });

  it("leaves out a closed curve and lets the plans fill the row", () => {
    const text = onReceivables(receivablesWithout("curve"));

    expect(text).not.toContain("collection curve");
    expect(text).toContain("Payment plans");
    expect(gridOf("Payment plans")!.className).not.toContain("xl:grid-cols-[");
  });

  it("reads a closed adjustments list as no card, not as a card with nothing in it", () => {
    const text = onReceivables(receivablesWithout("adjustments"));

    expect(text).not.toContain("Adjustments");
    expect(text).not.toContain("No adjustments in this window");
    expect(gridOf("Concessions granted")!.className).toContain("md:grid-cols-2");
    expect(gridOf("Concessions granted")!.className).not.toContain("xl:grid-cols-3");
  });

  it("keeps the adjustments card for a role whose keys leave it empty", () => {
    const text = onReceivables({ ...RECEIVABLES, adjustments: [] });

    expect(text).not.toContain("No adjustments in this window");
  });

  it("shares the headline row between the tiles that remain", () => {
    onReceivables(receivablesWithout("collections", "days_to_pay", "credit"));

    const row = container.querySelector("[data-kpi-row]");
    expect(row!.children).toHaveLength(1);
    expect(row!.className).not.toContain("xl:grid-cols-5");
  });

  it("says nothing is in the reader's access once every card is closed", () => {
    const text = onReceivables(receivablesWithout(
      "collections", "days_to_pay", "receivables_summary", "credit", "curve", "plans", "groups", "dunning",
      "concessions", "adjustments", "largest",
    ));

    expect(text).toContain("Nothing to show here yet");
  });
});

const SPEND: SpendDashboard = {
  entity: "HOLYCROSS", books: "school", reader_first_name: null, as_of: "2026-09-26", narrowed: false,
  window: MONTH, windows: [MONTH],
  runway: { months: 2.3, monthly_outflow: money(1_000), cash: money(2_300), based_on_days: 26 },
  cash_movement: { start: "2026-09-01", end: "2026-09-26", opening: money(0), closing: money(100), steps: [{ key: "receipts", amount: money(100) }] },
  spend: { amount: money(1_000), previous: null, delta_pct: null, payroll: money(500), payroll_share_pct: 50 },
  spending: { basis: "cost_centre", total: money(1_000), items: [{ name: "Teaching staff", amount: money(1_000), share_pct: 100 }] },
  reconciliation: [{ id: 1, name: "GTBank collections", bank_name: "Guaranty Trust Bank", lines: 10, matched: 8, unmatched: 2, unmatched_amount: money(100), last_reconciled: null }],
  unmatched: { lines: 2, amount: money(100) },
  budgets: { year_elapsed_pct: 74, items: [{ id: 6, name: "School operating plan", branch: null, approved: true, plan: money(1_000), used: money(500), pct: 50 }] },
  payroll: { label: "September", pay_date: "2026-09-28", status: "DRAFT", heads: 24, gross: money(900), net: money(800), paye: money(50), pension: money(30), other: money(20) },
  claims: { submitted: { count: 1, amount: money(10) }, approved: { count: 0, amount: money(0) }, paid: { count: 0, amount: money(0) }, oldest: [] },
  petty_cash: { threshold_pct: 25, funds: [{ id: 1, name: "Bursar float", branch: null, balance: money(100), float: money(200), low: false, last_topped_up: null }] },
  tax_owed: { amount: money(100), next: null },
  tax_calendar: [{ id: 1, name: "PAYE", code: "PAYE", period: "Aug 2026", due_date: "2026-09-10", days: -16, amount: money(100), state: "prepared" }],
  assets: { net_book_value: money(1_000), depreciation: money(10), categories: [], fully_depreciated_in_use: 0 },
};

const spendWithout = (...keys: string[]): SpendDashboard => {
  const copy: Record<string, unknown> = { ...SPEND };
  for (const key of keys) delete copy[key];
  return copy as unknown as SpendDashboard;
};

const onSpend = (payload: SpendDashboard) =>
  renderPage({ spend: payload, search: "view=spend" }, "finance.report.view");

describe("the cash and spend dashboard with cards a Field Access switch closed", () => {
  it("draws every card for a reader sent every block", () => {
    const text = onSpend(SPEND);

    for (const present of ["Cash runway", "Payroll run", "Expense claims", "Petty cash floats", "Tax calendar", "Fixed assets"]) {
      expect(text).toContain(present === "Payroll run" ? "Payroll" : present);
    }
  });

  it("lets the remaining cards fill the row when petty cash and claims are closed", () => {
    onSpend(spendWithout("claims", "petty_cash"));

    expect(container.textContent).not.toContain("Petty cash floats");
    const row = gridOf("Payroll");
    expect(row).not.toBeNull();
    expect(row!.className).not.toContain("md:grid-cols");
  });

  it("shares the headline row between the tiles that remain", () => {
    onSpend(spendWithout("runway", "spend", "tax_owed"));

    const row = container.querySelector("[data-kpi-row]");
    expect(row!.children).toHaveLength(2);
    expect(row!.className).not.toContain("xl:grid-cols-5");
  });

  it("says nothing is in the reader's access once every card is closed", () => {
    const text = onSpend(spendWithout(
      "runway", "cash_movement", "spend", "spending", "reconciliation", "unmatched", "budgets", "payroll", "claims",
      "petty_cash", "tax_owed", "tax_calendar", "assets",
    ));

    expect(text).toContain("Nothing to show here yet");
  });
});

describe("the cash by account card when the bank is hidden", () => {
  it("names each account and takes its initials from the account name", () => {
    const bank = { id: 1, name: "GTBank collections", balance: money(100), unmatched_lines: 0, unmatched_amount: money(0), last_reconciled: null, spark: [50, 100] };
    act(() => root.render(<BankAccountsCard banks={[bank]} currency="NGN" to="/finance/banking" />));

    expect(container.textContent).toContain("GTBank collections");
    expect(container.textContent).not.toContain("Guaranty");
    expect(container.textContent).toContain("GC");
  });
});
