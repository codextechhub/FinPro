/**
 * What each report's heading says when no month is chosen.
 *
 * A downloaded file names its period in its heading, and the screen it came
 * from must read the same, or a board pack and the screen it was printed from
 * disagree. With no month chosen the server's `period_label` is null and the
 * words below stand in. They are the words the report's own file carries, and
 * each is what the report computes:
 *
 * - Trial balance and analytics: every period on record ("All periods").
 * - Changes in equity: the whole ledger up to today, opening at zero
 *   ("Inception to date").
 * - Cash flow: the whole ledger. Its file heading says "Year to date", which is
 *   the file's own wording and is kept so screen and file agree.
 * - Income statement: the fiscal year today falls in, named as "FY2026", or
 *   "Year to date" when no fiscal year exists.
 */

export const ALL_PERIODS = "All periods";
export const INCEPTION_TO_DATE = "Inception to date";
export const YEAR_TO_DATE = "Year to date";

export const TRIAL_BALANCE_NO_PERIOD = ALL_PERIODS;
export const ANALYTICS_NO_PERIOD = ALL_PERIODS;
export const EQUITY_NO_PERIOD = INCEPTION_TO_DATE;
export const CASH_FLOW_NO_PERIOD = YEAR_TO_DATE;

/** The income statement's heading for the fiscal year it covers, as its file reads it. */
export function incomeStatementNoPeriod(fiscalYear: number | string | null | undefined): string {
  return fiscalYear ? `FY${fiscalYear}` : YEAR_TO_DATE;
}
