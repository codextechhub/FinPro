/**
 * "Today", "Yesterday", or the day in the school's own format.
 *
 * Shared by the workflow screens here and by the school app's own screens
 * (notifications, support), which import it through their `@/utils/relative-date`
 * alias. The preferences are optional so a caller with none to hand still gets
 * the default reading, Lagos time and "29 Sep 2026"; a screen inside this
 * package passes `useDates().prefs`. "Today" is the school's today, not the
 * reader's: at 00:30 in Lagos a payment made at 23:50 reads "Yesterday".
 */
import {
  DEFAULT_DISPLAY_PREFS,
  addDays,
  calendarDayOf,
  formatDay,
  todayIn,
  type DisplayPrefs,
} from "./dates";

export const formatRelativeDate = (
  dateStr: string | null | undefined,
  prefs: DisplayPrefs = DEFAULT_DISPLAY_PREFS,
  now: Date = new Date(),
): string => {
  const day = calendarDayOf(dateStr, prefs.timeZone);
  if (!day) return "-";
  const today = todayIn(prefs.timeZone, now);
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDay(day, prefs);
};
