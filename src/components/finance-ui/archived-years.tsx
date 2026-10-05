/**
 * Archived fiscal years, and the "Show archived years" switch.
 *
 * A closed year a school has put away leaves the year pickers, the period
 * pickers and the document lists, and is shown again, fully readable and
 * reportable, whenever a read asks with `?include_archived=true`. Nothing is
 * deleted. A bill still unpaid from an archived year stays in the lists either
 * way, because the server keeps it there.
 *
 * The switch lives in the page address (`?archived=1`) so each tab keeps its
 * own choice and a link carries it. It is offered only where the school has an
 * archived year: at a school that has archived nothing it would change nothing,
 * so it is absent rather than a dead control. Once on, it stays offered so it
 * can be turned off again.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Archive } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGetFiscalYearsQuery } from "@/redux/services/finance/ops-api";
import { toArray } from "@/redux/services/finance/api-types";
import type { FiscalYear } from "@/redux/services/finance/ops-types";

/** The page-address key that holds the switch. */
export const SHOW_ARCHIVED_PARAM = "archived";

/** The query argument a read adds when archived years are wanted, else nothing. */
export function includeArchivedArg(show: boolean): { include_archived?: "true" } {
  return show ? { include_archived: "true" } : {};
}

/** Whether archived years are shown on this tab, and the setter that keeps it in the address. */
export function useShowArchived(): [boolean, (next: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const show = params.get(SHOW_ARCHIVED_PARAM) === "1";
  const set = useCallback((next: boolean) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next) updated.set(SHOW_ARCHIVED_PARAM, "1");
      else updated.delete(SHOW_ARCHIVED_PARAM);
      return updated;
    }, { replace: true });
  }, [setParams]);
  return [show, set];
}

/** The school's archived years, newest first. Shares the year list's cache. */
export function useArchivedYears(entity: string | null | undefined): { years: FiscalYear[]; isLoading: boolean } {
  const { data, isLoading } = useGetFiscalYearsQuery(
    { entity: entity ?? "", include_archived: "true" },
    { skip: !entity },
  );
  const years = useMemo(
    () => toArray(data?.data).filter((year) => year.is_archived).sort((a, b) => b.year - a.year),
    [data],
  );
  return { years, isLoading };
}

/** The archived year labels as a reader sees them: "FY 2027 and FY 2028". */
export function archivedYearsLabel(years: Pick<FiscalYear, "year">[]): string {
  const names = years.map((year) => `FY ${year.year}`);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The switch itself. Renders nothing at a school with no archived year unless
 * it is already on.
 */
export function ShowArchivedToggle({ entity, className }: { entity: string | null | undefined; className?: string }) {
  const [show, setShow] = useShowArchived();
  const { years } = useArchivedYears(entity);
  if (!years.length && !show) return null;
  return (
    <label
      className={cn("inline-flex cursor-pointer items-center gap-1.5 font-mont text-xs text-gray-01", className)}
      title={years.length ? `Archived: ${archivedYearsLabel(years)}` : undefined}
    >
      <input
        type="checkbox"
        checked={show}
        onChange={(event) => setShow(event.target.checked)}
        className="size-3.5 accent-primary"
      />
      <Archive className="size-3.5 text-gray-05" aria-hidden />
      Show archived years
    </label>
  );
}
