/**
 * The Receivables & collections tab draws what it was sent, in the school's words.
 *
 * Holy Cross's First Term is 71% collected by week 6 of 13 against an 85% target.
 * Ngozi sees the curve with that target, collection by class, the reminders and
 * what they brought in, the concessions and credit, and the largest balances.
 * A bursar without the dunning, concession or plan keys is sent `null` for those
 * blocks, and the tab leaves those cards out rather than drawing them empty.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceivablesDashboard } from "@/redux/services/finance/reports-types";

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
}));

import { ReceivablesTab, curveTicks } from "./dashboard-receivables";
import { dashboardWords } from "./dashboard-words";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const TERM = { key: "term", label: "This term", name: "First Term 2026/2027", start: "2026-08-17", end: "2026-11-15", basis: "billed_for" as const };

const FULL: ReceivablesDashboard = {
  entity: "HOLYCROSS", books: "school", reader_first_name: "Ngozi", as_of: "2026-09-26", narrowed: false,
  window: TERM, windows: [{ key: "term", label: "This term", name: TERM.name }],
  collections: { billed: money(1_096_650_000), invoice_count: 49, collected: money(778_500_000), rate_pct: 71 },
  days_to_pay: 7,
  receivables_summary: {
    owing_payers: 21, overdue_payers: 6, overdue_amount: money(62_500_000), oldest_days_overdue: 22,
    due_soon_payers: 0, due_soon_amount: money(0),
  },
  credit: {
    total: money(9_500_000), unapplied_receipts: 3, unapplied_receipts_amount: money(9_500_000),
    credit_notes_amount: money(0), payers: 3, older_than_days: 90, older_amount: money(0),
  },
  curve: {
    weeks: 13, week_now: 6, current: [0, 0, 18.4, 38.4, 52.9, 71], previous: [0, 10, 30, 45, 55, 62, 68, 72, 75, 78, 80, 81, 82],
    previous_name: "Third Term 2025/2026", target_pct: 85, projection_pct: 91, vs_previous_pts: 9,
  },
  plans: {
    active: 6, on_track: 3, on_track_amount: money(60_800_000), behind: 3, behind_amount: money(85_100_000),
    next: [{ date: "2026-10-01", plans: 3, amount: money(18_133_333) }],
  },
  groups: { label: "Class", items: [
    { name: "JSS1 A", billed: money(753_900_000), collected: money(528_000_000), rate_pct: 70 },
    { name: "JSS2 A", billed: money(87_750_000), collected: money(47_250_000), rate_pct: 53.8 },
  ] },
  dunning: [
    { level: 1, stage: "Friendly reminder", min_days_overdue: 1, sent: 9, paid_within_days: 7, paid_pct: 33.3 },
    { level: 2, stage: "Second reminder", min_days_overdue: 14, sent: 6, paid_within_days: 7, paid_pct: 0 },
  ],
  concessions: { total: money(25_350_000), payers: 7, share_of_billed_pct: 2.3, items: [
    { kind: "DISCOUNT", label: "Discount", amount: money(11_100_000), payers: 4 },
  ] },
  adjustments: [
    { key: "credit_notes", label: "Credit notes", count: 1, pending: 0, amount: money(4_500_000) },
    { key: "write_offs", label: "Write-offs", count: 0, pending: 2, amount: money(0) },
  ],
  largest: [{
    customer_id: 43, name: "Tunde Okoro", code: "CU-62609043", branch: "Main Branch", group: "JSS1 A",
    owed: money(32_000_000), current: money(32_000_000), days_1_30: money(0), days_31_90: money(0), over_90: money(0),
    last_action: "Paid 20 Sep",
  }],
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

const render = (d: ReceivablesDashboard) => {
  act(() => root.render(<ReceivablesTab d={d} words={dashboardWords(d.books)} currency="NGN" />));
  return container.textContent ?? "";
};

describe("Receivables & collections for the proprietor", () => {
  it("reads the term against last term and the school's own target", () => {
    const text = render(FULL);

    expect(text).toContain("Term collection curve");
    expect(text).toContain("Target 85%");
    expect(text).toContain("Week 6 of 13: 71% collected.");
    expect(text).toContain("9 points ahead of Third Term 2025/2026 at the same week.");
    expect(text).toContain("closes near 91%, above your 85% target");
  });

  it("draws every card it was sent, in school words", () => {
    const text = render(FULL);

    for (const present of ["Days to pay", "Collection by class", "JSS1 A", "Reminders", "33% paid",
      "Concessions granted", "Adjustments", "2 adjustments awaiting approval", "Credit held", "3 parents in credit",
      "Payment plans", "Largest balances", "Tunde Okoro", "Paid 20 Sep"]) {
      expect(text).toContain(present);
    }
  });
});

describe("Receivables & collections for a bursar", () => {
  it("leaves out the cards whose blocks were not sent", () => {
    const text = render({ ...FULL, dunning: null, concessions: null, plans: null, credit: null, curve: null, adjustments: [] });

    for (const absent of ["Reminders", "Concessions granted", "Payment plans", "Credit held", "collection curve", "Adjustments"]) {
      expect(text).not.toContain(absent);
    }
    expect(text).toContain("Largest balances");
  });

  it("says so when nothing is in the reader's access", () => {
    const text = render({ ...FULL, collections: null, curve: null, plans: null, groups: null, dunning: null,
      concessions: null, adjustments: [], credit: null, largest: null, days_to_pay: null, receivables_summary: null });
    expect(text).toContain("Nothing to show here yet");
  });
});

describe("Collection curve week labels", () => {
  it("labels a 13-week term with about six weeks, first and last included", () => {
    const weeks = curveTicks(13).map((t) => t.week + 1);
    expect(weeks[0]).toBe(1);
    expect(weeks[weeks.length - 1]).toBe(13);
    expect(weeks.length).toBeLessThanOrEqual(7);
  });

  it("keeps the first and last label on a phone and hides every other one between", () => {
    const ticks = curveTicks(13);
    expect(ticks[0].wide).toBe(false);
    expect(ticks[ticks.length - 1].wide).toBe(false);
    expect(ticks.filter((t) => !t.wide).length).toBeLessThanOrEqual(4);
  });

  it("labels every week of a short window", () => {
    expect(curveTicks(5).map((t) => t.week + 1)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("Reading the curve week by week", () => {
  const plot = () => container.querySelector<HTMLElement>('[aria-label^="Collection by week"]')!;
  const key = (k: string) => act(() => { plot().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });

  it("shows today's week until the reader points elsewhere", () => {
    const text = render(FULL);
    expect(text).toContain("W6 · 71%");
  });

  it("steps back a week with the arrow keys, with last term's figure for the same week", () => {
    render(FULL);
    key("ArrowLeft");
    const text = container.textContent ?? "";
    expect(text).toContain("W5 · 52.9%");
    expect(text).toContain("Third Term 2025/2026: 55%");
  });

  it("says a week ahead of today is not reached yet, and Escape returns to today", () => {
    render(FULL);
    key("ArrowRight");
    expect(container.textContent).toContain("W7 · not reached yet");
    key("Escape");
    expect(container.textContent).toContain("W6 · 71%");
  });
});
