/**
 * The Procurement overview draws the blocks a reader was sent.
 *
 * Ngozi, proprietor of Holy Cross, is sent every block: spend this month, the
 * pipeline from requisition to payment, committed against spent, her approval
 * queue, the exceptions, bills falling due and the contracts ending. Funke, who
 * only raises requisitions, is sent her queue and the requisition stage, and the
 * page leaves every other card out rather than drawing it empty.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcurementDashboard as Dashboard } from "@/redux/services/procurement/procurement-ext-types";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";

const mocks = vi.hoisted(() => ({ held: new Set<string>(), dashboard: null as unknown }));
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
vi.mock("./procurement-shell", () => ({ ProcurementShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/layout/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN", entity: null, isLoading: false }),
}));
vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useGetProcurementDashboardQuery: () => ({
    data: { data: mocks.dashboard }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
}));

import ProcurementDashboard, { waitingFor } from "./dashboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: "" });
const MONTH = { key: "month", label: "This month", name: "September 2026", start: "2026-09-01", end: "2026-09-26", basis: "dates" as const };
const stage = (count: number, kobo: number, flag: number) => ({ count, amount: money(kobo), flag });
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const FULL: Dashboard = {
  entity: "HOLYCROSS", currency: "NGN", books: "school", reader_first_name: "Ngozi", as_of: "2026-09-26",
  month_start: "2026-09-01", narrowed: false, window: MONTH,
  windows: [{ key: "month", label: "This month", name: "September 2026" }, { key: "term", label: "This term", name: "First Term" }],
  kpis: {
    spend: { value: money(1_069_000_000), prior_value: money(986_000_000), delta_pct: 8.4 },
    open_purchase_orders: { count: 3, partial_count: 2, amount: money(716_000_000) },
    pending_approvals: { count: 5, amount: money(842_000_000), slow_count: 1, type_count: 2 },
    overdue_invoices: { count: 1, amount: money(210_000_000), oldest_days: 2 },
    active_vendors: { count: 7, on_hold_count: 1, first_time_count: 2 },
  },
  pipeline: {
    requisitions: stage(5, 512_000_000, 3), rfqs: { ...stage(2, 1_190_000_000, 1), flag_days: 7 },
    orders: stage(3, 716_000_000, 2), received_not_billed: stage(2, 295_000_000, 0),
    bills: stage(4, 662_000_000, 1), paid: stage(3, 407_000_000, 3),
  },
  committed_vs_spent: { labels: months, current: 8, committed: months.map((_, i) => (i === 8 ? 1_500_000_000 : 0)), spent: months.map((_, i) => (i === 8 ? 1_069_000_000 : 0)) },
  spend_by_category: { total: money(1_069_000_000), items: [{ key: "TEACH", label: "Teaching materials", amount: money(400_000_000) }] },
  top_vendors: [{ key: "OIL", name: "Eterna Oil", amount: money(336_000_000), bills: 1 }],
  exceptions: [
    { key: "match_failed", count: 1, amount: money(144_000_000) },
    { key: "vendor_on_hold", count: 1, amount: money(22_000_000), detail: "Prime Uniforms" },
  ],
  bills_due: { items: [
    { key: "current", amount: money(452_000_000) }, { key: "1-30", amount: money(210_000_000) },
    { key: "31-60", amount: money(0) }, { key: "over-60", amount: money(0) },
  ] },
  contracts_ending: [{ id: 1, title: "School bus maintenance", vendor: "Nairaland Motors", end_date: "2026-10-14", days: 18,
    value: money(450_000_000), ordered: money(410_000_000) }],
  recent_activity: [{ id: 1, action: "GRN_POSTED", label: "Goods received", summary: "Goods received · GRN-1",
    reference: "GRN-1", actor: "Ngozi Eze", occurred_at: "2026-09-26T10:00:00Z" }],
  approvals_awaiting_user: [{ workflow_id: "w1", document_type: "procurement.purchase_order", document_id: 9,
    reference: "PO-26090118", title: "Lab reagents", requester: "Funke Adeyemi", amount: money(186_000_000),
    stage: "Manager", awaiting_since: "2026-09-20T09:00:00Z", on_behalf_of: null }],
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

const render = (d: Dashboard, ...keys: string[]) => {
  mocks.dashboard = d;
  mocks.held = new Set(keys);
  act(() => root.render(<ProcurementDashboard />));
  return container.textContent ?? "";
};

describe("Procurement overview for the proprietor", () => {
  it("draws every block it was sent", () => {
    const text = render(FULL);
    for (const present of ["Good", "Ngozi", "Spend this month", "Open orders", "2 partial",
      "Waiting on you", "1 over 5 days", "Overdue bills", "Active vendors", "1 on hold",
      "Purchase to payment", "Requisitions", "3 not yet approved", "RFQs out", "Received, not billed",
      "Paid this month", "Committed vs spent", "PO-26090118 · Lab reagents", "Spend by category",
      "Top vendors", "Eterna Oil", "3-way match failed on 1 bill", "A bill from a vendor on hold",
      "Prime Uniforms", "Bills falling due", "1 to 30 days late", "Contracts ending soon",
      "School bus maintenance", "Recent activity"]) {
      expect(text).toContain(present);
    }
  });

  it("offers the window switch and the create buttons the reader may use", () => {
    const text = render(FULL, "procurement.requisition.create");
    expect(text).toContain("This term");
    expect(text).toContain("New requisition");
    expect(text).not.toContain("New purchase order");
  });

  it("says so when every control is clear", () => {
    expect(render({ ...FULL, exceptions: [] })).toContain("Every control is clear.");
  });
});

describe("Procurement overview for a requisition raiser", () => {
  it("shows her queue and the requisition stage, and no card she was not sent", () => {
    const text = render({
      ...FULL, narrowed: true, pipeline: { requisitions: stage(2, 100_000, 1) },
      kpis: { ...FULL.kpis, spend: null, open_purchase_orders: null, overdue_invoices: null, active_vendors: null },
      committed_vs_spent: null, spend_by_category: null, top_vendors: null, exceptions: null, bills_due: null,
      contracts_ending: null, recent_activity: null,
    });
    expect(text).toContain("your branches only");
    expect(text).toContain("Waiting on your approval");
    expect(text).toContain("Requisitions");
    for (const absent of ["Spend this month", "Purchase orders", "Committed vs spent", "Top vendors",
      "Control exceptions", "Bills falling due", "Contracts ending soon", "Recent activity"]) {
      expect(text).not.toContain(absent);
    }
  });

  it("shows a contract's worth without the orders placed on it across branches", () => {
    const text = render({ ...FULL, contracts_ending: [{ ...FULL.contracts_ending![0], ordered: null }] });
    expect(text).toContain("Worth");
    expect(text).not.toContain("ordered of");
  });
});

describe("Approval waiting time", () => {
  it("counts whole days, and says today for anything newer", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    expect(waitingFor("2026-09-20T09:00:00Z", now)).toEqual({ label: "6 days", days: 6 });
    expect(waitingFor("2026-09-26T08:00:00Z", now).label).toBe("today");
    expect(waitingFor(null, now).label).toBe("-");
  });
});
