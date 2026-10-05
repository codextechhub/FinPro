import { describe, expect, it } from "vitest";

import { dayCount, fiscalRunwayNotice } from "./fiscal-runway-model";
import type { FiscalRunway } from "@/redux/services/finance/reports-types";

// The dates are pre-formatted by the screen, so the test can use the raw ISO text
// and still assert the sentence the operator reads.
const asIs = (iso: string) => iso;

function runway(over: Partial<FiscalRunway>): FiscalRunway {
  return {
    status: "HEALTHY", calendar_end: "2026-12-31", days_remaining: 141,
    threshold_days: 60, ...over,
  };
}

describe("fiscalRunwayNotice", () => {
  it("says nothing while the calendar has plenty of runway", () => {
    expect(fiscalRunwayNotice(runway({}), asIs)).toBeNull();
  });

  it("says nothing when the block is missing entirely", () => {
    // An older backend, or a payload that failed to include the block, must leave
    // the dashboard silent rather than render a half-filled alarm.
    expect(fiscalRunwayNotice(undefined, asIs)).toBeNull();
  });

  it("warns, without alarm, while the calendar is running out", () => {
    const notice = fiscalRunwayNotice(
      runway({ status: "EXPIRING", days_remaining: 31 }), asIs,
    );

    expect(notice?.tone).toBe("warning");
    expect(notice?.title).toBe("Fiscal calendar ends in 31 days");
    expect(notice?.body).toContain("2026-12-31");
    expect(notice?.body).toContain("Create the next fiscal year");
  });

  it("reads naturally on the last postable day", () => {
    const notice = fiscalRunwayNotice(
      runway({ status: "EXPIRING", days_remaining: 0 }), asIs,
    );

    expect(notice?.title).toBe("Fiscal calendar ends today");
  });

  it("escalates once the calendar has lapsed, and says how long ago", () => {
    const notice = fiscalRunwayNotice(
      runway({ status: "EXPIRED", days_remaining: -1 }), asIs,
    );

    expect(notice?.tone).toBe("critical");
    expect(notice?.title).toContain("nothing can post");
    expect(notice?.body).toContain("1 day ago");
  });

  it("tells an entity with no calendar to create one, not to extend one", () => {
    // There is no end date to quote and nothing to extend, so the sentence has to
    // differ from the lapsed one - the fix is to create the fiscal year.
    const notice = fiscalRunwayNotice(
      runway({ status: "EXPIRED", calendar_end: null, days_remaining: null }), asIs,
    );

    expect(notice?.tone).toBe("critical");
    expect(notice?.title).toBe("No fiscal calendar - nothing can post");
    expect(notice?.body).toContain("Create its fiscal year");
    expect(notice?.body).not.toContain("null");
  });
});

describe("dayCount", () => {
  it("singularises one day in both directions", () => {
    expect(dayCount(1)).toBe("1 day");
    expect(dayCount(2)).toBe("2 days");
    expect(dayCount(0)).toBe("0 days");
  });
});

describe("a gap between two fiscal years", () => {
  // Bright Star: FY2026 ends 31 Dec 2026, FY2027 starts 1 Feb 2027.
  const january = { start: "2027-01-01", end: "2027-01-31" };

  it("names the uncovered stretch while the calendar is otherwise healthy", () => {
    const notice = fiscalRunwayNotice(
      runway({ today: "2026-10-05", days_remaining: 87, first_uncovered_date: "2027-01-01", gaps: [january] }), asIs,
    );

    expect(notice?.tone).toBe("warning");
    expect(notice?.title).toBe("The fiscal calendar has a gap");
    expect(notice?.body).toContain("2027-01-01 to 2027-01-31");
    expect(notice?.body).toContain("nothing dated in that stretch can post");
  });

  it("names the gap, not the calendar's end, when the break is near", () => {
    const notice = fiscalRunwayNotice(
      runway({ status: "EXPIRING", today: "2026-12-01", days_remaining: 30, calendar_end: "2027-12-31", first_uncovered_date: "2027-01-01", gaps: [january] }), asIs,
    );

    expect(notice?.title).toBe("The fiscal calendar has a gap");
    expect(notice?.body).not.toContain("2027-12-31");
  });

  it("says today is inside the gap once it is", () => {
    const notice = fiscalRunwayNotice(
      runway({ status: "EXPIRED", today: "2027-01-10", days_remaining: -10, calendar_end: "2027-12-31", first_uncovered_date: "2027-01-10", gaps: [january] }), asIs,
    );

    expect(notice?.tone).toBe("critical");
    expect(notice?.title).toBe("Today falls in a gap in the fiscal calendar - nothing can post");
    expect(notice?.body).toContain("2027-01-01 to 2027-01-31");
  });

  it("ignores a gap already behind today", () => {
    const notice = fiscalRunwayNotice(
      runway({ today: "2028-03-01", gaps: [january] }), asIs,
    );

    expect(notice).toBeNull();
  });
});

describe("a gap read from a dashboard that lists no gaps", () => {
  it("names where the gap starts when the first uncovered day comes before the calendar's end", () => {
    const notice = fiscalRunwayNotice(
      runway({ days_remaining: 87, calendar_end: "2027-12-31", first_uncovered_date: "2027-01-01" }), asIs,
    );

    expect(notice?.title).toBe("The fiscal calendar has a gap");
    expect(notice?.body).toContain("the days from 2027-01-01 until the next fiscal year starts");
  });

  it("says nothing when the first uncovered day is the day after the calendar ends", () => {
    expect(fiscalRunwayNotice(runway({ first_uncovered_date: "2027-01-01" }), asIs)).toBeNull();
  });
});
