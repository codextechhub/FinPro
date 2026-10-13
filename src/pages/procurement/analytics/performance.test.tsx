/**
 * The vendor performance scorecard under the vendor category switch.
 *
 * Mrs Okoro has no switch on a vendor's category. The server leaves it off each
 * row it sends her, so the scorecard shows the vendor code beneath the name in
 * its place, and every row has one cell per header either way.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spend: undefined as unknown, aging: undefined as unknown, performance: undefined as unknown }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../../lib/display-prefs", () => ({
  useDates: () => ({ today: () => "2026-10-06", day: (v: string) => v, dateTime: (v: string) => v }),
}));
vi.mock("@/redux/services/procurement/procurement-ext-api", () => {
  const result = (data: () => unknown) => ({ data: { data: data() }, isLoading: false, isError: false, error: undefined, refetch: vi.fn() });
  return {
    useGetSpendAnalysisQuery: () => result(() => mocks.spend),
    useGetApAgingQuery: () => result(() => mocks.aging),
    useGetApCashRequirementsQuery: () => ({ data: undefined, isLoading: false, isError: false, error: undefined }),
    useGetApAgingVendorQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetVendorPerformanceQuery: () => result(() => mocks.performance),
    useGetVendorAssessmentsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  };
});

import PerformanceScreen from "./performance";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: (kobo / 100).toFixed(2) });

const PERFORMANCE_ROW = {
  vendor_id: 4, code: "ADE", name: "Ade Stationers", category: "Stationery", po_count: 3, total_ordered: money(900_000),
  receipt_count: 3, on_time_receipts: 2, late_receipts: 1, on_time_rate: 0.67, invoice_count: 2, payment_count: 1,
  average_payment_days: 12, latest_assessment: null,
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

const render = (node: React.ReactNode) => act(() => root.render(<MemoryRouter>{node}</MemoryRouter>));
const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
const firstRow = () => [...container.querySelectorAll("tbody tr")[0].querySelectorAll("td")];

describe("vendor performance", () => {
  it("names the category under the vendor for a role that may read it", () => {
    mocks.performance = { entity: "BSS", start_date: null, end_date: null, rows: [PERFORMANCE_ROW] };
    render(<PerformanceScreen entity="BSS" currency="NGN" />);
    expect(firstRow()[0].textContent).toContain("Stationery");
    expect(firstRow()).toHaveLength(headers().length);
  });

  it("shows the vendor code in its place when the category is not sent", () => {
    const { category: _category, ...bare } = PERFORMANCE_ROW;
    void _category;
    mocks.performance = { entity: "BSS", start_date: null, end_date: null, rows: [bare] };
    render(<PerformanceScreen entity="BSS" currency="NGN" />);
    expect(firstRow()[0].textContent).toBe("Ade StationersADE");
    expect(container.textContent).not.toContain("Stationery");
    expect(firstRow()).toHaveLength(headers().length);
  });
});
