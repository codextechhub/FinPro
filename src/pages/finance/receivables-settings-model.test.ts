/**
 * The provision bands as the receivables settings form checks them.
 *
 * The default ladder is 25% over 180 days, 50% over 365 and 100% over 730. The
 * bursar raises the first band to 30%; a ladder whose rate falls with age, or
 * two bands starting at the same age, is refused before it is saved.
 */
import { describe, expect, it } from "vitest";
import { bandDrafts, parseBands, sameBands } from "./receivables-settings-model";

const DEFAULTS = [{ over_days: 180, rate_bps: 2500 }, { over_days: 365, rate_bps: 5000 }, { over_days: 730, rate_bps: 10000 }];

describe("provision bands", () => {
  it("round-trips the default ladder", () => {
    const drafts = bandDrafts(DEFAULTS);
    expect(drafts[0]).toEqual({ days: "180", percent: "25" });
    expect(parseBands(drafts)).toEqual({ bands: DEFAULTS, problem: null });
    expect(sameBands(parseBands(drafts).bands, DEFAULTS)).toBe(true);
  });

  it("sorts by age and keeps fractional rates in basis points", () => {
    const parsed = parseBands([{ days: "365", percent: "50" }, { days: "180", percent: "30.5" }]);
    expect(parsed.bands).toEqual([{ over_days: 180, rate_bps: 3050 }, { over_days: 365, rate_bps: 5000 }]);
    expect(sameBands(parsed.bands, DEFAULTS)).toBe(false);
  });

  it("refuses a rate that falls with age, a repeated age, and values out of range", () => {
    expect(parseBands([{ days: "180", percent: "50" }, { days: "365", percent: "25" }]).problem).toMatch(/older band/);
    expect(parseBands([{ days: "180", percent: "25" }, { days: "180", percent: "50" }]).problem).toMatch(/same age/);
    expect(parseBands([{ days: "180", percent: "101" }]).problem).toMatch(/0 to 100/);
    expect(parseBands([{ days: "-1", percent: "10" }]).problem).toMatch(/whole number/);
    expect(parseBands([{ days: "", percent: "10" }]).problem).toMatch(/whole number/);
    expect(parseBands([]).problem).toMatch(/at least one/);
  });
});
