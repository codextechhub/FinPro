/**
 * The statutory pack reads as one filing: four statements use the subtitles
 * shared with its download, the export buttons carry the selected window, and
 * a branch-bound reader is told why no partial filing exists.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  wholeSchool: true,
  packQuery: vi.fn(),
  export: vi.fn(),
}));

vi.mock("@/redux/services/finance/reports-api", () => ({
  useGetStatutoryPackQuery: (...args: unknown[]) => mocks.packQuery(...args),
}));

vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetPeriodsQuery: () => ({ data: { data: [
    { id: 41, fiscal_year: 2026, period_no: 3, label: "March 2026" },
  ] } }),
}));

vi.mock("@/utils/finance-export", () => ({
  viewReportExport: (...args: unknown[]) => mocks.export(...args),
}));

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({
    wholeSchool: mocks.wholeSchool,
    branchIds: mocks.wholeSchool ? null : [2],
    covers: () => mocks.wholeSchool,
  }),
}));

vi.mock("../../../lib/display-prefs", () => ({
  useDates: () => ({
    today: () => "2026-10-07",
    day: (value: string) => value === "2026-10-07" ? "7 Oct 2026" : value,
  }),
}));

vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: ({ value }: { value: string }) => <div data-date={value} />,
}));

import { STATUTORY_PACK_REACH_MESSAGE } from "./statutory-pack-access";
import { StatutoryPackReport } from "./statutory-pack-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: String(kobo / 100) });
const PACK = {
  entity: "BRIGHTSTAR",
  as_of: "2026-10-07",
  period: null,
  period_label: null,
  fiscal_year: 2026,
  headings: {
    statement_of_financial_position: "As at 7 Oct 2026",
    income_statement: "Fiscal year 2026",
    cash_flow: "Fiscal year 2026",
    changes_in_equity: "Inception to 7 Oct 2026",
  },
  statement_of_financial_position: {
    sections: [{
      key: "current_assets", label: "Current assets", total: money(15000000),
      groups: [{ line: "trade_receivables", label: "Accounts receivable (what customers owe)", amount: money(15000000), accounts: [] }],
    }],
    total_assets: money(15000000), total_equity: money(9000000), total_liabilities: money(6000000), is_balanced: true,
  },
  income_statement: {
    lines: [{ line: "revenue", label: "Revenue (income earned)", amount: money(8000000), accounts: [] }],
    total_income: money(8000000), total_expense: money(3000000), net_income: money(5000000),
  },
  cash_flow: {
    opening_cash: money(1000000), closing_cash: money(3500000),
    by_activity: { operating: money(3000000), investing: money(-500000), financing: money(0) },
    net_change: money(2500000), is_reconciled: true,
  },
  changes_in_equity: {
    total_opening: money(4000000), total_profit: money(5000000), total_contributions: money(0),
    total_transfers: money(0), total_closing: money(9000000), is_reconciled: true,
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.wholeSchool = true;
  mocks.export.mockReset();
  mocks.packQuery.mockReset();
  mocks.packQuery.mockReturnValue({
    data: { data: PACK }, isLoading: false, isFetching: false, isError: false,
    error: undefined, refetch: vi.fn(),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async () => act(async () => root.render(
  <MemoryRouter><StatutoryPackReport entity="BRIGHTSTAR" currency="NGN" /></MemoryRouter>,
));
const button = (label: string) => Array.from(container.querySelectorAll("button"))
  .find((candidate) => candidate.textContent?.trim() === label);

describe("Statutory pack", () => {
  it("renders every statement with the exact download heading and paired filing lines", async () => {
    await render();

    expect(container.textContent).toContain("Statement of financial position");
    expect(container.textContent).toContain("Income statement");
    expect(container.textContent).toContain("Cash flow statement");
    expect(container.textContent).toContain("Statement of changes in equity");
    const section = (testId: string) => container.querySelector(`[data-testid="${testId}"]`)?.textContent;
    expect(section("statutory-position")).toContain(PACK.headings.statement_of_financial_position);
    expect(section("statutory-income")).toContain(PACK.headings.income_statement);
    expect(section("statutory-cash-flow")).toContain(PACK.headings.cash_flow);
    expect(section("statutory-equity")).toContain(PACK.headings.changes_in_equity);
    expect(container.textContent).toContain("Accounts receivable (what customers owe)");
    expect(container.textContent).toContain("Revenue (income earned)");
    expect(container.textContent).toContain("₦150,000.00");
  });

  it("asks the statutory endpoint for every download format with the visible window", async () => {
    await render();

    await act(async () => button("CSV")!.click());
    await act(async () => button("XLSX")!.click());
    await act(async () => button("PDF")!.click());

    for (const format of ["csv", "xlsx", "pdf"]) {
      expect(mocks.export).toHaveBeenCalledWith(
        "/finance/reports/statutory-pack/",
        { entity: "BRIGHTSTAR", as_of: "2026-10-07" },
        format,
      );
    }
  });

  it("sends the selected period and position date to the query and download", async () => {
    await render();

    const periodSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Reporting period"]')!;
    await act(async () => {
      periodSelect.value = "41";
      periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const selectedWindow = {
      entity: "BRIGHTSTAR",
      as_of: "2026-10-07",
      fiscal_year: 2026,
      period: 3,
    };
    expect(mocks.packQuery).toHaveBeenLastCalledWith(selectedWindow, { skip: false });

    await act(async () => button("PDF")!.click());
    expect(mocks.export).toHaveBeenCalledWith(
      "/finance/reports/statutory-pack/",
      selectedWindow,
      "pdf",
    );
  });

  it("shows the server's sentence to a branch-bound reader and sends no request", async () => {
    mocks.wholeSchool = false;
    await render();

    expect(container.textContent).toContain(STATUTORY_PACK_REACH_MESSAGE);
    expect(mocks.packQuery).toHaveBeenCalledWith(
      { entity: "BRIGHTSTAR", as_of: "2026-10-07" },
      { skip: true },
    );
    expect(button("PDF")).toBeUndefined();
  });

  it("shows the same sentence when the server refuses a stale direct route", async () => {
    const serverSentence = "This filing is available only across every branch.";
    mocks.packQuery.mockReturnValue({
      data: undefined, isLoading: false, isFetching: false, isError: true,
      error: { status: 403, data: { message: serverSentence } }, refetch: vi.fn(),
    });
    await render();

    expect(container.textContent).toContain(serverSentence);
  });
});
