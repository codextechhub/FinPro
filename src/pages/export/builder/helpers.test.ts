import { describe, expect, it } from "vitest";

import { nowIn } from "../../../utils/dates";
import type { DatasetFilter } from "@/redux/services/dashboard/exports-types";
import { filterIsSet, moneyBoundError, renderFileNamePreview } from "./helpers";

describe("renderFileNamePreview", () => {
  it("dates the file by the school's clock on both tokens, just past Lagos midnight", () => {
    // 23:30 UTC on 28 Sep is 00:30 on the 29th in Lagos.
    const now = nowIn("Africa/Lagos", new Date("2026-09-28T23:30:00Z"));
    expect(renderFileNamePreview("fees-{date}", "xlsx", now)).toBe("fees-2026-09-29.xlsx");
    expect(renderFileNamePreview("fees-{datetime}", "csv", now)).toBe("fees-2026-09-29-0030.csv");
  });

  it("stands placeholders in for the entity and the run", () => {
    const now = nowIn("Africa/Lagos", new Date("2026-09-29T07:05:00Z"));
    expect(renderFileNamePreview("{entity}-{run}-{datetime}", "csv", now)).toBe("entity-1-2026-09-29-0805.csv");
  });
});

describe("moneyBoundError", () => {
  it("accepts naira with up to two decimal places", () => {
    for (const ok of [50000, "50000", "50000.5", "50000.50", "50000.500", " 1250.75 ", undefined, ""]) {
      expect(moneyBoundError(ok)).toBeNull();
    }
  });

  it("refuses a third decimal place, in plain words", () => {
    expect(moneyBoundError("50000.505")).toBe("Use at most two digits after the decimal point.");
  });

  it("refuses anything that is not an amount, without mentioning kobo", () => {
    for (const bad of ["abc", "50,000", "₦50000", "1e3"]) {
      const message = moneyBoundError(bad);
      expect(message).toContain("naira");
      expect(message).not.toMatch(/kobo/i);
    }
  });
});

describe("filterIsSet on a number range", () => {
  const total = { id: "total", type: "number_range", money: true } as DatasetFilter;

  it("counts a bound typed as a string or saved as a number", () => {
    expect(filterIsSet(total, { id: "total", min: "50000" })).toBe(true);
    expect(filterIsSet(total, { id: "total", max: 0 })).toBe(true);
  });

  it("does not count an empty box", () => {
    expect(filterIsSet(total, { id: "total", min: "", max: undefined })).toBe(false);
  });
});
