/**
 * Dates and times as a school has chosen to read them.
 *
 * Every function here takes its display preferences explicitly and reads no
 * clock or zone of the browser's own, so the same record reads the same way on
 * a bursar's laptop in Lagos and a proprietor's phone abroad. Screens get the
 * preferences from `useDates` / `useDisplayPrefs` in `lib/display-prefs`.
 *
 * Two kinds of value arrive from the server and they are never confused:
 *
 * - A calendar date, `2026-09-29`. It names a day, not a moment, so it has no
 *   zone and is never passed through `new Date()`: that reads it as midnight
 *   UTC, which is the evening before anywhere west of Greenwich, and a
 *   local-midnight Date turned back with `toISOString()` is a day early
 *   anywhere east of it.
 * - An instant, `2026-09-29T07:00:00Z`. It is shown in a zone: the zone of the
 *   branch it belongs to when that branch has one, else the school's.
 *
 * Formatting works from the parts rather than from a locale string, so the
 * output is exactly the chosen format ("29 Sep 2026", "29/09/2026",
 * "2026-09-29"; "8:00 am" or "08:00") on every engine and in every browser
 * language. The school app's own `lib/dates` writes the same strings, so a
 * date reads the same on a finance screen as on the rest of the app.
 */

/** How a day is written. */
export type DateFormat = "D_MMM_YYYY" | "DD_MM_YYYY" | "YYYY_MM_DD";

/** How a time of day is written: "8:00 am" or "08:00". */
export type ClockStyle = "H12" | "H24";

export interface DisplayPrefs {
  /** An IANA zone, such as `Africa/Lagos`. */
  timeZone: string;
  dateFormat: DateFormat;
  clock: ClockStyle;
}

/**
 * The `display` object on the session's tenant, as the server sends it.
 *
 * Every field is optional and unchecked: a console session has no such object,
 * and a value this package does not recognise falls back rather than failing.
 */
export interface TenantDisplay {
  time_zone?: unknown;
  date_format?: unknown;
  clock?: unknown;
  branch_zones?: unknown;
}

export const DEFAULT_TIME_ZONE = "Africa/Lagos";

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  timeZone: DEFAULT_TIME_ZONE,
  dateFormat: "D_MMM_YYYY",
  clock: "H12",
};

const DATE_FORMATS: readonly DateFormat[] = ["D_MMM_YYYY", "DD_MM_YYYY", "YYYY_MM_DD"];
const CLOCKS: readonly ClockStyle[] = ["H12", "H24"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The wall-clock reading of one instant in one zone. */
export interface ZonedParts {
  /** The calendar day, `YYYY-MM-DD`. */
  date: string;
  hour: number;
  minute: number;
  second: number;
}

type CalendarDay = { year: number; month: number; day: number };
type Instant = string | number | Date;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * One cached formatter per zone, reading an instant back as numeric parts.
 *
 * Building an `Intl.DateTimeFormat` costs far more than using one, and a long
 * table formats hundreds of cells per render. An unknown zone is cached as the
 * default zone's formatter, so a bad value costs one failed construction.
 */
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    };
    try {
      formatter = new Intl.DateTimeFormat("en-GB", { ...options, timeZone });
    } catch {
      formatter = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: DEFAULT_TIME_ZONE });
    }
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Whether the engine knows `zone` as an IANA time zone. */
export function isKnownTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function toDate(value: Instant): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function isoOf({ year, month, day }: CalendarDay): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function parseDateOnly(value: string): CalendarDay | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** The wall-clock reading of `instant` in `timeZone`, or null when it is not a moment. */
export function zonedParts(instant: Instant, timeZone: string): ZonedParts | null {
  const date = toDate(instant);
  if (!date) return null;
  const parts: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * The calendar day a value names, `YYYY-MM-DD`.
 *
 * A calendar date comes back unchanged, whatever the zone. An instant gives
 * the day it fell on in `timeZone`. Anything else gives null.
 */
export function calendarDayOf(
  value: Instant | null | undefined,
  timeZone: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const day = parseDateOnly(value.trim());
    if (day) return isoOf(day);
  }
  return zonedParts(value, timeZone)?.date ?? null;
}

/** Today's date in `timeZone`, `YYYY-MM-DD`. Call it: never keep it in a module constant. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return zonedParts(now, timeZone)!.date;
}

/** The wall clock in `timeZone` right now. */
export function nowIn(timeZone: string, now: Date = new Date()): ZonedParts {
  return zonedParts(now, timeZone)!;
}

/**
 * The instant at which the clock in `timeZone` reads `date` and `time`, as an
 * ISO string in UTC.
 *
 * The reverse of {@link zonedParts}, for a form that asks for a day or a
 * deadline and sends a moment: "30 Sep, 17:00" typed at a Lagos school is
 * 16:00 UTC whatever the typist's laptop is set to. `time` is `HH:MM` or
 * `HH:MM:SS`. Null when either part is not readable.
 */
export function zonedInstant(date: string, time: string, timeZone: string): string | null {
  const day = parseDateOnly(date);
  const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!day || !clock) return null;
  const wall = Date.UTC(day.year, day.month - 1, day.day, Number(clock[1]), Number(clock[2]), Number(clock[3] ?? 0));
  const offsetAt = (utc: number) => {
    const parts = zonedParts(new Date(utc), timeZone)!;
    const read = parseDateOnly(parts.date)!;
    return Date.UTC(read.year, read.month - 1, read.day, parts.hour, parts.minute, parts.second) - utc;
  };
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return new Date(utc).toISOString();
}

/**
 * The instant a `datetime-local` input's value (`YYYY-MM-DDTHH:MM`) names,
 * read in `timeZone`. Null for an empty or unreadable value.
 */
export function zonedInstantFromInput(value: string, timeZone: string): string | null {
  const [date, time] = value.split("T");
  return date && time ? zonedInstant(date, time.slice(0, 8), timeZone) : null;
}

/**
 * `date` moved by whole days, on the calendar.
 *
 * Worked in UTC so no daylight-saving change in any zone can make a day 23 or
 * 25 hours long and land the result on the wrong date.
 */
export function addDays(date: string, days: number): string {
  const day = parseDateOnly(date);
  if (!day) return date;
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return isoOf({ year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() });
}

/**
 * The first and last day of the month `offset` months from the one `date` is in.
 *
 * `monthBounds("2026-09-29")` is September; an offset of -1 is August.
 */
export function monthBounds(date: string, offset = 0): { from: string; to: string } {
  const day = parseDateOnly(date);
  if (!day) return { from: "", to: "" };
  const first = new Date(Date.UTC(day.year, day.month - 1 + offset, 1));
  const last = new Date(Date.UTC(day.year, day.month + offset, 0));
  const iso = (d: Date) => isoOf({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
  return { from: iso(first), to: iso(last) };
}

function writeDay(day: CalendarDay, format: DateFormat): string {
  switch (format) {
    case "DD_MM_YYYY":
      return `${pad(day.day)}/${pad(day.month)}/${pad(day.year, 4)}`;
    case "YYYY_MM_DD":
      return isoOf(day);
    default:
      return `${day.day} ${MONTHS[day.month - 1]} ${day.year}`;
  }
}

function dayOf(value: Instant | null | undefined, timeZone: string): CalendarDay | null {
  const iso = calendarDayOf(value, timeZone);
  return iso ? parseDateOnly(iso) : null;
}

/**
 * A day, in the school's format: "29 Sep 2026", "29/09/2026" or "2026-09-29".
 *
 * Given a calendar date it writes that date and nothing can shift it. Given an
 * instant it writes the day the instant fell on in `prefs.timeZone`. "-" for
 * anything empty or unreadable, never a throw: a cell that cannot read its
 * value must not take the screen around it to the error boundary.
 */
export function formatDay(value: Instant | null | undefined, prefs: DisplayPrefs): string {
  const day = dayOf(value, prefs.timeZone);
  return day ? writeDay(day, prefs.dateFormat) : "-";
}

/**
 * A day without its year, for chart axes and tight rows: "29 Sep", "29/09" or
 * "09-29".
 */
export function formatDayMonth(value: Instant | null | undefined, prefs: DisplayPrefs): string {
  const day = dayOf(value, prefs.timeZone);
  if (!day) return "-";
  switch (prefs.dateFormat) {
    case "DD_MM_YYYY":
      return `${pad(day.day)}/${pad(day.month)}`;
    case "YYYY_MM_DD":
      return `${pad(day.month)}-${pad(day.day)}`;
    default:
      return `${day.day} ${MONTHS[day.month - 1]}`;
  }
}

/**
 * A month label, "Sep 2026", in every date format.
 *
 * A month is read as a name, never matched digit for digit against a form, so
 * it keeps the one wording no reader can take for a different month.
 */
export function formatMonthYear(value: Instant | null | undefined, prefs: DisplayPrefs): string {
  const day = dayOf(value, prefs.timeZone);
  return day ? `${MONTHS[day.month - 1]} ${day.year}` : "-";
}

/** A month's short name alone, "Sep". */
export function formatMonthName(value: Instant | null | undefined, prefs: DisplayPrefs): string {
  const day = dayOf(value, prefs.timeZone);
  return day ? MONTHS[day.month - 1] : "-";
}

/**
 * The months a period covers: "Sep 2026" for one month, "Jan–Mar 2026" within
 * a year, "Nov 2025–Jan 2026" across one.
 */
export function formatMonthSpan(
  start: Instant | null | undefined,
  end: Instant | null | undefined,
  prefs: DisplayPrefs,
): string {
  const first = dayOf(start, prefs.timeZone);
  const last = dayOf(end, prefs.timeZone);
  if (!first || !last) return formatMonthYear(end ?? start, prefs);
  if (first.year === last.year && first.month === last.month) return `${MONTHS[last.month - 1]} ${last.year}`;
  if (first.year === last.year) return `${MONTHS[first.month - 1]}–${MONTHS[last.month - 1]} ${last.year}`;
  return `${MONTHS[first.month - 1]} ${first.year}–${MONTHS[last.month - 1]} ${last.year}`;
}

function writeTime(parts: ZonedParts, clock: ClockStyle, seconds: boolean): string {
  const tail = seconds ? `:${pad(parts.second)}` : "";
  if (clock === "H24") return `${pad(parts.hour)}:${pad(parts.minute)}${tail}`;
  const hour = parts.hour % 12 || 12;
  return `${hour}:${pad(parts.minute)}${tail} ${parts.hour < 12 ? "am" : "pm"}`;
}

export interface TimeOptions {
  /** Show seconds, for an audit trail where the order of events within a minute matters. */
  seconds?: boolean;
}

/** A time of day in `prefs.timeZone`: "8:00 am" or "08:00". "-" when there is no instant. */
export function formatTime(
  instant: Instant | null | undefined,
  prefs: DisplayPrefs,
  options: TimeOptions = {},
): string {
  if (instant === null || instant === undefined || instant === "") return "-";
  if (typeof instant === "string" && DATE_ONLY.test(instant.trim())) return "-";
  const parts = zonedParts(instant, prefs.timeZone);
  return parts ? writeTime(parts, prefs.clock, !!options.seconds) : "-";
}

/**
 * A moment, "29 Sep 2026, 8:00 am", in `prefs.timeZone`.
 *
 * A calendar date has no time to show and is written as its day alone, so a
 * field that turns out to be date-only never gains a made-up midnight.
 */
export function formatDateTime(
  instant: Instant | null | undefined,
  prefs: DisplayPrefs,
  options: TimeOptions = {},
): string {
  if (instant === null || instant === undefined || instant === "") return "-";
  if (typeof instant === "string" && DATE_ONLY.test(instant.trim())) return formatDay(instant, prefs);
  const parts = zonedParts(instant, prefs.timeZone);
  if (!parts) return "-";
  return `${writeDay(parseDateOnly(parts.date)!, prefs.dateFormat)}, ${writeTime(parts, prefs.clock, !!options.seconds)}`;
}

/**
 * The zone a branch's records are shown in: its own when the school has set
 * one, else the school's.
 */
export function zoneForBranch(
  display: TenantDisplay | null | undefined,
  branchId: number | string | null | undefined,
): string {
  const schoolZone = isKnownTimeZone(display?.time_zone) ? display!.time_zone as string : DEFAULT_TIME_ZONE;
  if (branchId === null || branchId === undefined || branchId === "") return schoolZone;
  const zones = display?.branch_zones;
  if (!zones || typeof zones !== "object") return schoolZone;
  const zone = (zones as Record<string, unknown>)[String(branchId)];
  return isKnownTimeZone(zone) ? zone : schoolZone;
}

/**
 * The display preferences in force for a branch, or for the whole school when
 * no branch is given, from the tenant's `display` object.
 *
 * Anything absent or unrecognised takes the default, one field at a time, so
 * a server that sends a zone and nothing else still gets its zone.
 */
export function resolveDisplayPrefs(
  display: TenantDisplay | null | undefined,
  branchId?: number | string | null,
): DisplayPrefs {
  const format = display?.date_format;
  const clock = display?.clock;
  return {
    timeZone: zoneForBranch(display, branchId),
    dateFormat: DATE_FORMATS.includes(format as DateFormat) ? (format as DateFormat) : DEFAULT_DISPLAY_PREFS.dateFormat,
    clock: CLOCKS.includes(clock as ClockStyle) ? (clock as ClockStyle) : DEFAULT_DISPLAY_PREFS.clock,
  };
}
