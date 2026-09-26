/**
 * The Finance overview draws the blocks a reader was sent, and nothing else.
 *
 * Chukwuemeka is the bursar at Holy Cross Main Branch: he may read invoices, and
 * the server sends him his branch's receivables and aging with every ledger block
 * `null`. He must see those two cards and no empty "Cash position" beside them,
 * and no "New journal" or "Record payment" button he cannot use. The school's
 * proprietor, sent every block, sees the whole page.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceDashboard as Dashboard } from "@/redux/services/finance/reports-types";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  dashboard: null as unknown,
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
  TrendArea: () => <div>trend-chart</div>,
  AgingStack: () => <div>aging-chart</div>,
  BudgetBar: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("@/redux/services/finance/reports-api", () => ({
  useGetFinanceDashboardQuery: () => ({
    data: { data: mocks.dashboard }, isLoading: false, isError: false, refetch: vi.fn(),
  }),
}));

vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetPeriodsQuery: () => ({ data: { data: [] } }),
}));

import FinanceDashboard from "./dashboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const kpi = (kobo: number, spark: number[] = [0, kobo]) => ({ value: money(kobo), delta_pct: null, spark });

const EMPTY: Dashboard = {
  entity: "HOLYCROSS", fiscal_year: "2026", period: "2026-09", as_of: "2026-09-26",
  narrowed: false,
  fiscal_runway: { status: "HEALTHY", calendar_end: "2026-12-31", days_remaining: 96, threshold_days: 60 },
  kpis: { cash_position: null, receivables: null, payables: null, net_income_ytd: null },
  revenue_vs_budget: null, ar_aging: null, trend: null, top_overdue: null, vendor_due: null,
  approvals: null, close_progress: null, recent_journals: null,
};

const AGING = { buckets: [{ key: "current", pct: 100, amount: money(1_089_000_000) }], total: money(1_089_000_000) };

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
    top_overdue: [],
  };

  it("shows the receivables and aging it was sent, and says they cover his branches", () => {
    const text = render(bursar, "finance.invoice.view");

    expect(text).toContain("Outstanding receivables");
    expect(text).toContain("Across your open invoices");
    expect(text).toContain("AR Aging");
    expect(text).toContain("Your branches only");
  });

  it("draws no card for a ledger figure it was not sent", () => {
    const text = render(bursar, "finance.invoice.view");

    for (const absent of ["Cash position", "Outstanding payables", "Net income YTD",
      "Revenue vs Budget", "Period close progress", "Recent journal activity"]) {
      expect(text).not.toContain(absent);
    }
  });

  it("offers no journal or payment action he cannot take", () => {
    const text = render(bursar, "finance.invoice.view");

    expect(text).not.toContain("New journal");
    expect(text).not.toContain("Record payment");
    expect(text).not.toContain("Manual journal entry");
  });
});

describe("Finance overview edge cases", () => {
  it("says so when nothing on the page is in the reader's access", () => {
    const text = render(EMPTY, "payments.payout.view");

    expect(text).toContain("Nothing to show here yet");
    expect(text).not.toContain("Outstanding receivables");
  });

  it("draws every block for a reader sent all of them", () => {
    const full: Dashboard = {
      ...EMPTY,
      kpis: {
        cash_position: kpi(31_500_000), receivables: kpi(1_113_000_000),
        payables: kpi(0), net_income_ytd: kpi(1_144_500_000),
      },
      revenue_vs_budget: {
        has_budget: false, budget_name: null,
        revenue: { actual: money(0), plan: money(0), pct_of_plan: null },
        expense: { actual: money(0), plan: money(0), pct_of_plan: null },
        net: { actual: money(0), delta_pct: null },
      },
      ar_aging: AGING,
      trend: { labels: ["Sep 26"], issued: [1], collected: [1] },
      top_overdue: [], vendor_due: [],
      approvals: { items: [{ label: "Purchase orders", count: 0 }], total: 0 },
      close_progress: { period: "2026-09", done: 1, total: 2, checks: [] },
      recent_journals: [],
    };
    const text = render(full, "finance.report.view", "finance.journal.post", "finance.payment.create");

    for (const present of ["Cash position", "Outstanding payables", "Net income YTD", "Revenue vs Budget",
      "Receivables vs Collections", "Pending approvals", "Period close progress", "Recent journal activity",
      "Record payment"]) {
      expect(text).toContain(present);
    }
  });
});
