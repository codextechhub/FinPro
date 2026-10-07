/**
 * The fiscal year a report's default window covers, kept while another window
 * is picked.
 *
 * A report with no period chosen covers the fiscal year today falls in, and the
 * server names that year in the answer. Once a reader picks another year or a
 * month the answer names that choice instead, yet the picker's first option
 * must still say which year it would return to. The year is remembered from the
 * last settled answer to the default window, and is null until one arrives.
 */

import { useState } from "react";

export function useDefaultFiscalYear(
  onDefaultWindow: boolean,
  fiscalYear: number | null | undefined,
  settled: boolean,
): number | null {
  const [year, setYear] = useState<number | null>(null);
  // Adjusted during render so the label never paints a stale year.
  if (onDefaultWindow && settled && fiscalYear && fiscalYear !== year) setYear(fiscalYear);
  return year;
}
