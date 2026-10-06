/**
 * The line that says which stretch of time a report covers.
 *
 * A report names the period it covers as `period_label`, the month in words
 * ("September 2026"), and sends `null` when it covers every period. The heading
 * shows the server's words as they come; `fallback` is the picker's own name for
 * the no-period choice ("Year to date", "All periods"), so a screen never shows
 * the period's stored name ("2026-09"), which is only ever sent back.
 */

export function ReportPeriodHeading({ label, fallback }: { label: string | null | undefined; fallback: string }) {
  return (
    <h3 data-testid="report-period" className="font-mont text-sm font-semibold text-gray-01">
      {label || fallback}
    </h3>
  );
}
