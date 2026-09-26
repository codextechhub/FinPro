/**
 * The Stock & receiving tab draws what it was sent.
 *
 * Ngozi sees Holy Cross's stores in September: printer toner and white chalk are
 * out, diesel has three days left, the kitchen took the most stock, coloured
 * chalk arrived late with five boxes rejected, and goods worth ₦4.93M are waiting
 * for a bill. She may raise requisitions, so she is offered the restock draft;
 * a storekeeper who may not raise them is not. A reader with orders but no stock
 * access sees expected deliveries only.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcurementStockDashboard } from "@/redux/services/procurement/procurement-ext-types";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";

const mocks = vi.hoisted(() => ({ held: new Set<string>() }));
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
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN", entity: null, isLoading: false }),
}));
vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useDraftRestockRequisitionMutation: () => [vi.fn(), { isLoading: false }],
}));

import { StockTab, daysLeftLabel, qty } from "./dashboard-stock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const MONTH = { key: "month", label: "This month", name: "September 2026", start: "2026-09-01", end: "2026-09-26", basis: "dates" as const };

const FULL: ProcurementStockDashboard = {
  entity: "HOLYCROSS", currency: "NGN", books: "school", reader_first_name: "Ngozi", as_of: "2026-09-26",
  narrowed: false, window: MONTH, windows: [{ key: "month", label: "This month", name: MONTH.name }],
  position: { value: money(154_800_000), items: 7, stores: 3, below_reorder: 7, out_within_week: 5, out_of_stock: 2,
    out_names: ["Chalk, white (box)", "Printer toner, HP 26A"], idle: 0, idle_value: money(0) },
  running_low: [
    { id: 1, name: "Printer toner, HP 26A", unit: "cartridge", store: "Main store", stores: 1, on_hand: 0, reorder_level: 6, days_left: 0, suggested: 12 },
    { id: 2, name: "Diesel", unit: "litre", store: "Main store", stores: 1, on_hand: 400, reorder_level: 1000, days_left: 3, suggested: 2000 },
  ],
  by_store: [{ store: "Main store", value: money(91_800_000) }, { store: "Kitchen", value: money(55_800_000) }],
  issued: { total: money(520_200_000), items: [{ name: "Facilities", value: money(276_900_000) }, { name: null, value: money(1_000_000) }] },
  movements: [
    { id: 1, type: "ADJUSTMENT", item: "Lab gloves (box)", unit: "box", store: "Main store", reference: "DEMO-COUNT", cost_center: null, quantity: -2, occurred_at: new Date().toISOString() },
    { id: 2, type: "ISSUE", item: "Rice, 50 kg bag", unit: "bag", store: "Kitchen", reference: "", cost_center: "Feeding", quantity: -6, occurred_at: new Date().toISOString() },
  ],
  turns: { times: 6.7, fastest_store: "Main store", fastest_times: 4.2 },
  adjustments: { count: 1, value: money(-700_000) },
  receipts: { this_week: 1, this_week_short: 1, short_lines: 2, lines: 18, short_pct: 11.1 },
  unbilled: { amount: money(492_900_000), count: 7, older: 0, days: 30 },
  expected: [
    { id: 9, number: "PO-9", vendor: "Learn Africa Books", title: "Chalk, coloured (box)", expected_date: "2026-09-18", days: -8, state: "late", partial: true },
    { id: 10, number: "PO-10", vendor: "Learn Africa Books", title: "Term 2 textbooks", expected_date: "2026-10-01", days: 5, state: "awaiting_approval", partial: false },
  ],
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

const render = (d: ProcurementStockDashboard, ...keys: string[]) => {
  mocks.held = new Set(keys);
  act(() => root.render(<StockTab d={d} currency="NGN" />));
  return container.textContent ?? "";
};

describe("Stock & receiving for the proprietor", () => {
  it("draws every block it was sent", () => {
    const text = render(FULL, "procurement.requisition.create");
    for (const present of ["Stock value", "7 items across 3 stores", "Below reorder level", "5 items will run out within a week",
      "Out of stock", "Printer toner, HP 26A", "Deliveries this week", "1 delivery arrived short",
      "Running low", "Draft a requisition for all", "0 / 6", "Out", "2,000 litre", "Stock value by store",
      "Expected deliveries", "8 days late", "Awaiting approval", "Issued to departments", "Not tagged",
      "Recent movements", "Issued to Feeding", "Stock turns", "6.7x", "Receipts short or rejected", "11.1%",
      "Received, waiting for a bill"]) {
      expect(text).toContain(present);
    }
  });

  it("offers the restock draft only to someone who may raise requisitions", () => {
    expect(render(FULL)).not.toContain("Draft a requisition for all");
  });
});

describe("Stock & receiving for an orders-only reader", () => {
  it("shows expected deliveries and no stock card", () => {
    const text = render({ ...FULL, position: null, running_low: null, by_store: null, issued: null, movements: null,
      turns: null, adjustments: null, receipts: null, unbilled: null });
    expect(text).toContain("Expected deliveries");
    for (const absent of ["Stock value", "Running low", "Issued to departments", "Stock turns"]) {
      expect(text).not.toContain(absent);
    }
  });
});

describe("Stock wording", () => {
  it("reads quantities and days left", () => {
    expect(qty(2400)).toBe("2,400");
    expect(daysLeftLabel(0, 0)).toBe("Out");
    expect(daysLeftLabel(5, 180)).toBe("5");
    expect(daysLeftLabel(null, 70)).toBe("-");
  });
});
