/**
 * Whose fiscal calendar the close workbench reads and changes.
 *
 * Each branch keeps its own calendar: it soft-closes, closes, re-opens and
 * locks its months on its own, and closes and re-opens its own year. The
 * school's calendar follows the branches rather than being set by hand: a
 * school month closes once every branch has closed it and locks once every
 * branch has locked it, a school year closes once every branch's year has
 * closed, and re-opening any one branch's month or year re-opens the school's.
 *
 * So the workbench asks one question, "which branch?", and answers it the way
 * the server does:
 *
 * - At a school with one branch nothing is asked or shown. The lists send no
 *   branch, and neither do the actions: the server takes the only branch.
 * - A reader whose reach is one branch (Mrs Adeyemi, posted to Ikeja) reads
 *   and acts on that branch without being asked.
 * - Anyone else at a school with several branches (Mr Bello, bursar for Ikeja
 *   and Lekki) picks from All branches and each branch they reach. The pick
 *   lives in the page address (`?branch=`), so two tabs can hold two branches.
 *   With one branch picked, the lists report that branch's own states and every
 *   action sends it. Under All branches the lists report the school's states,
 *   and every action asks which branch it is for: the server refuses a
 *   calendar change that names none, and guessing one would close the wrong
 *   branch's books.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { useReaderBranchLens, type ReaderBranchLens } from "@/components/finance-ui/raising-branch";

/** The page-address key that holds the workbench's branch. */
export const CALENDAR_BRANCH_PARAM = "branch";

export interface CalendarBranchOption {
  id: number;
  name: string;
}

export interface CalendarBranch {
  /** The school runs more than one branch, so the branch changes what is shown. */
  applies: boolean;
  /** The reader may switch between All branches and their branches. */
  canChoose: boolean;
  /** The branch the lists read, or "all" for the school's own state. */
  selected: number | "all";
  /** `?branch=` for the calendar reads; undefined reads the school's state. */
  readBranch: number | undefined;
  /** The branch every action sends without asking; null when the action must
   *  ask (`mustAsk`) or the school has one branch and the server infers it. */
  actBranch: number | null;
  /** Each action asks which branch it is for, offering `choices`. */
  mustAsk: boolean;
  /** The branches the reader may act for. */
  choices: CalendarBranchOption[];
  isLoading: boolean;
}

/** The rule in the file's doc block, as plain data so it can be tested apart from React. */
export function calendarBranchFor(lens: ReaderBranchLens, param: string | null): CalendarBranch {
  const choices = lens.choices.map((b) => ({ id: Number(b.id), name: b.name }));
  const base = { choices, isLoading: lens.isLoading };
  if (!lens.applies) {
    return { ...base, applies: false, canChoose: false, selected: "all", readBranch: undefined, actBranch: null, mustAsk: false };
  }
  const fixed = lens.pinnedBranch ?? (choices.length === 1 ? choices[0].id : null);
  if (fixed != null) {
    return { ...base, applies: true, canChoose: false, selected: fixed, readBranch: fixed, actBranch: fixed, mustAsk: false };
  }
  const picked = param != null && /^\d+$/.test(param) && choices.some((b) => b.id === Number(param))
    ? Number(param)
    : null;
  if (picked != null) {
    return { ...base, applies: true, canChoose: true, selected: picked, readBranch: picked, actBranch: picked, mustAsk: false };
  }
  return { ...base, applies: true, canChoose: true, selected: "all", readBranch: undefined, actBranch: null, mustAsk: true };
}

/** The name of a branch the reader may act for, or a neutral word when unknown. */
export function calendarBranchName(calendar: CalendarBranch, id: number | null | undefined): string {
  return calendar.choices.find((b) => b.id === id)?.name ?? "this branch";
}

/**
 * The branch an action sends: the workbench's own, else the one chosen in the
 * confirm dialog, else none (a one-branch school, where the server infers it).
 */
export function actionBranch(calendar: CalendarBranch, chosen: string): number | undefined {
  if (calendar.actBranch != null) return calendar.actBranch;
  if (calendar.mustAsk && chosen) return Number(chosen);
  return undefined;
}

/** Whether a confirm dialog has the branch it needs. */
export function actionBranchReady(calendar: CalendarBranch, chosen: string): boolean {
  return !calendar.mustAsk || !!chosen;
}

/** The workbench's branch for the signed-in reader, kept in the page address. */
export function useCalendarBranch(): CalendarBranch & { choose: (next: number | "all") => void } {
  const lens = useReaderBranchLens();
  const [params, setParams] = useSearchParams();
  const param = params.get(CALENDAR_BRANCH_PARAM);
  const calendar = useMemo(() => calendarBranchFor(lens, param), [lens, param]);
  const choose = useCallback((next: number | "all") => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === "all") updated.delete(CALENDAR_BRANCH_PARAM);
      else updated.set(CALENDAR_BRANCH_PARAM, String(next));
      return updated;
    }, { replace: true });
  }, [setParams]);
  return { ...calendar, choose };
}
