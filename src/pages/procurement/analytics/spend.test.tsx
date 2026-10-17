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

const NO_CHOICE = { applies: false, canChoose: false, selected: "all", showBranch: false, offerUnassigned: false, choices: [] };
const mocks = vi.hoisted(() => ({
  spend: undefined as unknown, aging: undefined as unknown, performance: undefined as unknown,
  branchView: undefined as unknown, spendArgs: [] as unknown[],
}));

vi.mock("@/components/finance-ui/list-branch", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useListBranch: () => ({ view: mocks.branchView, choose: vi.fn() }),
}));

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
    useGetSpendAnalysisQuery: (args: unknown) => { mocks.spendArgs.push(args); return result(() => mocks.spend); },
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
  mocks.branchView = NO_CHOICE;
  mocks.spendArgs = [];
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

describe("the branch the report answers for", () => {
  const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];
  const lastArgs = () => mocks.spendArgs[mocks.spendArgs.length - 1] as { branch?: unknown };

  it("asks the server for the branch Mrs Bello picked, and offers her the picker", () => {
    mocks.spend = SPEND_BASE;
    mocks.branchView = { applies: true, canChoose: true, selected: 2, showBranch: false, offerUnassigned: true, choices: BRANCHES };
    render(<SpendScreen entity="BSS" currency="NGN" />);
    expect(lastArgs().branch).toBe(2);
    const picker = container.querySelector<HTMLSelectElement>('select[aria-label="Branch"]');
    expect(picker?.value).toBe("2");
  });

  it("asks for every branch in reach under All branches", () => {
    mocks.spend = SPEND_BASE;
    mocks.branchView = { applies: true, canChoose: true, selected: "all", showBranch: true, offerUnassigned: true, choices: BRANCHES };
    render(<SpendScreen entity="BSS" currency="NGN" />);
    expect(lastArgs().branch).toBeUndefined();
  });

  it("asks for the bills with no branch yet in the Procurement server's own spelling", () => {
    mocks.spend = SPEND_BASE;
    mocks.branchView = { applies: true, canChoose: true, selected: "unassigned", showBranch: false, offerUnassigned: true, choices: BRANCHES };
    render(<SpendScreen entity="BSS" currency="NGN" />);
    expect(lastArgs().branch).toBe("none");
  });

  it("shows no picker to a reader posted to one branch", () => {
    mocks.spend = SPEND_BASE;
    mocks.branchView = { applies: true, canChoose: false, selected: 2, showBranch: false, offerUnassigned: false, choices: [BRANCHES[1]] };
    render(<SpendScreen entity="BSS" currency="NGN" />);
    expect(container.querySelector('select[aria-label="Branch"]')).toBeNull();
    expect(lastArgs().branch).toBeUndefined();
  });
});
