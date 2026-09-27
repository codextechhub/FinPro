import { describe, expect, it } from "vitest";

import { importFailureNote } from "./batch-status";

const batch = (errors: number, warnings: number, summarised = true) => ({
  error_count: errors,
  warning_count: warnings,
  validation_summary: summarised ? { error_count: errors, warning_count: warnings } : null,
});

describe("importFailureNote", () => {
  it("says validation was clean only when it was", () => {
    expect(importFailureNote(batch(0, 0))).toMatch(/^Validation passed with no issues/);
  });

  it("names the errors validation found", () => {
    expect(importFailureNote(batch(3, 0))).toMatch(/^Validation found 3 errors\./);
    expect(importFailureNote(batch(1, 2))).toMatch(/^Validation found 1 error and 2 warnings\./);
  });

  it("names the warnings when there were no errors", () => {
    expect(importFailureNote(batch(0, 1))).toMatch(/^Validation passed with 1 warning\./);
  });

  it("claims nothing about validation that has no summary", () => {
    expect(importFailureNote(batch(0, 0, false))).not.toMatch(/Validation/);
  });

  it("always points at the Jobs tab", () => {
    for (const b of [batch(0, 0), batch(2, 0), batch(0, 0, false)]) {
      expect(importFailureNote(b)).toContain("Jobs tab");
    }
  });
});
