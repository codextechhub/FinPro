// Copy and tone for the fiscal-calendar runway banner.
//
// Fiscal periods are created a year at a time. When the last one's end date passes
// with no new year created, the posting guard rejects every date, so every posting
// in the entity fails at once: invoices, receipts, payroll, gateway settlements.
// Nothing degrades first, which is why the dashboard has to say something before
// the date arrives - and why it must say nothing at all while the runway is fine.
//
// The words live here rather than in the component so all four states (fine,
// running out, lapsed, never had a calendar) can be read and tested in one place.

import type { FiscalRunway } from "@/redux/services/finance/reports-types";

export interface RunwayNotice {
  tone: "warning" | "critical";
  title: string;
  body: string;
}

/** "1 day" / "12 days" - the notice counts in both directions, so it needs both. */
export function dayCount(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;
}

/**
 * The banner to show for ``runway``, or ``null`` when there is nothing to say.
 *
 * ``formatDate`` renders an ISO date the way the surrounding screen does, so the
 * notice never invents its own date format.
 */
export function fiscalRunwayNotice(
  runway: FiscalRunway | undefined | null,
  formatDate: (iso: string) => string,
): RunwayNotice | null {
  if (!runway || runway.status === "HEALTHY") return null;

  const consequence = "invoices, receipts, payroll and gateway settlements";

  if (runway.status === "EXPIRED") {
    // No calendar end at all means the entity was never given periods - the same
    // can't-post position, but a different sentence: there is nothing to extend.
    if (!runway.calendar_end) {
      return {
        tone: "critical",
        title: "No fiscal calendar - nothing can post",
        body: "This entity has no fiscal periods, so there is no date anything can be posted on. Create its fiscal year to start posting.",
      };
    }
    const ago = runway.days_remaining == null ? "" : ` (${dayCount(Math.abs(runway.days_remaining))} ago)`;
    return {
      tone: "critical",
      title: "Fiscal calendar has run out - nothing can post",
      body: `The last fiscal period ended on ${formatDate(runway.calendar_end)}${ago}. Until the next fiscal year is created, every posting in this entity is rejected: ${consequence}.`,
    };
  }

  const left = runway.days_remaining ?? 0;
  return {
    tone: "warning",
    title: left === 0 ? "Fiscal calendar ends today" : `Fiscal calendar ends in ${dayCount(left)}`,
    body: `The last fiscal period ends on ${runway.calendar_end ? formatDate(runway.calendar_end) : "its final day"}. Create the next fiscal year before then, or every posting in this entity starts failing: ${consequence}.`,
  };
}
