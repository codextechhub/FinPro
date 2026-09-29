import { describe, expect, it } from "vitest";

import { todayIn } from "./dates";
import { presetRange, sinceDate } from "./date-presets";

/** 00:30 on 1 Sep 2026 in Lagos, still 31 Aug in UTC. */
const JUST_PAST_LAGOS_MIDNIGHT = new Date("2026-08-31T23:30:00Z");
const today = todayIn("Africa/Lagos", JUST_PAST_LAGOS_MIDNIGHT);

describe("presetRange", () => {
  it("runs this month from its first day to its last, just past Lagos midnight", () => {
    // The ledger built these from local-midnight Dates and toISOString(), and
    // in Lagos offered 31 Aug to 29 Sep for "this month", every time.
    expect(today).toBe("2026-09-01");
    expect(presetRange("this-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("runs last month from its first day to its last", () => {
    expect(presetRange("last-month", today)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(presetRange("last-month", "2026-03-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("runs the year to date from 1 January to today", () => {
    expect(presetRange("ytd", "2026-09-29")).toEqual({ from: "2026-01-01", to: "2026-09-29" });
  });

  it("leaves any other preset unbounded", () => {
    expect(presetRange("all", today)).toEqual({ from: "", to: "" });
  });
});

describe("sinceDate", () => {
  it("starts 'today' on the school's day, not the UTC one", () => {
    // The audit log's "Today" filter read the date from UTC after setting a
    // local day, and asked for 31 Aug here.
    expect(sinceDate("today", today)).toBe("2026-09-01");
  });

  it("counts days back on the calendar", () => {
    expect(sinceDate("7", today)).toBe("2026-08-25");
    expect(sinceDate("30", today)).toBe("2026-08-02");
  });

  it("sets no bound for no preset", () => {
    expect(sinceDate("", today)).toBeUndefined();
  });
});
