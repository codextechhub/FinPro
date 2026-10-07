/**
 * The cash flow heading with no month chosen is the fiscal year, as its file reads it.
 *
 * Mrs Bello opens the cash flow statement with nothing picked in 2026: the
 * server covers the year to date and names it 2026, and the downloaded file is
 * headed "<entity> · FY2026", so the screen reads "FY2026" too. A month picked
 * reads in words and opens with the cash the school really held on its first
 * day, which the statement shows as its opening line. "Year to date" stays for
 * a school with no fiscal year at all.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  periodLabel: null as string | null,
  fiscalYear: 2026 as number | null,
  openingKobo: 0,
}));

const money = (kobo: number) => ({ kobo, naira: String(kobo / 100) });
vi.mock("@/redux/services/finance/reports-api", () => ({
  useGetCashFlowQuery: () => ({
    data: {
      data: {
        entity: "HOLYCROSS", narrowed: false, period: null, period_label: mocks.periodLabel, fiscal_year: mocks.fiscalYear,
        opening_cash: money(mocks.openingKobo), closing_cash: money(mocks.openingKobo),
        by_activity: {}, activity_lines: {}, net_change: money(0), is_reconciled: true,
      },
    },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
}));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetPeriodsQuery: () => ({ data: { data: [{ id: 9, name: "2026-09", label: "September 2026", fiscal_year: 2026, period_no: 9 }] } }),
}));
vi.mock("@/components/finance-ui/archived-years", () => ({
  includeArchivedArg: () => ({}),
  useShowArchived: () => [false, vi.fn()],
}));

import { CashFlowReport } from "./cash-flow-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const heading = () => container.querySelector("[data-testid='report-period']")?.textContent;

describe("the cash flow heading", () => {
  it("reads the fiscal year as the file does when no month is chosen", () => {
    mocks.periodLabel = null; mocks.fiscalYear = 2026; mocks.openingKobo = 0;
    act(() => root.render(<CashFlowReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("FY2026");
  });

  it("reads Year to date only when the books hold no fiscal year", () => {
    mocks.periodLabel = null; mocks.fiscalYear = null; mocks.openingKobo = 0;
    act(() => root.render(<CashFlowReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("Year to date");
  });

  it("reads the month in words and shows the cash held at its start", () => {
    mocks.periodLabel = "September 2026"; mocks.fiscalYear = null; mocks.openingKobo = 125_000_000;
    act(() => root.render(<CashFlowReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("September 2026");
    expect(container.textContent).toContain("Cash at start of period");
    expect(container.textContent).toContain("1,250,000");
  });
});

describe("the period picker's first choice", () => {
  const firstChoice = () => container.querySelector("select option")?.textContent;
  const pick = (value: string) => {
    const select = container.querySelector("select") as HTMLSelectElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    act(() => { setValue.call(select, value); select.dispatchEvent(new Event("change", { bubbles: true })); });
  };

  it("names the fiscal year its heading names", () => {
    mocks.periodLabel = null; mocks.fiscalYear = 2026;
    act(() => root.render(<CashFlowReport entity="HOLYCROSS" currency="NGN" />));
    expect(firstChoice()).toBe("This fiscal year (FY2026)");
    expect(heading()).toBe("FY2026");
  });

  it("still names the current year after another is picked", () => {
    mocks.periodLabel = null; mocks.fiscalYear = 2026;
    act(() => root.render(<CashFlowReport entity="HOLYCROSS" currency="NGN" />));
    mocks.fiscalYear = 2025;
    pick("9");
    expect(firstChoice()).toBe("This fiscal year (FY2026)");
  });

  it("reads Year to date only when the books hold no fiscal year", () => {
    mocks.periodLabel = null; mocks.fiscalYear = null;
    act(() => root.render(<CashFlowReport entity="HOLYCROSS" currency="NGN" />));
    expect(firstChoice()).toBe("Year to date");
  });
});
