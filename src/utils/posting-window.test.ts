import { describe, expect, it } from "vitest";
import type { PeriodBrief } from "@/redux/services/finance/setup-types";
import {
  blockedReason,
  bookingDateFor,
  clipRangesFrom,
  isWithinRanges,
  nearestOpenDate,
  openWindowLabel,
  toOpenRanges,
  todayISO,
} from "./posting-window";

const period = (
  name: string,
  start: string,
  end: string,
  status: PeriodBrief["status"] = "OPEN",
): PeriodBrief => ({
  id: Number(start.replace(/-/g, "")),
  name,
  period_no: Number(start.slice(5, 7)),
  status,
  start_date: start,
  end_date: end,
});

const JAN = period("Jan 2026", "2026-01-01", "2026-01-31");
const MAY = period("May 2026", "2026-05-01", "2026-05-31");
const GAPPED = toOpenRanges([JAN, MAY]);

describe("isWithinRanges", () => {
  it("accepts the first and last day of a range", () => {
    expect(isWithinRanges("2026-01-01", GAPPED)).toBe(true);
    expect(isWithinRanges("2026-01-31", GAPPED)).toBe(true);
  });

  it("rejects a date in the closed gap between two open periods", () => {
    // The case min/max bounds cannot express: Jan and May are open, Feb–Apr is not.
    expect(isWithinRanges("2026-03-15", GAPPED)).toBe(false);
  });

  it("treats an empty range list as unconstrained", () => {
    // No window means we could not read one (403, offline) - the field must stay
    // usable and let the backend guard have the final say, never lock the user out.
    expect(isWithinRanges("1999-01-01", [])).toBe(true);
  });

  it("rejects an empty date", () => {
    expect(isWithinRanges("", GAPPED)).toBe(false);
  });
});

describe("nearestOpenDate", () => {
  it("returns the date unchanged when it is already open", () => {
    expect(nearestOpenDate("2026-01-15", GAPPED)).toBe("2026-01-15");
  });

  it("snaps back when the nearer open day is in the past", () => {
    expect(nearestOpenDate("2026-02-03", GAPPED)).toBe("2026-01-31");
  });

  it("snaps forward when the nearer open day is upcoming", () => {
    expect(nearestOpenDate("2026-04-28", GAPPED)).toBe("2026-05-01");
  });

  it("prefers the past on a tie", () => {
    // A real tie needs the same gap on each side: Feb 2 is two days after Jan's
    // last open day and two days before the next period opens.
    const ranges = toOpenRanges([
      period("A", "2026-01-01", "2026-01-31"),
      period("B", "2026-02-04", "2026-02-28"),
    ]);
    expect(nearestOpenDate("2026-02-02", ranges)).toBe("2026-01-31");
  });

  it("goes forward when every open period is in the future", () => {
    expect(nearestOpenDate("2025-12-01", GAPPED)).toBe("2026-01-01");
  });

  it("goes back when every open period is in the past", () => {
    expect(nearestOpenDate("2027-06-01", GAPPED)).toBe("2026-05-31");
  });

  it("returns null when nothing is open", () => {
    expect(nearestOpenDate("2026-03-15", [])).toBeNull();
  });
});

describe("bookingDateFor", () => {
  // Mirrors the resolve_adjustment_date cases in vs_finance/banking.py.
  it("keeps the date when its period is open", () => {
    expect(bookingDateFor("2026-01-15", GAPPED)).toBe("2026-01-15");
  });

  it("moves forward to the earliest open day after a closed date", () => {
    // A March charge belongs in May (the next open month), not in whatever month
    // happens to be current - this is what distinguishes it from nearestOpenDate.
    expect(bookingDateFor("2026-03-15", GAPPED)).toBe("2026-05-01");
  });

  it("prefers forward even when a closer open day sits behind", () => {
    // Feb 2 is 2 days after Jan's close and 26 before May opens; still forward.
    expect(bookingDateFor("2026-02-02", GAPPED)).toBe("2026-05-01");
  });

  it("pre-dates only when every later period is shut", () => {
    expect(bookingDateFor("2026-07-01", GAPPED)).toBe("2026-05-31");
  });

  it("returns null when nothing is open", () => {
    expect(bookingDateFor("2026-03-15", [])).toBeNull();
  });
});

describe("blockedReason", () => {
  const blocked = [
    period("Feb 2026", "2026-02-01", "2026-02-28", "CLOSED"),
    period("Mar 2026", "2026-03-01", "2026-03-31", "SOFT_CLOSED"),
    period("Apr 2026", "2026-04-01", "2026-04-30", "LOCKED"),
  ];

  it("says nothing about a selectable date", () => {
    expect(blockedReason("2026-01-15", GAPPED, blocked)).toBeNull();
  });

  it("names the period and its status", () => {
    expect(blockedReason("2026-02-14", GAPPED, blocked)).toBe("Feb 2026 is closed.");
    expect(blockedReason("2026-03-14", GAPPED, blocked)).toBe("Mar 2026 is soft-closed.");
    expect(blockedReason("2026-04-14", GAPPED, blocked)).toBe("Apr 2026 is locked.");
  });

  it("distinguishes a date no period covers at all", () => {
    // Not the same problem as a closed month - nobody has opened that year yet.
    expect(blockedReason("2029-01-01", GAPPED, blocked)).toBe(
      "No fiscal period covers this date.",
    );
  });
});

describe("openWindowLabel", () => {
  const months = [
    period("Jan 2026", "2026-01-01", "2026-01-31"),
    period("Feb 2026", "2026-02-01", "2026-02-28"),
    period("Mar 2026", "2026-03-01", "2026-03-31"),
  ];

  it("names a single open period", () => {
    expect(openWindowLabel([JAN])).toBe("Jan 2026");
  });

  it("collapses adjacent periods into one span", () => {
    expect(openWindowLabel(months)).toBe("Jan 2026 – Mar 2026");
  });

  it("sorts before collapsing, so input order does not matter", () => {
    expect(openWindowLabel([months[2], months[0], months[1]])).toBe("Jan 2026 – Mar 2026");
  });

  it("shows a gap rather than claiming a closed month is open", () => {
    // Jan and May with Feb–Apr closed must NOT read "Jan 2026 – May 2026": that
    // would contradict the greyed-out days the same window produces.
    expect(openWindowLabel([JAN, MAY])).toBe("Jan 2026, May 2026");
  });

  it("handles several runs", () => {
    const withGap = [
      ...months,
      period("Jun 2026", "2026-06-01", "2026-06-30"),
      period("Jul 2026", "2026-07-01", "2026-07-31"),
    ];
    expect(openWindowLabel(withGap)).toBe("Jan 2026 – Mar 2026, Jun 2026 – Jul 2026");
  });

  it("returns null when nothing is open", () => {
    expect(openWindowLabel([])).toBeNull();
  });
});

describe("todayISO", () => {
  it("returns the browser-local day, not the UTC one", () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    expect(todayISO()).toBe(expected);
  });

  it("matches YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("clipRangesFrom", () => {
  const ranges = [
    { from: "2026-01-01", to: "2026-01-31" },
    { from: "2026-02-01", to: "2026-02-28" },
    { from: "2026-03-01", to: "2026-03-31" },
  ];

  it("leaves the ranges untouched when there is no floor", () => {
    expect(clipRangesFrom(ranges, null)).toEqual(ranges);
    expect(clipRangesFrom(ranges, undefined)).toEqual(ranges);
    expect(clipRangesFrom(ranges, "")).toEqual(ranges);
  });

  it("drops periods that end before the floor", () => {
    // A write-off for a 10 Feb invoice cannot be booked in January at all.
    expect(clipRangesFrom(ranges, "2026-02-10")).toEqual([
      { from: "2026-02-10", to: "2026-02-28" },
      { from: "2026-03-01", to: "2026-03-31" },
    ]);
  });

  it("starts a straddling period at the floor, not at its own start", () => {
    const [first] = clipRangesFrom(ranges, "2026-01-15");
    expect(first).toEqual({ from: "2026-01-15", to: "2026-01-31" });
  });

  it("keeps a period whose last day is exactly the floor", () => {
    // The invoice date itself is always a legal settlement date.
    expect(clipRangesFrom(ranges, "2026-01-31")).toEqual([
      { from: "2026-01-31", to: "2026-01-31" },
      { from: "2026-02-01", to: "2026-02-28" },
      { from: "2026-03-01", to: "2026-03-31" },
    ]);
  });

  it("returns nothing when the floor is past every open period", () => {
    // Meaningful, not an error: the two constraints do not overlap, so there is
    // no date this document could legitimately carry.
    expect(clipRangesFrom(ranges, "2026-04-01")).toEqual([]);
  });

  it("returns nothing to clip when the window itself is unconstrained", () => {
    expect(clipRangesFrom([], "2026-02-10")).toEqual([]);
  });
});
