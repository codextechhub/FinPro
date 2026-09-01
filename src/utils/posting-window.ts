// Pure helpers for the posting window - which dates a document may carry.
//
// The backend's `ensure_period_open` guard rejects a posting whose date falls
// outside an OPEN fiscal period (HTTP 409). GET /finance/posting-window/ exposes
// the same rule as data so a picker can stop offering those dates in the first
// place, instead of letting someone fill a whole drawer and fail on submit.
//
// Dates are ISO `YYYY-MM-DD` strings throughout. That format sorts
// lexicographically, so ranges compare with plain string operators - no Date
// parsing, no timezone drift from `toISOString()` on a local-midnight Date.

import type { PeriodBrief } from "@/redux/services/finance/setup-types";

/** An inclusive span of selectable days, taken from one OPEN fiscal period. */
export interface OpenRange {
  from: string;
  to: string;
}

/**
 * Today in the browser's own timezone as `YYYY-MM-DD`.
 *
 * Call this - never hoist it to a module constant. The codebase used to do
 * `const todayISO = new Date().toISOString().slice(0, 10)` at module scope, which
 * freezes at page load (a tab left open overnight defaults to yesterday) and, being
 * UTC, is already the wrong day for anyone west of Greenwich after 00:00 UTC.
 */
export function todayISO(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/** The OPEN periods as selectable ranges, oldest first. */
export function toOpenRanges(periods: PeriodBrief[]): OpenRange[] {
  return periods
    .map((p) => ({ from: p.start_date, to: p.end_date }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * The open ranges clipped to start no earlier than `notBefore`.
 *
 * The second, separate date constraint. An open period answers "may we book on
 * this date at all?"; this answers "could this have happened by then?" - a
 * write-off cannot predate its invoice, a refund cannot predate the credit it
 * pays out, a receipt cannot settle a bill not yet raised. Both must hold, so the
 * selectable days are the intersection: ranges ending before the floor drop out
 * entirely, and a range straddling it starts at the floor.
 *
 * An empty result is meaningful, not an error - it means the two constraints do
 * not overlap and there is no date the user could legitimately pick. Callers must
 * say so rather than silently offering an unconstrained calendar.
 *
 * A falsy `notBefore` returns the ranges untouched, so callers can pass an
 * optional floor straight through.
 */
export function clipRangesFrom(
  ranges: OpenRange[],
  notBefore: string | null | undefined,
): OpenRange[] {
  if (!notBefore) return ranges;
  return ranges
    .filter((range) => range.to >= notBefore)
    .map((range) => ({ from: range.from > notBefore ? range.from : notBefore, to: range.to }));
}

/** Is `date` inside any open range? An empty range list means "unconstrained". */
export function isWithinRanges(date: string, ranges: OpenRange[]): boolean {
  if (!date) return false;
  if (ranges.length === 0) return true;
  return ranges.some((r) => date >= r.from && date <= r.to);
}

/**
 * The nearest selectable day to `date`, or null when nothing is open.
 *
 * Mirrors the server's rule so the two never disagree: back to the most recent
 * open day or forward to the earliest upcoming one, whichever is closer, keeping
 * the past on a tie. Backdating into a still-open period is the ordinary case
 * during a month-end close; post-dating is not.
 *
 * The server sends `default_date` already computed, so this is only reached when
 * the client has to re-snap against its own clock (a tab open across midnight, or
 * a browser timezone a day ahead of the server's).
 */
export function nearestOpenDate(date: string, ranges: OpenRange[]): string | null {
  if (ranges.length === 0) return null;
  if (isWithinRanges(date, ranges)) return date;

  const before = ranges.filter((r) => r.to < date).map((r) => r.to);
  const after = ranges.filter((r) => r.from > date).map((r) => r.from);
  const previous = before.length ? before[before.length - 1] : null;
  const upcoming = after.length ? after[0] : null;

  if (previous && upcoming) {
    return daysBetween(previous, date) <= daysBetween(date, upcoming) ? previous : upcoming;
  }
  return previous ?? upcoming;
}

/**
 * Where an already-dated item should book, given the open calendar.
 *
 * `date` itself when it is open; otherwise the earliest open day *after* it, so a
 * charge lands as close to its real date as the calendar allows rather than in
 * whatever month happens to be current. Falls back to the latest open day before
 * it only when every later period is shut - pre-dating beats not booking at all.
 *
 * Mirrors `resolve_adjustment_date` in vs_finance/banking.py; the two are covered
 * by the same cases on both sides, so a change to one should change the other.
 * Distinct from {@link nearestOpenDate}, which snaps by raw distance around today
 * and is what a *new* document's default date wants.
 */
export function bookingDateFor(date: string, ranges: OpenRange[]): string | null {
  if (ranges.length === 0) return null;
  if (isWithinRanges(date, ranges)) return date;

  const after = ranges.filter((r) => r.from > date).map((r) => r.from);
  if (after.length) return after.reduce((a, b) => (a < b ? a : b));

  const before = ranges.filter((r) => r.to < date).map((r) => r.to);
  return before.length ? before.reduce((a, b) => (a > b ? a : b)) : null;
}

/**
 * Why `date` can't be used, as a sentence - or null if it's selectable.
 *
 * A greyed-out calendar day with no explanation reads as a bug. When the date
 * lands in a period we know about we name it and its status; when it falls
 * outside every period, no period covers it at all, which is a different problem
 * (finance hasn't opened that year yet) and deserves different wording.
 */
export function blockedReason(
  date: string,
  ranges: OpenRange[],
  blocked: PeriodBrief[],
): string | null {
  if (!date || isWithinRanges(date, ranges)) return null;

  const period = blocked.find((p) => date >= p.start_date && date <= p.end_date);
  if (period) return `${period.name} is ${statusWord(period.status)}.`;
  return "No fiscal period covers this date.";
}

/** A period status as it should read mid-sentence. */
export function statusWord(status: PeriodBrief["status"]): string {
  switch (status) {
    case "SOFT_CLOSED":
      return "soft-closed";
    case "CLOSED":
      return "closed";
    case "LOCKED":
      return "locked";
    default:
      return status.toLowerCase();
  }
}

/**
 * A short human label for the open window, e.g. "Jan 2026" or
 * "Jan 2026 – Jun 2026, Sep 2026 – Dec 2026".
 *
 * Names the periods rather than the raw dates: an accountant picks a date by
 * knowing which month is open, not by reading a boundary.
 *
 * Collapses only *adjacent* periods into a span. A single first-to-last span
 * would claim everything between is open, which is exactly wrong when a month
 * in the middle has been closed - the label has to show the gap the calendar
 * is already enforcing, or it contradicts the greyed-out days.
 */
export function openWindowLabel(periods: PeriodBrief[]): string | null {
  if (periods.length === 0) return null;

  const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const runs: PeriodBrief[][] = [[sorted[0]]];
  for (const period of sorted.slice(1)) {
    const run = runs[runs.length - 1];
    const previous = run[run.length - 1];
    if (period.start_date === nextDay(previous.end_date)) run.push(period);
    else runs.push([period]);
  }

  return runs
    .map((run) => (run.length === 1 ? run[0].name : `${run[0].name} – ${run[run.length - 1].name}`))
    .join(", ");
}

/** The ISO day after `date`. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (`from` assumed on or before `to`). */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
