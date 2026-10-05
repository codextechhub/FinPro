/**
 * Amaka's statement heading reads its range in the school's date format, the
 * same way its rows do, never as a raw "2026-10-05".
 */
import { describe, expect, it } from "vitest";
import { statementPeriodLabel } from "./customer-detail-drawer";

const day = (iso: string) => ({ "2026-09-01": "1 Sep 2026", "2026-10-05": "5 Oct 2026" } as Record<string, string>)[iso] ?? iso;

describe("statementPeriodLabel", () => {
  it("reads an open-ended statement as up to its last day", () => {
    expect(statementPeriodLabel("", "2026-10-05", day)).toBe("Up to 5 Oct 2026");
  });

  it("reads a dated range from its first day to its last", () => {
    expect(statementPeriodLabel("2026-09-01", "2026-10-05", day)).toBe("1 Sep 2026 - 5 Oct 2026");
  });
});
