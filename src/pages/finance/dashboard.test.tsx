/**
 * The Finance overview draws the blocks a reader was sent, in the words of the books.
 *
 * Chukwuemeka is the bursar at Holy Cross Main Branch: he may read invoices, and
 * the server sends him his branch's receivables and aging with every ledger block
 * `null`. He must see those cards and no empty "Cash & bank" beside them, and no
 * button he cannot use. Ngozi, the proprietor, is sent every block.
 *
 * Holy Cross's books are a school's, so the page says "How parents paid" and
 * "Collected this term". The platform's own books are not, and the same page
 * says "How customers paid" and "Collected this month".
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceDashboard as Dashboard } from "@/redux/services/finance/reports-types";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  dashboard: null as unknown,
  lastArgs: null as unknown,
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
  useGetFinanceDashboardQuery: (args: unknown) => {
    mocks.lastArgs = args;
    return { data: { data: mocks.dashboard }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
}));

vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetPeriodsQuery: () => ({ data: { data: [] } }),
}));

import FinanceDashboard from "./dashboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const kpi = (kobo: number, spark: number[] = [0, kobo]) => ({ value: money(kobo), delta_pct: null, spark });

const TERM = { key: "term", label: "This term", name: "First Term 2026/2027", start: "2026-08-17", end: "2026-11-15", basis: "billed_for" as const };

const EMPTY: Dashboard = {
  entity: "HOLYCROSS", fiscal_year: "2026", period: "2026-09", as_of: "2026-09-26",
  books: "school", reader_first_name: null,
  window: TERM,
  windows: [TERM, { key: "month", label: "This month", name: "September 2026" }, { key: "year", label: "Year to date", name: "FY 2026 to date" }],
  narrowed: false,
  fiscal_runway: { status: "HEALTHY", calendar_end: "2026-12-31", days_remaining: 96, threshold_days: 60 },
  kpis: { cash_position: null, receivables: null, payables: null, net_income_ytd: null },
  collections: null, channels: null, branches: null, bank_accounts: null, budget: null, top_payers: null,
  receivables_summary: null,
  attention: [], upcoming: [], payables_due: null,
  revenue_vs_budget: null, ar_aging: null, trend: null, top_overdue: null, vendor_due: null,
  approvals: null, close_progress: null, recent_journals: null,
};

const AGING = { buckets: [{ key: "current", pct: 100, amount: money(1_089_000_000) }], total: money(1_089_000_000) };
const CHANNELS = {
  total: money(755_250_000), receipts: 36,
  items: [{ key: "ONLINE", label: "Online and card gateway", amount: money(425_000_000), receipts: 19, pct: 56.3 }],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.held = new Set();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (dashboard: Dashboard, ...keys: string[]) => {
  mocks.held = new Set(keys);
  mocks.dashboard = dashboard;
  act(() => root.render(<FinanceDashboard />));
  return container.textContent ?? "";
};

describe("Finance overview for a branch bursar", () => {
  const bursar: Dashboard = {
    ...EMPTY,
    narrowed: true,
    kpis: { ...EMPTY.kpis, receivables: kpi(1_089_000_000, []) },
    ar_aging: AGING,
    top_payers: [],
  };

  it("shows the receivables and aging it was sent, and says they cover his branches", () => {
    const text = render(bursar, "finance.invoice.view");

    expect(text).toContain("Receivables");
    expect(text).toContain("Across your open invoices");
    expect(text).toContain("Receivables aging");
    expect(text).toContain("your branches only");
  });

  it("draws no card for a figure it was not sent", () => {
    const text = render(bursar, "finance.invoice.view");

    for (const absent of ["Cash & bank", "Payables", "Net income", "Against the school", "Cash by account",
      "Recent postings", "close", "How parents paid"]) {
      expect(text).not.toContain(absent);
    }
  });

  it("offers no button he cannot use", () => {
    const text = render(bursar, "finance.invoice.view");

    expect(text).not.toContain("New invoice");
    expect(text).not.toContain("Record receipt");
  });
});

describe("Finance overview words and windows", () => {
  const withCollections: Dashboard = {
    ...EMPTY,
    collections: { billed: money(1_126_500_000), invoice_count: 49, collected: money(737_250_000), rate_pct: 65.4 },
    channels: CHANNELS,
  };

  it("speaks of parents and the term on a school's books", () => {
    const text = render(withCollections, "finance.payment.view");

    expect(text).toContain("Collected this term");
    expect(text).toContain("for First Term 2026/2027");
    expect(text).toContain("How parents paid");
    expect(text).toContain("65.4%");
  });

  it("speaks of customers and the month on books that are not a school's", () => {
    const month = { key: "month", label: "This month", name: "September 2026", start: "2026-09-01", end: "2026-09-26", basis: "dates" as const };
    const text = render({
      ...withCollections, books: "general", window: month,
      windows: [month, { key: "quarter", label: "This quarter", name: "Q3 FY 2026" }],
    }, "finance.payment.view");

    expect(text).toContain("Collected this month");
    expect(text).toContain("How customers paid");
    expect(text).not.toContain("parents");
    expect(text).not.toContain("This term");
  });

  it("offers every window the books have", () => {
    const text = render(withCollections, "finance.payment.view");

    for (const label of ["This term", "This month", "Year to date"]) expect(text).toContain(label);
  });

  it("greets the reader by name when the server sends one", () => {
    expect(render({ ...EMPTY, reader_first_name: "Ngozi", ar_aging: AGING }, "finance.invoice.view")).toMatch(/Good (morning|afternoon|evening), Ngozi/);
  });
});

describe("Finance overview short cards", () => {
  const summary = {
    owing_payers: 9, overdue_payers: 1, overdue_amount: money(15_000_000), oldest_days_overdue: 22,
    due_soon_payers: 14, due_soon_amount: money(210_000_000),
  };
  const payer = { customer_id: 1, name: "Ebere Bello", code: "CU-1", branch: "Main Branch", amount: money(15_000_000), invoices: 1, days_overdue: 22 };

  it("says the rest are up to date when the one overdue payer is the whole list", () => {
    const text = render({ ...EMPTY, ar_aging: AGING, top_payers: [payer], receivables_summary: summary }, "finance.invoice.view");

    expect(text).toContain("Everyone else is up to date.");
    expect(text).toContain("Falling due in 7 days: 14 parents");
    expect(text).toContain("9 parents owe · oldest 22 days overdue");
  });

  it("counts the overdue payers the list leaves out, instead of claiming everyone else paid", () => {
    const text = render({ ...EMPTY, ar_aging: AGING, top_payers: [payer], receivables_summary: { ...summary, overdue_payers: 4 } }, "finance.invoice.view");

    expect(text).not.toContain("Everyone else is up to date.");
    expect(text).toContain("3 more parents overdue");
  });

  it("totals a single bank account and says what is left to reconcile", () => {
    const text = render({
      ...EMPTY, ar_aging: AGING,
      bank_accounts: [{ id: 1, name: "GTBank collections", bank_name: "Guaranty Trust Bank", balance: money(654_500_000),
        unmatched_lines: 8, unmatched_amount: money(67_000_000), last_reconciled: "2026-09-25", spark: [100, 654_500_000] }],
    }, "finance.invoice.view");

    expect(text).toContain("Total across 1 account");
    expect(text).toContain("8 lines to match · last reconciled 25 Sept");
  });
});

describe("Finance overview attention and edge cases", () => {
  it("lists what needs doing, and says so when nothing does", () => {
    const busy = render({
      ...EMPTY, ar_aging: AGING,
      attention: [{ key: "bank_lines", tone: "warning", title: "8 bank lines not matched", detail: "GTBank collections", count: 8, amount: money(67_000_000) }],
    }, "finance.invoice.view");
    expect(busy).toContain("8 bank lines not matched");
    expect(busy).toContain("Everything else is on track.");

    const calm = render({ ...EMPTY, ar_aging: AGING }, "finance.invoice.view");
    expect(calm).toContain("Nothing needs you right now.");
  });

  it("says so when nothing on the page is in the reader's access", () => {
    const text = render(EMPTY, "payments.payout.view");

    expect(text).toContain("Nothing to show here yet");
    expect(text).not.toContain("Receivables aging");
  });

  it("draws every block for a reader sent all of them", () => {
    const full: Dashboard = {
      ...EMPTY,
      kpis: {
        cash_position: kpi(31_500_000), receivables: kpi(1_113_000_000),
        payables: kpi(0), net_income_ytd: kpi(1_144_500_000),
      },
      collections: { billed: money(100), invoice_count: 1, collected: money(50), rate_pct: 50 },
      channels: CHANNELS,
      branches: [{ branch_id: 19, name: "Holy Cross College Main Branch", billed: money(100), collected: money(50), rate_pct: 50, overdue: money(0) }],
      bank_accounts: [{ id: 1, name: "GTBank collections", bank_name: "Guaranty Trust Bank", balance: money(100), unmatched_lines: 0, unmatched_amount: money(0), last_reconciled: null, spark: [50, 100] }],
      budget: { budget_name: "School operating plan", year_elapsed_pct: 74, lines: [{ label: "Income", kind: "income", actual: money(1), plan: money(2), pct: 50 }] },
      top_payers: [], ar_aging: AGING,
      upcoming: [{ date: "2026-09-28", kind: "payroll", direction: "out", title: "September payroll", detail: "24 staff", amount: money(100) }],
      trend: { labels: ["Sep 26"], issued: [1], collected: [1] },
      close_progress: { period: "2026-09", done: 1, total: 2, checks: [] },
      recent_journals: [],
    };
    const text = render(full, "finance.report.view", "finance.invoice.create", "finance.payment.create");

    for (const present of ["Cash & bank", "Payables", "Net income, year to date", "Billed vs collected",
      "Needs your attention", "Cash by account", "How parents paid", "Branches this term",
      "Against the school's budget", "Most overdue payers", "Coming up in 30 days", "Recent postings",
      "2026-09 close", "Record receipt", "New invoice"]) {
      expect(text).toContain(present);
    }
  });
});
