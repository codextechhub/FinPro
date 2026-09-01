import type { FiscalPeriod } from "@/redux/services/finance/setup-types";

export interface PeriodSummary {
  total: number;
  open: number;
  softClosed: number;
  closed: number;
  locked: number;
  progressed: number;
}

export type YearCloseState = "EMPTY" | "OPEN_PERIODS" | "FINAL_LOCKED" | "READY" | "SEALED";

export function summarizePeriods(periods: FiscalPeriod[]): PeriodSummary {
  const summary: PeriodSummary = {
    total: periods.length,
    open: 0,
    softClosed: 0,
    closed: 0,
    locked: 0,
    progressed: 0,
  };
  for (const period of periods) {
    if (period.status === "OPEN") summary.open += 1;
    else if (period.status === "SOFT_CLOSED") summary.softClosed += 1;
    else if (period.status === "CLOSED") summary.closed += 1;
    else if (period.status === "LOCKED") summary.locked += 1;
  }
  summary.progressed = summary.total - summary.open;
  return summary;
}

export function periodActionLabel(status: FiscalPeriod["status"]): string {
  if (status === "OPEN") return "Review close";
  if (status === "SOFT_CLOSED") return "Continue close";
  if (status === "CLOSED") return "Re-open or lock";
  return "View locked period";
}

export function yearCloseState(
  fiscalYearStatus: string,
  periods: FiscalPeriod[],
): YearCloseState {
  if (fiscalYearStatus !== "OPEN") return "SEALED";
  if (periods.length === 0) return "EMPTY";
  if (periods.some((period) => period.status === "OPEN")) return "OPEN_PERIODS";
  const finalPeriod = periods.reduce((latest, period) => (
    period.end_date > latest.end_date ? period : latest
  ));
  if (finalPeriod.status === "LOCKED") return "FINAL_LOCKED";
  return "READY";
}
