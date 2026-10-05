/**
 * How a report names the period a reader picked.
 *
 * The pickers list periods by row, but the server reads `?period=` of 12 or
 * less as a period number of the latest year, and anything larger as a row id.
 * At books whose periods have small ids (the first school on a fresh server
 * has ids 1 to 12), picking "March 2025" by id 3 asked for March of the latest
 * year instead. A period is therefore always sent as its fiscal year and its
 * number, which the server reads the same way whatever the ids are.
 */

import type { FiscalPeriod } from "@/redux/services/finance/setup-types";

/** The query arguments for the period whose id is `pickedId`, or none for "all periods". */
export function periodParams(
  periods: Pick<FiscalPeriod, "id" | "fiscal_year" | "period_no">[],
  pickedId: string | number | null | undefined,
): { fiscal_year?: number; period?: number } {
  if (pickedId === "" || pickedId == null) return {};
  const period = periods.find((p) => String(p.id) === String(pickedId));
  return period ? { fiscal_year: period.fiscal_year, period: period.period_no } : {};
}
