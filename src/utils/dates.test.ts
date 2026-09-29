import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISPLAY_PREFS,
  addDays,
  calendarDayOf,
  formatDateTime,
  formatDay,
  formatDayMonth,
  formatMonthSpan,
  formatMonthYear,
  formatTime,
  monthBounds,
  nowIn,
  resolveDisplayPrefs,
  todayIn,
  zoneForBranch,
  zonedInstant,
  zonedInstantFromInput,
  type DisplayPrefs,
} from "./dates";

const LAGOS: DisplayPrefs = DEFAULT_DISPLAY_PREFS;
const NAIROBI: DisplayPrefs = { ...LAGOS, timeZone: "Africa/Nairobi" };
const SLASHED: DisplayPrefs = { ...LAGOS, dateFormat: "DD_MM_YYYY" };
const ISO: DisplayPrefs = { ...LAGOS, dateFormat: "YYYY_MM_DD" };
const H24: DisplayPrefs = { ...LAGOS, clock: "H24" };

/** 23:30 UTC on 28 Sep: 00:30 on the 29th in Lagos (UTC+1), 02:30 in Nairobi (UTC+3). */
const PAST_LAGOS_MIDNIGHT = "2026-09-28T23:30:00Z";
/** 21:30 UTC on 28 Sep: 22:30 on the 28th in Lagos, 00:30 on the 29th in Nairobi. */
const PAST_NAIROBI_MIDNIGHT = "2026-09-28T21:30:00Z";

describe("formatDay", () => {
  it("writes a calendar date in each of the three formats", () => {
    expect(formatDay("2026-09-29", LAGOS)).toBe("29 Sep 2026");
    expect(formatDay("2026-09-29", SLASHED)).toBe("29/09/2026");
    expect(formatDay("2026-09-29", ISO)).toBe("2026-09-29");
  });

  it("never moves a calendar date, whatever the zone", () => {
    // `new Date("2026-01-01").toLocaleDateString()` read this as UTC midnight,
    // which is 31 Dec anywhere west of Greenwich.
    for (const timeZone of ["Africa/Lagos", "Africa/Nairobi", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      expect(formatDay("2026-01-01", { ...LAGOS, timeZone })).toBe("1 Jan 2026");
      expect(formatDay("2026-12-31", { ...LAGOS, timeZone })).toBe("31 Dec 2026");
    }
  });

  it("writes an instant as the day it fell on in the zone", () => {
    expect(formatDay(PAST_NAIROBI_MIDNIGHT, LAGOS)).toBe("28 Sep 2026");
    expect(formatDay(PAST_NAIROBI_MIDNIGHT, NAIROBI)).toBe("29 Sep 2026");
    expect(formatDay(PAST_LAGOS_MIDNIGHT, LAGOS)).toBe("29 Sep 2026");
  });

  it("reads a full timestamp with microseconds as its day, rather than throwing", () => {
    expect(formatDay("2026-08-14T09:59:08.835589Z", LAGOS)).toBe("14 Aug 2026");
  });

  it("says '-' for nothing and for nonsense", () => {
    expect(formatDay(null, LAGOS)).toBe("-");
    expect(formatDay(undefined, LAGOS)).toBe("-");
    expect(formatDay("", LAGOS)).toBe("-");
    expect(formatDay("not a date", LAGOS)).toBe("-");
  });
});

describe("formatDayMonth and month labels", () => {
  it("drops the year in the school's format", () => {
    expect(formatDayMonth("2026-09-05", LAGOS)).toBe("5 Sep");
    expect(formatDayMonth("2026-09-05", SLASHED)).toBe("05/09");
    expect(formatDayMonth("2026-09-05", ISO)).toBe("09-05");
  });

  it("names the month the same way in every format", () => {
    expect(formatMonthYear("2026-09-01", LAGOS)).toBe("Sep 2026");
    expect(formatMonthYear("2026-09-01", ISO)).toBe("Sep 2026");
  });

  it("spans one month, months within a year, and months across a year", () => {
    expect(formatMonthSpan("2026-09-01", "2026-09-30", LAGOS)).toBe("Sep 2026");
    expect(formatMonthSpan("2026-01-01", "2026-03-31", LAGOS)).toBe("Jan–Mar 2026");
    expect(formatMonthSpan("2025-11-01", "2026-01-31", LAGOS)).toBe("Nov 2025–Jan 2026");
  });
});

describe("formatTime and formatDateTime", () => {
  it("writes the time on both clocks", () => {
    const eightAm = "2026-09-29T07:00:00Z";
    expect(formatTime(eightAm, LAGOS)).toBe("8:00 am");
    expect(formatTime(eightAm, H24)).toBe("08:00");
    expect(formatTime("2026-09-29T11:05:00Z", LAGOS)).toBe("12:05 pm");
    expect(formatTime("2026-09-28T23:05:00Z", LAGOS)).toBe("12:05 am");
    expect(formatTime("2026-09-29T19:45:00Z", H24)).toBe("20:45");
  });

  it("adds seconds only when asked", () => {
    expect(formatTime("2026-09-29T07:00:09Z", H24, { seconds: true })).toBe("08:00:09");
    expect(formatDateTime("2026-09-29T07:00:09Z", LAGOS, { seconds: true })).toBe("29 Sep 2026, 8:00:09 am");
  });

  it("writes the date and the time together in every format", () => {
    const instant = "2026-09-29T07:00:00Z";
    expect(formatDateTime(instant, LAGOS)).toBe("29 Sep 2026, 8:00 am");
    expect(formatDateTime(instant, { ...SLASHED, clock: "H24" })).toBe("29/09/2026, 08:00");
    expect(formatDateTime(instant, ISO)).toBe("2026-09-29, 8:00 am");
  });

  it("reads one instant differently either side of the Lagos and Nairobi midnights", () => {
    expect(formatDateTime(PAST_NAIROBI_MIDNIGHT, LAGOS)).toBe("28 Sep 2026, 10:30 pm");
    expect(formatDateTime(PAST_NAIROBI_MIDNIGHT, NAIROBI)).toBe("29 Sep 2026, 12:30 am");
  });

  it("gives a calendar date no invented midnight", () => {
    expect(formatDateTime("2026-09-29", LAGOS)).toBe("29 Sep 2026");
    expect(formatTime("2026-09-29", LAGOS)).toBe("-");
  });
});

describe("todayIn and nowIn", () => {
  it("is already tomorrow in Nairobi while it is still today in Lagos", () => {
    const now = new Date(PAST_NAIROBI_MIDNIGHT);
    expect(todayIn("Africa/Lagos", now)).toBe("2026-09-28");
    expect(todayIn("Africa/Nairobi", now)).toBe("2026-09-29");
  });

  it("is the Lagos date just past Lagos midnight, not the UTC one", () => {
    // A form defaulted with `new Date().toISOString().slice(0, 10)` offered
    // the 28th here, for the whole first hour of the 29th.
    expect(todayIn("Africa/Lagos", new Date(PAST_LAGOS_MIDNIGHT))).toBe("2026-09-29");
  });

  it("reads the wall clock in the zone", () => {
    expect(nowIn("Africa/Lagos", new Date(PAST_LAGOS_MIDNIGHT))).toEqual({
      date: "2026-09-29", hour: 0, minute: 30, second: 0,
    });
  });
});

describe("zonedInstant", () => {
  it("is the moment the school's clock reads the given time, wherever the typist is", () => {
    expect(zonedInstant("2026-09-30", "17:00", "Africa/Lagos")).toBe("2026-09-30T16:00:00.000Z");
    expect(zonedInstant("2026-09-30", "17:00", "Africa/Nairobi")).toBe("2026-09-30T14:00:00.000Z");
    expect(zonedInstant("2026-09-29", "00:00:00", "Africa/Lagos")).toBe("2026-09-28T23:00:00.000Z");
  });

  it("follows a zone with daylight saving on either side of the change", () => {
    expect(zonedInstant("2026-01-15", "09:00", "Europe/London")).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedInstant("2026-07-15", "09:00", "Europe/London")).toBe("2026-07-15T08:00:00.000Z");
  });

  it("reads a datetime-local input value, and nothing from an empty one", () => {
    expect(zonedInstantFromInput("2026-09-30T17:00", "Africa/Lagos")).toBe("2026-09-30T16:00:00.000Z");
    expect(zonedInstantFromInput("", "Africa/Lagos")).toBeNull();
  });
});

describe("calendar arithmetic", () => {
  it("moves across month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-01", -30)).toBe("2026-01-30");
  });

  it("ends a month on its last day, not the day before", () => {
    // Fixed-asset depreciation defaulted to
    // `new Date(y, m + 1, 0).toISOString()`, local midnight on the 30th read
    // back as 23:00 UTC on the 29th in Lagos: a day short every month.
    expect(monthBounds("2026-09-29")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthBounds(todayIn("Africa/Lagos", new Date("2026-09-30T23:30:00Z"))).to).toBe("2026-10-31");
  });

  it("finds the neighbouring months' bounds too", () => {
    expect(monthBounds("2026-03-15", -1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2026-01-10", -1)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("reads a calendar date back unchanged and an instant as its day in the zone", () => {
    expect(calendarDayOf("2026-09-29", "Pacific/Kiritimati")).toBe("2026-09-29");
    expect(calendarDayOf(PAST_LAGOS_MIDNIGHT, "Africa/Lagos")).toBe("2026-09-29");
    expect(calendarDayOf(PAST_LAGOS_MIDNIGHT, "UTC")).toBe("2026-09-28");
  });
});

describe("resolveDisplayPrefs", () => {
  it("defaults everything when there is no display object, as in the console", () => {
    expect(resolveDisplayPrefs(undefined)).toEqual({
      timeZone: "Africa/Lagos", dateFormat: "D_MMM_YYYY", clock: "H12",
    });
  });

  it("takes what the school chose", () => {
    expect(resolveDisplayPrefs({ time_zone: "Africa/Nairobi", date_format: "DD_MM_YYYY", clock: "H24" }))
      .toEqual({ timeZone: "Africa/Nairobi", dateFormat: "DD_MM_YYYY", clock: "H24" });
  });

  it("defaults each field it does not recognise, one at a time", () => {
    expect(resolveDisplayPrefs({ time_zone: "Mars/Olympus", date_format: "MM_DD_YYYY", clock: "H24" }))
      .toEqual({ timeZone: "Africa/Lagos", dateFormat: "D_MMM_YYYY", clock: "H24" });
  });

  it("shows a branch in its own zone and every other branch in the school's", () => {
    const display = { time_zone: "Africa/Lagos", branch_zones: { "12": "Africa/Nairobi", "13": "Nowhere/Real" } };
    expect(zoneForBranch(display, 12)).toBe("Africa/Nairobi");
    expect(zoneForBranch(display, "12")).toBe("Africa/Nairobi");
    expect(zoneForBranch(display, 7)).toBe("Africa/Lagos");
    expect(zoneForBranch(display, 13)).toBe("Africa/Lagos");
    expect(zoneForBranch(display, null)).toBe("Africa/Lagos");
    expect(resolveDisplayPrefs(display, 12).timeZone).toBe("Africa/Nairobi");
  });
});
