/**
 * Depreciation charges a run leaves unposted because they fall in a closed
 * fiscal year.
 *
 * Once FY2026 is closed nothing posts into it, so running depreciation up to
 * February 2027 posts January and February 2027 and leaves December 2026's
 * charge where it is, listed here with its asset, date and year. Reopening the
 * year and running again posts it. The preview lists them before the run, and
 * the run's own answer lists them after.
 */

import type { SkippedDepreciationCharge } from "@/redux/services/finance/ops-types";
import { formatMoney } from "@/utils/money";
import { useDates } from "../../../lib/display-prefs";

/** "2 charges in FY 2026 were skipped" style summary, or null when none were. */
export function skippedSummary(skipped: SkippedDepreciationCharge[] | undefined): string | null {
  const rows = skipped ?? [];
  if (!rows.length) return null;
  const years = [...new Set(rows.map((row) => row.fiscal_year))].join(", ");
  return `${rows.length} ${rows.length === 1 ? "charge falls" : "charges fall"} in a closed year (${years}) and ${rows.length === 1 ? "is" : "are"} skipped. Reopen the year to post ${rows.length === 1 ? "it" : "them"}.`;
}

export function SkippedCharges({ skipped, currency }: { skipped: SkippedDepreciationCharge[] | undefined; currency?: string | null }) {
  const dates = useDates();
  const summary = skippedSummary(skipped);
  if (!summary) return null;
  return (
    <section aria-label="Skipped charges" className="rounded-md border border-amber-200 bg-amber-50/60">
      <p className="px-3 py-2 font-mont text-xs font-semibold text-amber-900">{summary}</p>
      <ul className="divide-y divide-amber-100 border-t border-amber-200 bg-white">
        {(skipped ?? []).map((row) => (
          <li key={`${row.asset_id}-${row.seq}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-mont text-xs">
            <span className="min-w-0 text-gray-01">
              {row.asset}{row.asset_number ? <span className="ml-1 text-gray-05">{row.asset_number}</span> : null}
              <span className="block text-[11px] text-gray-05">{dates.day(row.date)} · {row.fiscal_year}</span>
            </span>
            <span className="tabular-nums text-gray-01">{formatMoney(row.amount, currency)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
