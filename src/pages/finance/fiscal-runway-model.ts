/**
 * Copy and tone for the fiscal-calendar runway banner.
 *
 * Fiscal periods are created a year at a time. When the last one's end date passes
 * with no new year created, the posting guard rejects every date, so every posting
 * in the entity fails at once: invoices, receipts, payroll, gateway settlements.
 * Nothing degrades first, which is why the dashboard has to say something before
 * the date arrives - and why it must say nothing at all while the runway is fine.
 *
 * The calendar can also break before its end, at a gap between two years.
 * Bright Star's FY2026 ends on 31 December 2026 and its FY2027 starts on
 * 1 February 2027, so nothing dated in January 2027 can post, although the
 * calendar runs on to the end of 2027. The server lists every such gap; the
 * banner names the first one still ahead, whatever the lead, because no lead
 * makes a gap go away by itself.
 *
 * The words live here rather than in the component so every state (fine, running
 * out, lapsed, never had a calendar, a gap ahead, today inside a gap) can be read
 * and tested in one place.
 */

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

const CONSEQUENCE = "invoices, receipts, payroll and gateway settlements";

/**
 * The first gap still ahead (ending on or after today). Where the server lists
 * no gaps, a first uncovered day before the calendar's last day is a gap whose
 * end is not known, so the sentence names only where it starts.
 */
function gapAhead(runway: FiscalRunway): { start: string; end: string | null } | null {
  if (runway.gaps) {
    const today = runway.today;
    return runway.gaps.find((gap) => !today || gap.end >= today) ?? null;
  }
  const first = runway.first_uncovered_date;
  if (first && runway.calendar_end && first < runway.calendar_end) return { start: first, end: null };
  return null;
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
  if (!runway) return null;
  const gap = gapAhead(runway);
  const span = !gap ? "" : gap.end
    ? `${formatDate(gap.start)} to ${formatDate(gap.end)}`
    : `the days from ${formatDate(gap.start)} until the next fiscal year starts`;

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
    // Today sits inside a gap between two years rather than past the last one.
    if (gap && gap.start <= (runway.today ?? runway.first_uncovered_date ?? "")) {
      return {
        tone: "critical",
        title: "Today falls in a gap in the fiscal calendar - nothing can post",
        body: `No fiscal period covers ${span}, so nothing dated in that stretch can post: ${CONSEQUENCE}.`,
      };
    }
    const ago = runway.days_remaining == null ? "" : ` (${dayCount(Math.abs(runway.days_remaining))} ago)`;
    return {
      tone: "critical",
      title: "Fiscal calendar has run out - nothing can post",
      body: `The last fiscal period ended on ${formatDate(runway.calendar_end)}${ago}. Until the next fiscal year is created, every posting in this entity is rejected: ${CONSEQUENCE}.`,
    };
  }

  // The break ahead is a gap between two years, whether or not it is within the lead.
  if (gap && (runway.status === "HEALTHY" || runway.first_uncovered_date === gap.start)) {
    return {
      tone: "warning",
      title: "The fiscal calendar has a gap",
      body: `No fiscal period covers ${span}, so nothing dated in that stretch can post: ${CONSEQUENCE}.`,
    };
  }

  if (runway.status === "HEALTHY") return null;

  const left = runway.days_remaining ?? 0;
  return {
    tone: "warning",
    title: left === 0 ? "Fiscal calendar ends today" : `Fiscal calendar ends in ${dayCount(left)}`,
    body: `The last fiscal period ends on ${runway.calendar_end ? formatDate(runway.calendar_end) : "its final day"}. Create the next fiscal year before then, or every posting in this entity starts failing: ${CONSEQUENCE}.`,
  };
}
