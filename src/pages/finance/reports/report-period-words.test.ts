/**
 * The headings a report shows with no month chosen read as its downloaded file does.
 *
 * Mrs Bello opens Changes in equity with no month and prints the file for the
 * board: the file is headed "Inception to date", so the screen she printed it
 * from says the same, not "Year to date".
 */
import { describe, expect, it } from "vitest";

import {
  ANALYTICS_NO_PERIOD, cashFlowNoPeriod, EQUITY_NO_PERIOD, currentFiscalYearChoice, incomeStatementNoPeriod, TRIAL_BALANCE_NO_PERIOD,
} from "./report-period-words";

describe("the no-month headings", () => {
  it("match the words each report's file carries", () => {
    expect(TRIAL_BALANCE_NO_PERIOD).toBe("All periods");
    expect(ANALYTICS_NO_PERIOD).toBe("All periods");
    expect(EQUITY_NO_PERIOD).toBe("Inception to date");
  });

  it("names the income statement's year the way its file does, with no space", () => {
    expect(incomeStatementNoPeriod(2026)).toBe("FY2026");
    expect(incomeStatementNoPeriod(null)).toBe("Year to date");
  });

  it("names the cash flow's year as the income statement does", () => {
    expect(cashFlowNoPeriod(2026)).toBe("FY2026");
    expect(cashFlowNoPeriod(null)).toBe("Year to date");
  });

  it("words the picker's first choice with the year its heading names", () => {
    expect(currentFiscalYearChoice(2026)).toBe("This fiscal year (FY2026)");
    expect(currentFiscalYearChoice(2026)).toContain(incomeStatementNoPeriod(2026));
    expect(currentFiscalYearChoice(null)).toBe("Year to date");
  });
});
