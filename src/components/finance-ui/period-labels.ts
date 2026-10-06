/**
 * A period's name as a person reads it, for a payload that names a period by its
 * stored name only.
 *
 * Fiscal periods carry a `label` ("September 2026") beside their stored `name`
 * ("2026-09"); the name is for sending back to the server and is never shown. A
 * journal read still names its period by the stored name alone, so a list or
 * drawer showing it looks the label up in the entity's periods. A name no
 * period answers to (a calendar too old to be read) shows as it was sent.
 */

import { useMemo } from "react";
import { toArray } from "@/redux/services/finance/api-types";
import { useGetPeriodsQuery } from "@/redux/services/finance/setup-api";
import type { FiscalPeriod } from "@/redux/services/finance/setup-types";

/** The label of the period stored under `name`, else `name` itself, else a dash for no period. */
export function periodLabelFrom(periods: Pick<FiscalPeriod, "name" | "label">[], name: string | null | undefined): string {
  if (!name) return "-";
  return periods.find((period) => period.name === name)?.label ?? name;
}

/**
 * Reads the entity's periods, archived years included because a journal can sit
 * in one, and answers a period name with its label.
 */
export function usePeriodLabel(entity: string | null | undefined): (name: string | null | undefined) => string {
  const { data } = useGetPeriodsQuery({ entity: entity!, include_archived: "true" }, { skip: !entity });
  const periods = useMemo(() => toArray(data?.data), [data]);
  return (name) => periodLabelFrom(periods, name);
}
