/**
 * Changes in equity names its period as its downloaded file does.
 *
 * Mrs Bello opens the statement with no month chosen and downloads it for the
 * board. The file is headed "Inception to date" because the whole ledger up to
 * today is its window, so the screen reads the same, not "Year to date". With
 * September chosen both read "September 2026".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ periodLabel: null as string | null }));

vi.mock("@/redux/services/finance/reports-api", () => ({
  useGetChangesInEquityQuery: () => ({
    data: {
      data: {
        entity: "HOLYCROSS", narrowed: false, period: null, period_label: mocks.periodLabel, as_of: "2026-09-30",
        columns: [],
        total_opening: { kobo: 0, naira: "0" }, total_profit: { kobo: 0, naira: "0" },
        total_contributions: { kobo: 0, naira: "0" }, total_closing: { kobo: 0, naira: "0" },
        balance_sheet_equity: { kobo: 0, naira: "0" }, is_reconciled: true,
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

import { EquityReport } from "./equity-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const heading = () => container.querySelector("[data-testid='report-period']")?.textContent;

describe("the changes in equity heading", () => {
  it("reads Inception to date when no month is chosen, as the file does", () => {
    mocks.periodLabel = null;
    act(() => root.render(<EquityReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("Inception to date");
    expect(container.querySelector("select option[value='']")?.textContent).toBe("Inception to date");
    expect(container.textContent).not.toContain("Year to date");
  });

  it("reads the month in words when the server names one", () => {
    mocks.periodLabel = "September 2026";
    act(() => root.render(<EquityReport entity="HOLYCROSS" currency="NGN" />));
    expect(heading()).toBe("September 2026");
  });
});
