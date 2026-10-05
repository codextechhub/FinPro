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

/**
 * The first day a closed year may be archived: `minAgeYears` whole years after
 * it ends (a 29 February end moves to the 28th), as the server counts it.
 */
export function earliestArchiveDate(endDate: string, minAgeYears: number): string {
  const [year, month, day] = endDate.split("-").map(Number);
  const target = year + minAgeYears;
  const lastDay = new Date(Date.UTC(target, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target}-${pad(month)}-${pad(Math.min(day, lastDay))}`;
}

export type ArchiveReadiness =
  | { kind: "ready" }
  | { kind: "not-closed" }
  | { kind: "too-recent"; from: string }
  | { kind: "archived" };

/**
 * Whether a fiscal year may be archived today. Only a CLOSED or LOCKED year
 * may be, and only once `minAgeYears` have passed since it ended, so last
 * year's comparatives stay at hand. `minAgeYears` is null when the reader may
 * not read the record-keeping settings; the age is then left to the server.
 */
export function archiveReadiness(
  year: { status: string; end_date: string; is_archived?: boolean },
  minAgeYears: number | null,
  today: string,
): ArchiveReadiness {
  if (year.is_archived) return { kind: "archived" };
  if (year.status !== "CLOSED" && year.status !== "LOCKED") return { kind: "not-closed" };
  if (minAgeYears == null) return { kind: "ready" };
  const from = earliestArchiveDate(year.end_date, minAgeYears);
  return today >= from ? { kind: "ready" } : { kind: "too-recent", from };
}
