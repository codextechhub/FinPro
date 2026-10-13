/**
 * What the signed-in user may read of the fiscal calendar: a year's close and
 * archive state, a month's close state.
 *
 * An administrator can close each of these to a role with a Field Access switch
 * (`finance.fiscalyear` and `finance.period`). The backend then answers a list
 * request that filters on the closed value with 403 `field_read_denied`, rather
 * than quietly returning rows chosen by a state the caller may not see. A screen
 * therefore leaves such a filter out of the request, and offers no control and
 * no label that names the state. The answers come from the `/me` map, because a
 * request is made before any row exists to read them from.
 */

import { useFieldAccess } from "./field-access";

/** The calendar facts one screen needs before it asks for years or months. */
export interface CalendarFieldAccess {
  /** A fiscal year's open, closed or locked state and each branch's own. */
  yearStateReadable: boolean;
  /** Whether a year has been put away, and when. */
  archiveReadable: boolean;
  /** A month's open, soft-closed, closed or locked state and each branch's own. */
  periodStateReadable: boolean;
}

export function useCalendarFieldAccess(): CalendarFieldAccess {
  const year = useFieldAccess("finance.fiscalyear");
  const period = useFieldAccess("finance.period");
  return {
    yearStateReadable: !year.isHidden("status"),
    archiveReadable: !year.isHidden("is_archived"),
    periodStateReadable: !period.isHidden("status"),
  };
}

/** The `status` filter for a read of fiscal years, or nothing when the state is closed to the user. */
export function yearStatusArg(readable: boolean, status: string): { status?: string } {
  return readable ? { status } : {};
}
