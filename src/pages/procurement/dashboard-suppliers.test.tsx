/**
 * The Spend & suppliers tab draws what it was sent.
 *
 * Ngozi, proprietor of Holy Cross, sees this term's spend against the purchasing
 * plan, the vendor scorecard with grades, the open RFQs (the kitchen equipment
 * RFQ ready to award), what competition saved, spend by branch, how long buying
 * takes and the vendor base. Non-PO spend is 2.2% against a 2% limit, so the
 * tile says it is over. A branch reader is sent no plan and no branch comparison.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcurementSuppliersDashboard } from "@/redux/services/procurement/procurement-ext-types";

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
}));

import { SuppliersTab, days, gradeLabel } from "./dashboard-suppliers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const TERM = { key: "term", label: "This term", name: "First Term 2026/2027", start: "2026-08-17", end: "2026-11-15", basis: "dates" as const };

const FULL: ProcurementSuppliersDashboard = {
  entity: "HOLYCROSS", currency: "NGN", books: "school", reader_first_name: "Ngozi", as_of: "2026-09-26",
  narrowed: false, window: TERM, windows: [{ key: "term", label: "This term", name: TERM.name }],
  spend: {
    value: money(1_093_000_000), prior_value: null, delta_pct: null,
    plan: { budget_name: "School operating plan", planned: money(2_400_000_000), spent_ytd: money(1_093_000_000), pct: 45.5, year_elapsed_pct: 74 },
    vendors_with_spend: 6, vendors_for_80pct: 4,
  },
  vendors_paid: 3,
  deliveries: { on_time_pct: 88.9, on_time_change_pts: 4, accepted_pct: 99.7, rejected_lines: 1 },
  non_po: { amount: money(24_000_000), count: 1, pct: 2.2, limit_pct: 2 },
  scorecard: [
    { vendor_id: 1, name: "Eterna Oil", category: "Fuel and power", spend: money(336_000_000), on_time_pct: 100, accepted_pct: 100, open_orders: 0, grade: "A", score: 91 },
    { vendor_id: 2, name: "Prime Uniforms", category: "Uniforms", spend: money(37_000_000), on_time_pct: 50, accepted_pct: 92, open_orders: 1, grade: "C", score: 66 },
  ],
  open_rfqs: { count: 2, items: [
    { id: 1, title: "Term 2 textbooks", number: "RQ-1", invited: 2, quoted: 1, budget: money(960_000_000), closes: "2026-09-29", ready: false },
    { id: 2, title: "Kitchen equipment", number: "RQ-2", invited: 2, quoted: 2, budget: money(230_000_000), closes: "2026-10-08", ready: true },
  ] },
  savings: { saved: money(15_600_000), pct: 18.3, rfqs: 1, items: [{ name: "Facilities and repairs", saved: money(15_600_000) }] },
  by_branch: [{ branch: "Main Branch", amount: money(643_000_000) }, { branch: null, amount: money(24_000_000) }],
  cycle_times: { steps: [
    { key: "approval", median_days: 23, samples: 1 }, { key: "ordering", median_days: 0, samples: 1 },
    { key: "delivery", median_days: 4, samples: 9 }, { key: "payment", median_days: 8, samples: 3 },
  ], total_days: 35, slowest: "approval" },
  vendor_base: { active: 8, on_hold: 1, awaiting_kyc: 1, ordered_once: 4, added: 8 },
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

const render = (d: ProcurementSuppliersDashboard) => {
  act(() => root.render(<SuppliersTab d={d} currency="NGN" />));
  return container.textContent ?? "";
};

describe("Spend & suppliers for the proprietor", () => {
  it("draws every block it was sent", () => {
    const text = render(FULL);
    for (const present of ["Spend this term", "46% of plan", "74% of the year gone", "Vendors paid",
      "80% of spend with 4 of 6 vendors", "Delivered on time", "+4 pts", "Accepted on receipt",
      "Spend without a PO", "over the limit", "Vendor scorecard", "A · strong", "C · watch",
      "Open RFQs", "1 of 2 quoted", "Ready to award", "What competition saved", "18.3% below the highest quote",
      "Spend by branch", "School-wide", "How long buying takes", "Requisition approval is the slowest step",
      "Vendor base", "Still awaiting KYC checks"]) {
      expect(text).toContain(present);
    }
  });

  it("does not flag non-PO spend within the limit", () => {
    const text = render({ ...FULL, non_po: { ...FULL.non_po!, pct: 1.5 } });
    expect(text).toContain("limit 2%");
    expect(text).not.toContain("over the limit");
  });
});

describe("Spend & suppliers for a branch reader", () => {
  it("compares spend with the window before when no plan is sent, and leaves out the branch comparison", () => {
    const text = render({ ...FULL, narrowed: true, by_branch: null,
      spend: { ...FULL.spend!, plan: null, prior_value: money(900_000_000), delta_pct: 21.4 } });
    expect(text).toContain("at the same point before");
    expect(text).not.toContain("of plan");
    expect(text).not.toContain("Spend by branch");
  });

  it("says so when nothing is in the reader's access", () => {
    const text = render({ ...FULL, spend: null, vendors_paid: null, deliveries: null, non_po: null, scorecard: null,
      open_rfqs: null, savings: null, by_branch: null, cycle_times: null, vendor_base: null });
    expect(text).toContain("Nothing to show here yet");
  });
});

describe("Supplier wording", () => {
  it("names grades and days", () => {
    expect(gradeLabel("B")).toBe("B · good");
    expect(gradeLabel(null)).toBe("-");
    expect(days(4)).toBe("4 d");
    expect(days(2.5)).toBe("2.5 d");
    expect(days(null)).toBe("-");
  });
});
