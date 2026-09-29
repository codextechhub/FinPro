import { describe, expect, it } from "vitest";

import { DEFAULT_DISPLAY_PREFS } from "./dates";
import { formatRelativeDate } from "./relative-date";

/** 00:30 on 29 Sep in Lagos. */
const NOW = new Date("2026-09-28T23:30:00Z");

describe("formatRelativeDate", () => {
  it("judges today and yesterday by the school's calendar", () => {
    expect(formatRelativeDate("2026-09-28T23:10:00Z", DEFAULT_DISPLAY_PREFS, NOW)).toBe("Today");
    expect(formatRelativeDate("2026-09-28T22:50:00Z", DEFAULT_DISPLAY_PREFS, NOW)).toBe("Yesterday");
    expect(formatRelativeDate("2026-09-28", DEFAULT_DISPLAY_PREFS, NOW)).toBe("Yesterday");
  });

  it("writes anything older in the school's format", () => {
    expect(formatRelativeDate("2026-09-03", DEFAULT_DISPLAY_PREFS, NOW)).toBe("3 Sep 2026");
    expect(formatRelativeDate("2026-09-03", { ...DEFAULT_DISPLAY_PREFS, dateFormat: "DD_MM_YYYY" }, NOW)).toBe("03/09/2026");
  });

  it("says '-' for nothing", () => {
    expect(formatRelativeDate(null)).toBe("-");
    expect(formatRelativeDate("nonsense")).toBe("-");
  });
});
