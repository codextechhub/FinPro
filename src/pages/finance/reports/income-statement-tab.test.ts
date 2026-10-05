/**
 * The Income Statement's window: year to date, one whole fiscal year, or one
 * period of a year. In 2027 Mrs Bello picks the whole of FY2026 to see its real
 * profit after the close; a month is sent as its year and period number, never
 * as a row id, because the server reads a small `period` as a period number.
 */
import { describe, expect, it } from "vitest";

import { fiscalYearsOf, incomeWindowParams } from "./income-statement-tab";

describe("the income statement's window", () => {
  it("sends nothing for year to date", () => {
    expect(incomeWindowParams("")).toEqual({});
  });

  it("sends the year alone for a whole earlier fiscal year", () => {
    expect(incomeWindowParams("fy:2026")).toEqual({ fiscal_year: 2026 });
  });

  it("sends a month as its year and period number", () => {
    expect(incomeWindowParams("p:2026:12")).toEqual({ fiscal_year: 2026, period: 12 });
  });

  it("lists each fiscal year once, newest first", () => {
    expect(fiscalYearsOf([{ fiscal_year: 2026 }, { fiscal_year: 2027 }, { fiscal_year: 2026 }])).toEqual([2027, 2026]);
  });
});
