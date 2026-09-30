import { zonedInstant } from "../../../utils/dates";

/** A deadline as a form holds it: a day and a time, each empty until given. */
export interface DeadlineValue {
  /** `YYYY-MM-DD`, or "" before a day is picked. */
  date: string;
  /** `HH:MM` on a 24-hour clock, or "". */
  time: string;
}

export const NO_DEADLINE: DeadlineValue = { date: "", time: "" };

/**
 * The moment a deadline's day and time name in `timeZone`, or null until both
 * are given. "30 Sep 2026, 17:00" at a Lagos branch is 16:00 UTC whatever the
 * typist's device is set to.
 */
export function deadlineInstant(value: DeadlineValue, timeZone: string): string | null {
  return value.date && value.time ? zonedInstant(value.date, value.time, timeZone) : null;
}
