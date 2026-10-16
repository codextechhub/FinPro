/**
 * Which close actions the workbench offers under All branches, and for which
 * branches.
 *
 * Under All branches the lists report the school's state, and the school's
 * state follows the branches: a month reads closed only once every branch has
 * closed it. So the school's state alone cannot say what may be done. Meridian
 * Crest's October reads Open because Victoria Island has not closed it, while
 * Ikeja and Lekki have. Judged on the school's Open, the month would offer
 * Close (which Ikeja and Lekki would only have refused) and hide Re-open (which
 * both still need).
 *
 * Each action is therefore judged against each branch's own state, as the rows
 * carry it in `branch_states`:
 *
 * - an action is offered while any branch the reader may act for is in a state
 *   it starts from (Re-open while any is closed, Close while any is open);
 * - its confirm dialog offers only those branches, so a branch the server would
 *   refuse is never one click away.
 *
 * A branch the states do not list has not moved on its own and stands where the
 * school does. Where the states cannot be read (the row sent none, or Field
 * Access closed a branch's state) `readableBranchStates` returns null and the
 * caller judges by the school's state, offering every branch the reader reaches.
 * With one branch picked, or at a school with one branch, the lists already
 * report that branch's own state and none of this applies.
 */

import type { BranchCloseState, FiscalPeriod } from "@/redux/services/finance/setup-types";
import type { CalendarBranch, CalendarBranchOption } from "./calendar-branch";
import { yearCloseState } from "./periods-model";

/** A month's lifecycle act, as the close drawer names it. */
export type MonthAction = "soft-close" | "close" | "force" | "reopen" | "lock";

/** The month states each act starts from; the server refuses it from any other. */
export const MONTH_ACTION_FROM: Record<MonthAction, readonly string[]> = {
  "soft-close": ["OPEN"],
  close: ["OPEN", "SOFT_CLOSED"],
  force: ["OPEN", "SOFT_CLOSED"],
  reopen: ["SOFT_CLOSED", "CLOSED"],
  lock: ["CLOSED"],
};

/** A year's state from which none of its months may be re-opened. */
const YEAR_SHUT = ["CLOSED", "LOCKED"];

/**
 * Each branch's own state for a row, where the workbench may judge by it: under
 * All branches at a school with several, with every listed state readable.
 * Null otherwise, and the caller judges by the school's state.
 */
export function readableBranchStates(
  calendar: CalendarBranch,
  states: BranchCloseState[] | undefined,
): BranchCloseState[] | null {
  if (!calendar.mustAsk || !Array.isArray(states) || states.length === 0) return null;
  return states.every((state) => typeof state.status === "string") ? states : null;
}

/** A branch's own state, or the school's where the branch has not moved on its own. */
export function branchStatus(
  states: BranchCloseState[],
  branch: number,
  school: string | undefined,
): string | undefined {
  return states.find((state) => state.branch === branch)?.status ?? school;
}

/** The context a month's acts are judged in under All branches. */
export interface MonthBranchContext {
  /** The month's own row: each branch's state, and the school's. */
  monthStates: BranchCloseState[];
  monthStatus: string | undefined;
  /** The fiscal year's row, when its branch states can be read. */
  yearStates: BranchCloseState[] | null;
  yearStatus: string | undefined;
  /** The month is the last of its year, which locks only once the year has closed. */
  finalPeriod: boolean;
}

/**
 * The branches a month's act may be sent for under All branches.
 *
 * Beyond the month's own state, two rules follow the year, branch by branch:
 * a month re-opens only while its branch's year is open (the year's result
 * already sits in Retained Earnings otherwise), and the final month locks only
 * once its branch's year has closed.
 */
export function monthActionBranches(
  calendar: CalendarBranch,
  action: MonthAction,
  context: MonthBranchContext,
): CalendarBranchOption[] {
  return monthActionCandidates(calendar, action, context).filter((choice) => {
    const year = branchYearStatus(context, choice.id);
    if (action === "reopen") return year === undefined || !YEAR_SHUT.includes(year);
    if (action === "lock" && context.finalPeriod) return year !== "OPEN";
    return true;
  });
}

/**
 * The branches whose month is in a state the act starts from, before the year
 * is considered. The act is offered while this is not empty; when the year then
 * holds every one of them back, it is offered disabled with the reason beside it.
 */
export function monthActionCandidates(
  calendar: CalendarBranch,
  action: MonthAction,
  context: MonthBranchContext,
): CalendarBranchOption[] {
  const from = MONTH_ACTION_FROM[action];
  return calendar.choices.filter((choice) => {
    const own = branchStatus(context.monthStates, choice.id, context.monthStatus);
    return own !== undefined && from.includes(own);
  });
}

/** A branch's year, from the year's branch states, else the school's year. */
export function branchYearStatus(context: MonthBranchContext, branch: number): string | undefined {
  return context.yearStates
    ? branchStatus(context.yearStates, branch, context.yearStatus)
    : context.yearStatus;
}

/**
 * The branches whose fiscal year may close now, each judged as `yearCloseState`
 * judges the school's: the branch's year still open, and every one of its own
 * months restricted with the final one not locked. A month whose branch states
 * cannot be read counts at the school's state, and a branch whose months carry
 * no state at all is left to the server, as the school's own would be.
 */
export function yearCloseBranches(
  calendar: CalendarBranch,
  yearStates: BranchCloseState[],
  yearStatus: string | undefined,
  periods: FiscalPeriod[],
): CalendarBranchOption[] {
  return calendar.choices.filter((choice) => {
    const year = branchStatus(yearStates, choice.id, yearStatus);
    if (year === undefined) return false;
    const own = periods.map((period) => {
      const states = readableBranchStates(calendar, period.branch_states);
      return states
        ? { ...period, status: branchStatus(states, choice.id, period.status) as FiscalPeriod["status"] }
        : period;
    });
    const state = yearCloseState(year, own);
    return state === "READY" || state === "UNCHECKED";
  });
}

/** The branches whose fiscal year is closed, and so may be re-opened. */
export function yearReopenBranches(
  calendar: CalendarBranch,
  yearStates: BranchCloseState[],
  yearStatus: string | undefined,
): CalendarBranchOption[] {
  return calendar.choices.filter((choice) => branchStatus(yearStates, choice.id, yearStatus) === "CLOSED");
}

/** "Ikeja", "Ikeja and Lekki", "Ikeja, Lekki and Victoria Island". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The branches' names as one phrase, as `nameList` reads them. */
export function branchList(branches: CalendarBranchOption[]): string {
  return nameList(branches.map((branch) => branch.name));
}
