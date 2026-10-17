/**
 * Which stretch of time a document list shows: every year, one financial year,
 * or a range of dates.
 *
 * The server narrows a list with `?fiscal_year=` (a year's label, such as 2015)
 * or `?date_from=` / `?date_to=`, and places each document by its own date: an
 * order by its order date, a bill by its invoice date. A year is the school's
 * own financial year, so where Bright Star runs September to August, FY 2015 is
 * 1 September 2014 to 31 August 2015.
 *
 * The rule for the screen:
 *
 * - A list opens on All years, so nothing that is still being worked on (last
 *   July's order still waiting for delivery) drops out of view.
 * - The pick lives in the page address (`?year=`, or `?from=` and `?to=`), so a
 *   link carries it and two tabs can hold two years, the way the branch pick
 *   does. It combines with the branch: Mrs Bello picks Ikeja and FY 2015 and
 *   sees Ikeja's 2015 orders, and the figures above count only those.
 * - Archived years are offered only to a role that may read which years are
 *   archived (Field Access, `finance.fiscalyear`); picking one shows its
 *   documents, which the default list leaves out.
 * - A school with no financial year yet is offered All years and custom dates.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { DatePickerInput } from "@/components/ui/date-picker-input";
import { NativeSelect } from "@/components/ui/native-select";
import { useGetFiscalYearsQuery } from "@/redux/services/finance/ops-api";
import { toArray } from "@/redux/services/finance/api-types";
import { useCalendarFieldAccess } from "./calendar-access";

export const LIST_YEAR_PARAM = "year";
export const LIST_FROM_PARAM = "from";
export const LIST_TO_PARAM = "to";
const CUSTOM = "custom";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ListPeriodView =
  | { kind: "all" }
  | { kind: "year"; year: number }
  | { kind: "range"; from: string; to: string };

/** One year the picker offers. */
export interface ListPeriodYear {
  year: number;
  archived: boolean;
}

/** The pick in the page address, as plain data. A malformed date is ignored. */
export function listPeriodFor(params: URLSearchParams): ListPeriodView {
  const year = params.get(LIST_YEAR_PARAM);
  if (year && /^\d{4}$/.test(year)) return { kind: "year", year: Number(year) };
  const day = (key: string) => {
    const value = params.get(key) ?? "";
    return ISO_DAY.test(value) ? value : "";
  };
  const from = day(LIST_FROM_PARAM);
  const to = day(LIST_TO_PARAM);
  if (year === CUSTOM || from || to) return { kind: "range", from, to };
  return { kind: "all" };
}

/** The query a list asks the server with: a year, the ends of a range given, or nothing. */
export function listPeriodArg(view: ListPeriodView): { fiscal_year?: number; date_from?: string; date_to?: string } {
  if (view.kind === "year") return { fiscal_year: view.year };
  if (view.kind === "range") {
    return {
      ...(view.from ? { date_from: view.from } : {}),
      ...(view.to ? { date_to: view.to } : {}),
    };
  }
  return {};
}

/** The list's period, read from and written to the page address. */
export function useListPeriod(): {
  view: ListPeriodView;
  chooseYear: (next: string) => void;
  chooseRange: (from: string, to: string) => void;
} {
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => listPeriodFor(params), [params]);
  const write = useCallback((apply: (copy: URLSearchParams) => void) => {
    setParams((current) => {
      const copy = new URLSearchParams(current);
      copy.delete(LIST_YEAR_PARAM);
      copy.delete(LIST_FROM_PARAM);
      copy.delete(LIST_TO_PARAM);
      apply(copy);
      return copy;
    }, { replace: true });
  }, [setParams]);
  const chooseYear = useCallback((next: string) => write((copy) => {
    if (next && next !== "all") copy.set(LIST_YEAR_PARAM, next);
  }), [write]);
  const chooseRange = useCallback((from: string, to: string) => write((copy) => {
    copy.set(LIST_YEAR_PARAM, CUSTOM);
    if (from) copy.set(LIST_FROM_PARAM, from);
    if (to) copy.set(LIST_TO_PARAM, to);
  }), [write]);
  return { view, chooseYear, chooseRange };
}

/** The years the picker offers, newest first, archived ones only where the role may know them. */
export function useListPeriodYears(entity: string | null | undefined): ListPeriodYear[] {
  const { archiveReadable } = useCalendarFieldAccess();
  const { data } = useGetFiscalYearsQuery(
    { entity: entity ?? "", ...(archiveReadable ? { include_archived: "true" as const } : {}) },
    { skip: !entity },
  );
  return useMemo(
    () => toArray(data?.data)
      .map((row) => ({ year: row.year, archived: !!row.is_archived }))
      .sort((a, b) => b.year - a.year),
    [data],
  );
}

/**
 * The period picker of a list's filter bar: a year select, and under Custom
 * dates the two ends of the range beside it.
 */
export function ListPeriodSelect({ entity, view, onYear, onRange, className }: {
  entity: string | null | undefined;
  view: ListPeriodView;
  onYear: (next: string) => void;
  onRange: (from: string, to: string) => void;
  className?: string;
}) {
  const years = useListPeriodYears(entity);
  const value = view.kind === "year" ? String(view.year) : view.kind === "range" ? CUSTOM : "all";
  const picked = view.kind === "year" && !years.some((y) => y.year === view.year) ? view.year : null;
  return (
    <div className={className ?? "flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap"}>
      <NativeSelect
        value={value}
        onChange={(e) => (e.target.value === CUSTOM ? onRange("", "") : onYear(e.target.value))}
        aria-label="Year"
        className="h-9 w-full sm:w-36"
      >
        <option value="all">All years</option>
        {years.map((y) => (
          <option key={y.year} value={String(y.year)}>{`FY ${y.year}${y.archived ? " · archived" : ""}`}</option>
        ))}
        {picked != null ? <option value={String(picked)}>{`FY ${picked}`}</option> : null}
        <option value={CUSTOM}>Custom dates</option>
      </NativeSelect>
      {view.kind === "range" && (
        <>
          <DatePickerInput
            value={view.from}
            onChange={(e) => onRange(e.target.value, view.to)}
            aria-label="From"
            placeholder="From"
            className="h-9 w-full bg-white font-mont text-sm sm:w-36"
          />
          <DatePickerInput
            value={view.to}
            onChange={(e) => onRange(view.from, e.target.value)}
            aria-label="To"
            placeholder="To"
            className="h-9 w-full bg-white font-mont text-sm sm:w-36"
          />
        </>
      )}
    </div>
  );
}
