import { describe, expect, it } from "vitest";

import { periodLabelFrom } from "./period-labels";

const PERIODS = [
  { name: "2026-08", label: "August 2026" },
  { name: "2026-09", label: "September 2026" },
];

describe("a period name as a person reads it", () => {
  it("shows a journal's period by its label, never its stored name", () => {
    expect(periodLabelFrom(PERIODS, "2026-09")).toBe("September 2026");
  });

  it("shows a name no period answers to as it was sent", () => {
    expect(periodLabelFrom(PERIODS, "2019-03")).toBe("2019-03");
  });

  it("shows a dash for a journal in no period", () => {
    expect(periodLabelFrom(PERIODS, null)).toBe("-");
    expect(periodLabelFrom([], undefined)).toBe("-");
  });
});
