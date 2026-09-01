import { describe, expect, it } from "vitest";
import type { FiscalPeriod } from "@/redux/services/finance/setup-types";
import { periodActionLabel, summarizePeriods, yearCloseState } from "./periods-model";

function period(period_no: number, status: FiscalPeriod["status"]): FiscalPeriod {
  return {
    id: period_no,
    period_no,
    name: `P${period_no}`,
    fiscal_year: 2026,
    start_date: `2026-${String(period_no).padStart(2, "0")}-01`,
    end_date: `2026-${String(period_no).padStart(2, "0")}-28`,
    status,
    closed_at: null,
  };
}

describe("fiscal period workbench model", () => {
  it("summarises every lifecycle state without dropping periods", () => {
    const summary = summarizePeriods([
      period(1, "OPEN"),
      period(2, "SOFT_CLOSED"),
      period(3, "CLOSED"),
      period(4, "LOCKED"),
    ]);

    expect(summary).toEqual({
      total: 4,
      open: 1,
      softClosed: 1,
      closed: 1,
      locked: 1,
      progressed: 3,
    });
  });

  it("makes the available action explicit for each state", () => {
    expect(periodActionLabel("OPEN")).toBe("Review close");
    expect(periodActionLabel("SOFT_CLOSED")).toBe("Continue close");
    expect(periodActionLabel("CLOSED")).toBe("Re-open or lock");
    expect(periodActionLabel("LOCKED")).toBe("View locked period");
  });

  it("only marks an open fiscal year ready after every period stops ordinary posting", () => {
    expect(yearCloseState("OPEN", [period(1, "OPEN")])).toBe("OPEN_PERIODS");
    expect(yearCloseState("OPEN", [period(1, "SOFT_CLOSED")])).toBe("READY");
    expect(yearCloseState("OPEN", [period(1, "CLOSED")])).toBe("READY");
    expect(yearCloseState("OPEN", [period(1, "LOCKED")])).toBe("FINAL_LOCKED");
    expect(yearCloseState("CLOSED", [period(1, "LOCKED")])).toBe("SEALED");
  });

  it("finds a locked final period even when the API rows are unsorted", () => {
    const unsorted = [
      period(4, "LOCKED"),
      period(1, "CLOSED"),
      period(3, "CLOSED"),
      period(2, "CLOSED"),
    ];

    expect(yearCloseState("OPEN", unsorted)).toBe("FINAL_LOCKED");
  });
});
