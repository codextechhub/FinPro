import { describe, expect, it } from "vitest";

import { isForbidden, shortDate } from "./helpers";

describe("shortDate", () => {
  it("formats a plain backend date", () => {
    expect(shortDate("2026-08-14")).toBe("14 Aug 2026");
  });

  it("formats a full ISO timestamp", () => {
    // created_at / updated_at arrive with a time and a Z. Appending T00:00:00 to
    // these produced an Invalid Date, and the RangeError took the page down.
    expect(shortDate("2026-08-14T09:59:08.835589Z")).toBe("14 Aug 2026");
  });

  it("keeps a bare date on its own day regardless of timezone", () => {
    // Parsed as local midnight, not UTC midnight, so a reader west of UTC does
    // not see the previous day on every document date.
    expect(shortDate("2026-01-01")).toBe("01 Jan 2026");
  });

  it("renders a dash rather than throwing on unusable input", () => {
    expect(shortDate("")).toBe("-");
    expect(shortDate(null)).toBe("-");
    expect(shortDate(undefined)).toBe("-");
    expect(shortDate("not a date")).toBe("-");
  });
});

describe("isForbidden", () => {
  it("recognises only a 403", () => {
    expect(isForbidden({ status: 403 })).toBe(true);
    expect(isForbidden({ status: 500 })).toBe(false);
    expect(isForbidden(null)).toBe(false);
    expect(isForbidden("403")).toBe(false);
  });
});
