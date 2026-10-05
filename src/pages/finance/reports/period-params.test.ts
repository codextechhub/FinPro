/**
 * Bright Star's first periods have ids 1 to 24. "March 2025" is id 3; sent as an
 * id it would be read as March of the latest year, so it is sent as FY2025,
 * period 3.
 */
import { describe, expect, it } from "vitest";

import { periodParams } from "./period-params";

const PERIODS = [
  { id: 3, fiscal_year: 2025, period_no: 3 },
  { id: 15, fiscal_year: 2026, period_no: 3 },
];

describe("a picked report period", () => {
  it("is sent as its year and number", () => {
    expect(periodParams(PERIODS, "3")).toEqual({ fiscal_year: 2025, period: 3 });
    expect(periodParams(PERIODS, 15)).toEqual({ fiscal_year: 2026, period: 3 });
  });

  it("sends nothing for all periods, or a period no longer listed", () => {
    expect(periodParams(PERIODS, "")).toEqual({});
    expect(periodParams(PERIODS, "99")).toEqual({});
  });
});
