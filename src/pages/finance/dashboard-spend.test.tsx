/**
 * The Cash, spend & compliance tab draws what it was sent, in the school's words.
 *
 * Ngozi, proprietor of Holy Cross, is sent every block for September: cash went
 * from nothing to ₦35.74M, with the balances brought forward from the bank, fee
 * receipts, salaries and bills along the way; spending is tagged to cost centres;
 * three staff claims wait for approval; PAYE is due in 14 days and VAT is a nil
 * return. Chukwuemeka, the Main Branch bursar, is sent no cash, bank, payroll or
 * tax block, and his tab leaves those cards out rather than drawing them empty.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpendDashboard } from "@/redux/services/finance/reports-types";

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
}));

import { SpendTab, cashBars, runwayLabel } from "./dashboard-spend";
import { dashboardWords } from "./dashboard-words";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const MONTH = { key: "month", label: "This month", name: "September 2026", start: "2026-09-01", end: "2026-09-26", basis: "dates" as const };

const FULL: SpendDashboard = {
  entity: "HOLYCROSS", books: "school", reader_first_name: "Ngozi", as_of: "2026-09-26", narrowed: false,
  window: MONTH, windows: [{ key: "month", label: "This month", name: MONTH.name }],
  runway: { months: 2.3, monthly_outflow: money(1_544_030_769), cash: money(3_574_340_000), based_on_days: 26 },
  cash_movement: {
    start: "2026-09-01", end: "2026-09-26", opening: money(0), closing: money(3_574_340_000),
    steps: [
      { key: "receipts", amount: money(832_500_000) },
      { key: "equity", amount: money(4_080_000_000) },
      { key: "payroll", amount: money(-549_180_000) },
      { key: "spending", amount: money(-669_850_000) },
      { key: "petty_cash", amount: money(-119_130_000) },
    ],
  },
  spend: { amount: money(1_508_535_712), previous: null, delta_pct: null, payroll: money(678_000_000), payroll_share_pct: 44.9 },
  spending: {
    basis: "cost_centre", total: money(1_508_535_712),
    items: [
      { name: "Teaching staff", amount: money(524_750_000), share_pct: 34.8 },
      { name: "Not tagged", amount: money(135_185_712), share_pct: 9 },
    ],
  },
  reconciliation: [{
    id: 1, name: "GTBank collections", bank_name: "Guaranty Trust Bank", lines: 835, matched: 812, unmatched: 23,
    unmatched_amount: money(406_000_000), last_reconciled: null,
  }],
  unmatched: { lines: 23, amount: money(406_000_000) },
  budgets: {
    year_elapsed_pct: 74,
    items: [
      { id: 6, name: "School operating plan", branch: null, approved: true, plan: money(1_260_000_000), used: money(681_400_000), pct: 54.1 },
      { id: 5, name: "Main Branch operating plan", branch: "Main Branch", approved: false, plan: money(0), used: money(0), pct: null },
    ],
  },
  payroll: {
    label: "September", pay_date: "2026-09-28", status: "POSTED", heads: 24, gross: money(669_000_000),
    net: money(541_890_000), paye: money(73_590_000), pension: money(53_520_000), other: money(0),
  },
  claims: {
    submitted: { count: 3, amount: money(25_250_000) }, approved: { count: 2, amount: money(10_200_000) },
    paid: { count: 3, amount: money(19_550_000) },
    oldest: [{ id: 8, claimant: "Mr Adebayo", title: "Inter-house sports trip", days: 12, amount: money(8_400_000) }],
  },
  petty_cash: {
    threshold_pct: 25,
    funds: [{ id: 4, name: "Kitchen float", branch: "Annex", balance: money(1_600_000), float: money(10_000_000), low: true, last_topped_up: null }],
  },
  tax_owed: { amount: money(127_110_000), next: { name: "Pay As You Earn", due_date: "2026-10-10", days: 14, amount: money(73_590_000) } },
  tax_calendar: [
    { id: 1, name: "Pay As You Earn", code: "PAYE", period: "September 2026", due_date: "2026-10-10", days: 14, amount: money(73_590_000), state: "prepared" },
    { id: 3, name: "Value Added Tax", code: "VAT", period: "September 2026", due_date: "2026-10-21", days: 25, amount: money(0), state: "nil" },
  ],
  assets: {
    net_book_value: money(20_562_619_152), depreciation: money(118_535_712), fully_depreciated_in_use: 3,
    categories: [{ key: "BUILDINGS", label: "Buildings", count: 2, cost: money(22_200_000_000), net_book_value: money(17_265_000_000), depreciated_pct: 22.2 }],
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (d: SpendDashboard) => {
  act(() => root.render(<SpendTab d={d} words={dashboardWords(d.books)} currency="NGN" />));
  return container.textContent ?? "";
};

describe("Cash, spend & compliance for the proprietor", () => {
  it("draws every card it was sent", () => {
    const text = render(FULL);
    for (const present of ["Cash runway", "2.3 months", "Operating spend this month", "Payroll · September",
      "Tax owed", "Pay As You Earn due in 14 days", "Unmatched bank lines", "Bank reconciliation",
      "812 of 835 lines matched", "Budgets in use", "Spending by cost centre", "Teaching staff",
      "Expense claims", "Mr Adebayo", "Petty cash floats", "Below the 25% threshold", "Tax calendar",
      "Nil return", "Fixed assets", "3 assets fully depreciated and still in use"]) {
      expect(text).toContain(present);
    }
  });

  it("names cash movements in school words", () => {
    const text = render(FULL);
    expect(text).toContain("Fee receipts");
    expect(text).toContain("Capital and balances in");
    expect(text).toContain("Salaries");
  });

  it("marks a draft plan and says when a plan has no spending in it", () => {
    const text = render(FULL);
    expect(text).toContain("Draft");
    expect(text).toContain("No spending planned");
  });
});

describe("Cash, spend & compliance for a branch bursar", () => {
  it("leaves out the school's cash, bank, payroll and tax cards", () => {
    const text = render({ ...FULL, narrowed: true, runway: null, cash_movement: null, reconciliation: null,
      unmatched: null, payroll: null, tax_owed: null, tax_calendar: null });
    for (const absent of ["Cash runway", "Cash movement", "Bank reconciliation", "Payroll", "Tax owed", "Tax calendar"]) {
      expect(text).not.toContain(absent);
    }
    expect(text).toContain("Spending by cost centre");
  });

  it("lists the school's plan without its figures", () => {
    const text = render({ ...FULL, budgets: { year_elapsed_pct: 74, items: [
      { id: 6, name: "School operating plan", branch: null, approved: true, plan: null, used: null, pct: null },
    ] } });
    expect(text).toContain("The school's plan, measured against every branch");
  });

  it("says so when nothing is in the reader's access", () => {
    const text = render({ ...FULL, runway: null, cash_movement: null, spend: null, spending: null, reconciliation: null,
      unmatched: null, budgets: null, payroll: null, claims: null, petty_cash: null, tax_owed: null, tax_calendar: null, assets: null });
    expect(text).toContain("Nothing to show here yet");
  });
});

describe("Cash movement bars", () => {
  it("floats each step from the running total before it and ends at the closing balance", () => {
    const bars = cashBars(100, [{ key: "receipts", amount: 50 }, { key: "payroll", amount: -30 }], (k) => k, "Open", "Today");
    expect(bars.map((b) => [b.key, b.from, b.to, b.kind])).toEqual([
      ["opening", 0, 100, "total"], ["receipts", 100, 150, "in"], ["payroll", 150, 120, "out"], ["closing", 0, 120, "total"],
    ]);
  });
});

describe("Runway wording", () => {
  it("reads months, caps a long runway, and shows a dash without enough history", () => {
    expect(runwayLabel(4.8)).toBe("4.8 months");
    expect(runwayLabel(1)).toBe("1 month");
    expect(runwayLabel(586)).toBe("Over 3 years");
    expect(runwayLabel(null)).toBe("-");
  });
});
