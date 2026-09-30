/**
 * The signed-in school's date and time preferences, for screens to format with.
 *
 * Read from `display` on the session's tenant (`state.auth.tenant.display`),
 * which the login and `/me` payloads carry for a school. The console's tenant
 * has no such field, and neither host types it, so it is read as unknown and
 * checked field by field; whatever is missing takes the default (Africa/Lagos,
 * "29 Sep 2026", "8:00 am"). A CodeX operator impersonating a school reads that
 * school's tenant and so sees its dates the way its own staff do.
 *
 * The store is reached through react-redux's context rather than through the
 * host's `useAppSelector`, so that a component rendered with no store at all,
 * as in a unit test, formats with the defaults instead of throwing.
 */
import { useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { ReactReduxContext } from "react-redux";

import {
  formatDateTime,
  formatDay,
  formatDayMonth,
  formatMonthName,
  formatMonthSpan,
  formatMonthYear,
  formatTime,
  resolveDisplayPrefs,
  todayIn,
  zoneForBranch,
  type DisplayPrefs,
  type TenantDisplay,
  type TimeOptions,
} from "../utils/dates";

type BranchId = number | string | null | undefined;
type Value = string | number | Date | null | undefined;

const noSubscription = () => () => {};

/** The tenant's raw `display` object, or undefined when there is none. */
function useTenantDisplay(): TenantDisplay | undefined {
  const store = useContext(ReactReduxContext)?.store;
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(onChange) : noSubscription()),
    [store],
  );
  const read = () => {
    const state = store?.getState() as { auth?: { tenant?: { display?: unknown } | null } } | undefined;
    const display = state?.auth?.tenant?.display;
    return display && typeof display === "object" ? (display as TenantDisplay) : undefined;
  };
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The preferences for one branch's records, or for the whole school when no
 * branch is given.
 */
export function useDisplayPrefs(branchId?: BranchId): DisplayPrefs {
  const display = useTenantDisplay();
  return useMemo(() => resolveDisplayPrefs(display, branchId), [display, branchId]);
}

/**
 * Formatters bound to the school's preferences.
 *
 * A calendar date is written as it is and needs no zone. An instant is shown
 * in a zone, so `day`, `dateTime` and `time` take the branch the record
 * belongs to and read the instant in that branch's zone when the school has
 * set one; without a branch they use the school's.
 */
export interface DateFormatter {
  /** The school-wide preferences. */
  prefs: DisplayPrefs;
  day: (value: Value, branchId?: BranchId) => string;
  dayMonth: (value: Value) => string;
  monthYear: (value: Value) => string;
  monthName: (value: Value) => string;
  monthSpan: (start: Value, end: Value) => string;
  dateTime: (value: Value, branchId?: BranchId, options?: TimeOptions) => string;
  time: (value: Value, branchId?: BranchId, options?: TimeOptions) => string;
  /** Today in the school's zone, or in a branch's own, `YYYY-MM-DD`. */
  today: (branchId?: BranchId) => string;
  /** The zone a branch's times are read in: its own, else the school's. */
  zoneFor: (branchId?: BranchId) => string;
}

/** Formatters for the signed-in school; see {@link DateFormatter}. */
export function useDates(): DateFormatter {
  const display = useTenantDisplay();
  return useMemo(() => {
    const prefs = resolveDisplayPrefs(display);
    const forBranch = (branchId: BranchId): DisplayPrefs =>
      branchId === null || branchId === undefined || branchId === ""
        ? prefs
        : { ...prefs, timeZone: zoneForBranch(display, branchId) };
    return {
      prefs,
      day: (value, branchId) => formatDay(value, forBranch(branchId)),
      dayMonth: (value) => formatDayMonth(value, prefs),
      monthYear: (value) => formatMonthYear(value, prefs),
      monthName: (value) => formatMonthName(value, prefs),
      monthSpan: (start, end) => formatMonthSpan(start, end, prefs),
      dateTime: (value, branchId, options) => formatDateTime(value, forBranch(branchId), options),
      time: (value, branchId, options) => formatTime(value, forBranch(branchId), options),
      today: (branchId) => todayIn(forBranch(branchId).timeZone),
      zoneFor: (branchId) => forBranch(branchId).timeZone,
    };
  }, [display]);
}
