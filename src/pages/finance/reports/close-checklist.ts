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

export type ChecklistSeverity = "passed" | "blocker" | "warning";

/** What this row means: it passed, it stops the close, or it wants a look. */
export function checklistSeverity(item: CloseChecklistItem): ChecklistSeverity {
  if (item.passed) return "passed";
  return item.blocking ? "blocker" : "warning";
}

export const failedBlockers = (items: CloseChecklistItem[]) =>
  items.filter((item) => checklistSeverity(item) === "blocker");

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
): string {
  const name = periodName || "the period";
  const warnings = failedWarnings(items ?? []);
  if (warnings.length === 0) return `Closed ${name}.`;
  if (warnings.length === 1) {
    return `Closed ${name}. ${warnings[0].detail || "One check is worth a look."}`;
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
  ap_reconciled: "AP reconciled",
  ar_reconciled: "AR reconciled",
  grir_explained: "GR/IR explained",
  trial_balance_balanced: "Trial balance balanced",
  no_draft_journals: "No draft journals",
  depreciation_posted: "Depreciation posted",
  depreciation_posted_for_year: "Depreciation posted for the year",
  deferred_income_released: "Deferred income released",
  gateway_clearing_current: "Collections in clearing",
  inter_branch_balanced: "Branches agree on what they owe each other",
  sealed_figures_unchanged: "Sealed figures unchanged",
};

export const checklistLabel = (name: string, fallback: (value: string) => string) =>
  CHECK_LABELS[name] ?? fallback(name);

/**
 * A row's detail in the reader's words.
 *
 * The inter-branch check names branches by id and amounts in kobo ("branches 3
 * and 5 disagree: 100000000 kobo on one side and 95000000 kobo on the other"),
 * so this one row is reworded with the branches' names and naira: "Ikeja and
 * Lekki disagree: N1,000,000.00 on one side and N950,000.00 on the other".
 * Every other row, and any wording this does not recognise, is shown as sent.
 */
export function checklistDetail(
  item: CloseChecklistItem,
  { branchName, money }: { branchName: (id: number) => string | undefined; money: (kobo: number) => string },
): string {
  const detail = item.detail ?? "";
  if (item.name !== "inter_branch_balanced") return detail;
  return detail
    .replace(/branches (\d+) and (\d+) disagree/g, (whole, a: string, b: string) => {
      const first = branchName(Number(a));
      const second = branchName(Number(b));
      return first && second ? `${first} and ${second} disagree` : whole;
    })
    .replace(/(-?\d+) kobo/g, (_whole, kobo: string) => money(Number(kobo)));
}
