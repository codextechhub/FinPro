/**
 * The trial balance names the month it covers in words.
 *
 * Mrs Bello picks September and the heading, the totals' footnote and the
 * prior-period column read "September 2026" and "August 2026" as the server
 * sends them; the stored names "2026-09" and "2026-08" never reach the screen.
 * With no period picked, the report reads "All periods".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ period: "2026-09" as string | null, periodLabel: "September 2026" as string | null }));

vi.mock("@/redux/services/finance/reports-api", () => ({
  useGetTrialBalanceQuery: () => ({
    data: {
      data: {
        entity: "HOLYCROSS", narrowed: false, period: mocks.period, period_label: mocks.periodLabel,
        rows: [], total_debit: { kobo: 0, naira: "0" }, total_credit: { kobo: 0, naira: "0" }, is_balanced: true,
      },
    },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
}));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetPeriodsQuery: () => ({
    data: {
      data: [
        { id: 8, name: "2026-08", label: "August 2026", fiscal_year: 2026, period_no: 8 },
        { id: 9, name: "2026-09", label: "September 2026", fiscal_year: 2026, period_no: 9 },
      ],
    },
  }),
}));
vi.mock("@/components/finance-ui/archived-years", () => ({
  includeArchivedArg: () => ({}),
  useShowArchived: () => [false, vi.fn()],
}));

import { TrialBalanceReport } from "./trial-balance-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("the trial balance heading", () => {
  it("is the period in words, never its stored name", () => {
    mocks.period = "2026-09"; mocks.periodLabel = "September 2026";
    act(() => root.render(<TrialBalanceReport entity="HOLYCROSS" currency="NGN" />));
    expect(container.querySelector("[data-testid='report-period']")?.textContent).toBe("September 2026");
    expect(container.textContent).not.toContain("2026-09");
  });

  it("reads All periods when the report covers every period", () => {
    mocks.period = null; mocks.periodLabel = null;
    act(() => root.render(<TrialBalanceReport entity="HOLYCROSS" currency="NGN" />));
    expect(container.querySelector("[data-testid='report-period']")?.textContent).toBe("All periods");
  });
});
