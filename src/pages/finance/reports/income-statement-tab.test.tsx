/**
 * The income statement's heading with no month chosen is the fiscal year, as its file reads it.
 *
 * Mrs Bello opens the statement with nothing picked in 2026: the server covers
 * the whole of the year today falls in and names it 2026, and the downloaded
 * file is headed "FY2026". The screen's heading and its amount column read
 * "FY2026" too, not "2026 fiscal year". A month picked reads in words.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ periodLabel: null as string | null, fiscalYear: 2026 as number | null }));

const zero = { kobo: 0, naira: "0" };
vi.mock("@/redux/services/finance/reports-api", () => ({
  useGetIncomeStatementQuery: () => ({
    data: {
      data: {
        entity: "HOLYCROSS", narrowed: false, period: null, period_label: mocks.periodLabel, fiscal_year: mocks.fiscalYear,
        prior_fiscal_year: null, has_budget: false, has_prior_year: false, income: [], expense: [],
        totals: { income: { amount: zero }, expense: { amount: zero }, net: { amount: zero } },
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

import { IncomeStatementReport } from "./income-statement-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const heading = () => container.querySelector("[data-testid='report-period']")?.textContent;

describe("the income statement heading", () => {
  it("reads the fiscal year as the file does when no month is chosen", () => {
    mocks.periodLabel = null; mocks.fiscalYear = 2026;
    act(() => root.render(<IncomeStatementReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("FY2026");
    expect(container.textContent).not.toContain("2026 fiscal year");
  });

  it("reads Year to date only when the books hold no fiscal year", () => {
    mocks.periodLabel = null; mocks.fiscalYear = null;
    act(() => root.render(<IncomeStatementReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("Year to date");
  });

  it("reads the month in words when the server names one", () => {
    mocks.periodLabel = "September 2026"; mocks.fiscalYear = 2026;
    act(() => root.render(<IncomeStatementReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("September 2026");
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
    act(() => root.render(<IncomeStatementReport entity="HOLYCROSS" currency="NGN" />));
    expect(firstChoice()).toBe("This fiscal year (FY2026)");
    expect(heading()).toBe("FY2026");
  });

  it("still names the current year after another is picked", () => {
    mocks.periodLabel = null; mocks.fiscalYear = 2026;
    act(() => root.render(<IncomeStatementReport entity="HOLYCROSS" currency="NGN" />));
    mocks.fiscalYear = 2025;
    pick("fy:2026");
    expect(firstChoice()).toBe("This fiscal year (FY2026)");
  });

  it("reads Year to date only when the books hold no fiscal year", () => {
    mocks.periodLabel = null; mocks.fiscalYear = null;
    act(() => root.render(<IncomeStatementReport entity="HOLYCROSS" currency="NGN" />));
    expect(firstChoice()).toBe("Year to date");
  });
});
