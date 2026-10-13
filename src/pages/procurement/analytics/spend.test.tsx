/**
 * Spend analysis under the vendor category switch.
 *
 * Mrs Okoro has no switch on a vendor's category. The server leaves the category
 * breakdown out of the report it sends her, so the donut, the category table
 * and its clickable rows go and the vendor chart and monthly trend stay. A role
 * that may read categories gets all of it, each header over its cell.
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

import SpendScreen from "./spend";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: (kobo / 100).toFixed(2) });
const row = (key: string, label: string, gross: number) => ({ key, label, net: money(gross), tax: money(0), gross: money(gross), invoice_count: 2 });

const SPEND_BASE = {
  entity: "BSS", start_date: null, end_date: null,
  by_vendor: [row("ADE", "Ade Stationers", 600_000)],
  by_period: [{ period: "2026-09", label: "Sep 2026", gross: money(600_000), invoice_count: 2 }],
  total_net: money(600_000), total_tax: money(0), total_gross: money(600_000), invoice_count: 2,
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

describe("spend analysis", () => {
  it("draws the category breakdown for a role that may read categories", () => {
    mocks.spend = { ...SPEND_BASE, by_category: [row("STATIONERY", "Stationery", 600_000)] };
    render(<SpendScreen entity="BSS" currency="NGN" />);
    expect(container.textContent).toContain("Spend by category");
    expect(headers()).toEqual(["Category", "Invoices", "Net", "Tax", "Gross", "Share"]);
    expect(firstRow()).toHaveLength(6);
    expect(firstRow()[0].textContent).toBe("Stationery");
  });

  it("leaves out the donut, the table and the category rows when the breakdown is not sent", () => {
    mocks.spend = SPEND_BASE;
    render(<SpendScreen entity="BSS" currency="NGN" />);
    expect(container.textContent).not.toContain("Spend by category");
    expect(container.textContent).not.toContain("No spend");
    expect(headers()).toEqual([]);
    expect(container.textContent).toContain("Top vendors by spend");
    expect(container.textContent).toContain("Monthly spend trend");
  });

  it("still says a role that may read categories has no spend when the breakdown is empty", () => {
    mocks.spend = { ...SPEND_BASE, by_category: [] };
    render(<SpendScreen entity="BSS" currency="NGN" />);
    expect(container.textContent).toContain("No spend");
  });
});

