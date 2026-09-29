/**
 * The quick date filters a list offers ("This month", "Last 7 days"), as
 * `YYYY-MM-DD` bounds.
 *
 * Each takes today as a calendar date the caller has already read in the
 * school's zone (`useDates().today()`), and works on the calendar from there.
 * None builds a local-midnight `Date` and turns it back with `toISOString()`:
 * in Lagos that lands on the day before, so "this month" would run from the
 * last day of the previous month to the day before this month's end.
 */
import { addDays, monthBounds } from "./dates";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * The bounds for a named preset: `this-month`, `last-month` or `ytd` (the
 * first of January to today). Any other preset is unbounded.
 */
export function presetRange(preset: string, today: string): DateRange {
  if (preset === "this-month") return monthBounds(today);
  if (preset === "last-month") return monthBounds(today, -1);
  if (preset === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: "", to: "" };
}

/**
 * The first day of a "since" filter: `today` for "today", else the day a
 * number of days back ("7", "30"). Undefined for no filter.
 */
export function sinceDate(preset: string, today: string): string | undefined {
  if (!preset) return undefined;
  if (preset === "today") return today;
  const days = Number(preset);
  return Number.isFinite(days) ? addDays(today, -days) : undefined;
}
