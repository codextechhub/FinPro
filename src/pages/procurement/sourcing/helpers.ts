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

export { isForbidden } from "../../../lib/api-errors";
