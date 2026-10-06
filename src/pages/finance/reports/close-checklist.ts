/**
 * How a close-checklist row should be read, and what to say after a close.
 *
 * The checklist has two severities, and drawing them the same way is a real
 * hazard rather than a cosmetic one. `ap_reconciled` blocks: sub-ledger drift
 * means a posting bypassed the sub-ledger and must be found before the period is
 * sealed. `grir_explained` warns: goods received late in the month and not yet
 * billed leave a GR/IR balance *by design*, so failing the close on it would make
 * month-end impossible. The row exists so nobody closes without seeing the number,
 * not to stop them closing.
 *
 * Kept pure and separate from the drawer so both the styling and the post-close
 * message read the same rules.
 */

import type { CloseChecklistItem } from "@/redux/services/finance/setup-types";

export type ChecklistSeverity = "passed" | "done-by-close" | "blocker" | "warning";

/**
 * What this row means: it passed, the close will settle it, it stops the
 * close, or it wants a look.
 *
 * `done-by-close` is work outstanding now that pressing Close does itself,
 * such as six depreciation charges falling due: the close posts them before it
 * checks. Drawn as a blocker it read as a broken control, because the close
 * then went through. The backend reports such a row as passed as well, so the
 * progress count and the ready state already include it.
 */
export function checklistSeverity(item: CloseChecklistItem): ChecklistSeverity {
  if (item.done_by_close) return "done-by-close";
  if (item.passed) return "passed";
  return item.blocking ? "blocker" : "warning";
}

export const failedBlockers = (items: CloseChecklistItem[]) =>
  items.filter((item) => checklistSeverity(item) === "blocker");

/**
 * The check that holds a month until every earlier month is closed.
 *
 * Unlike every other blocker it cannot be forced past: the order a school's
 * months close in is its own setting, not a check a reason overrides.
 */
export const CLOSE_ORDER_CHECK = "earlier_periods_closed";

/**
 * Whether a force close could get past these blockers: never past the close
 * order while it blocks. Under All branches the close-order row is a warning
 * (`blocking` false) while some branch can still close the month, so it is not
 * among the blockers then and Force close stays available for that branch.
 */
export const forceCanClose = (items: CloseChecklistItem[]) => {
  const blockers = failedBlockers(items);
  return blockers.length > 0 && !blockers.some((item) => item.name === CLOSE_ORDER_CHECK);
};

export const failedWarnings = (items: CloseChecklistItem[]) =>
  items.filter((item) => checklistSeverity(item) === "warning");

/**
 * The toast after a successful close.
 *
 * Deliberately keyed off the *warnings*, not off `checklist.passed`. `passed`
 * ignores non-blocking rows by design, and a close that fails a blocker raises
 * server-side instead of returning - so a successful response always carries
 * `passed: true` and the old check could never fire. The number worth reporting
 * here is the one that legitimately survived the close.
 */
export function closeOutcomeMessage(
  periodName: string | undefined,
  items: CloseChecklistItem[] | undefined,
  describe: (item: CloseChecklistItem) => string = (item) => item.detail ?? "",
): string {
  const name = periodName || "the period";
  const warnings = failedWarnings(items ?? []);
  if (warnings.length === 0) return `Closed ${name}.`;
  if (warnings.length === 1) {
    return `Closed ${name}. ${describe(warnings[0]) || "One check is worth a look."}`;
  }
  return `Closed ${name} with ${warnings.length} warnings worth a look.`;
}

/**
 * Display names for the checks the backend ships.
 *
 * `humanize()` alone turns snake_case into "Grir explained" and "Ap reconciled",
 * which reads as a typo rather than as the ledger terms these are. Unknown names
 * still fall through to the generic humaniser, so a check added server-side
 * appears with a readable label rather than not at all.
 */
export const CHECK_LABELS: Record<string, string> = {
  ap_reconciled: "AP reconciled (what is owed to suppliers)",
  ar_reconciled: "AR reconciled (what customers owe)",
  grir_explained: "GR/IR explained (goods received, not yet billed)",
  trial_balance_balanced: "Trial balance balanced",
  no_draft_journals: "No draft journals",
  depreciation_posted: "Depreciation posted",
  depreciation_posted_for_year: "Depreciation posted for the year",
  deferred_income_released: "Deferred income released",
  gateway_clearing_current: "Collections in clearing",
  inter_branch_balanced: "Branches agree on what they owe each other",
  sealed_figures_unchanged: "Sealed figures unchanged",
  earlier_periods_closed: "Earlier months closed",
};

export const checklistLabel = (name: string, fallback: (value: string) => string) =>
  CHECK_LABELS[name] ?? fallback(name);

/**
 * A checklist row's words: the server's own `label`, else this screen's name for
 * the check, else the humanised machine name.
 */
export const checklistItemLabel = (item: { name: string; label?: string }, fallback: (value: string) => string) =>
  item.label?.trim() || checklistLabel(item.name, fallback);
