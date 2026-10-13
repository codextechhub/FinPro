/**
 * Unpaid bills by age under the payment terms switch.
 *
 * Mrs Okoro has no switch on a vendor's payment terms. The server leaves them
 * off each row it sends her, so the table names none under a vendor. A role that
 * may read them sees the terms under the name, and every row has one cell per
 * header either way.
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

import ApAgingScreen from "./ap-aging";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: (kobo / 100).toFixed(2) });

const AGING_ROW = {
  vendor_id: 4, code: "ADE", name: "Ade Stationers", payment_terms: "NET_30",
  buckets: { current: money(500_000), "1-30": money(0) }, outstanding: money(500_000), unallocated_credit: money(0), net: money(500_000),
};
const AGING_BASE = {
  entity: "BSS", as_of: "2026-10-06", buckets: ["current", "1-30"], rows: [AGING_ROW],
  bucket_totals: { current: money(500_000), "1-30": money(0) },
  total_outstanding: money(500_000), total_unallocated_credit: money(0), total_net: money(500_000),
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

describe("unpaid bills by age", () => {
  it("names the payment terms under the vendor for a role that may read them", () => {
    mocks.aging = AGING_BASE;
    render(<ApAgingScreen entity="BSS" currency="NGN" />);
    expect(headers()[0]).toBe("Vendor");
    expect(headers().at(-1)).toBe("Status");
    expect(firstRow()).toHaveLength(headers().length);
    expect(firstRow()[0].textContent).toContain("Net 30 days");
  });

  it("names none when the row came without terms", () => {
    const { payment_terms: _terms, ...bare } = AGING_ROW;
    void _terms;
    mocks.aging = { ...AGING_BASE, rows: [bare] };
    render(<ApAgingScreen entity="BSS" currency="NGN" />);
    expect(firstRow()[0].textContent).toBe("Ade Stationers");
    expect(container.textContent).not.toContain("Net 30");
    expect(firstRow()).toHaveLength(headers().length);
  });
});

