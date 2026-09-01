// Pure (non-component) helpers and status-tab definitions for the Sourcing
// section. Kept out of shared.tsx so that file only exports components (React
// Fast Refresh requires component-only modules).

// ── Status tab definitions (server value, tab label) ──────────────────────────
// ISSUED is surfaced as "Open" - the buyer-facing name for a live invitation.
export const RFQ_TABS = [
  ["All", ""], ["Draft", "DRAFT"], ["Open", "ISSUED"], ["Awarded", "AWARDED"],
  ["Closed", "CLOSED"], ["Cancelled", "CANCELLED"],
] as const;

export const QUOTATION_TABS = [
  ["All", ""], ["Draft", "DRAFT"], ["Submitted", "SUBMITTED"],
  ["Awarded", "AWARDED"], ["Rejected", "REJECTED"],
] as const;

/**
 * Format a backend date for display, as "14 Aug 2026".
 *
 * Accepts both shapes the API returns: a plain `YYYY-MM-DD` (document dates like
 * `invoice_date`, `movement_date`) and a full ISO timestamp (`created_at`,
 * `updated_at`). A bare date is pinned to local midnight so it never renders as
 * the previous day west of UTC; a timestamp is already an instant and is parsed
 * as it stands.
 *
 * Never throws. It used to append `T00:00:00` unconditionally, so passing a
 * timestamp built `…835589ZT00:00:00`, and `Intl.format` raised `RangeError` on
 * the Invalid Date - which took the whole page to the error boundary because a
 * date cell threw during render. A formatter that cannot read its input should
 * render a dash, not destroy the screen around it.
 */
export function shortDate(value?: string | null) {
  if (!value) return "-";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(parsed);
}

export function isForbidden(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}
