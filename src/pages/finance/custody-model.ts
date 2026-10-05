/**
 * The school's choice of who holds its online money, as the Online payments
 * panel reads and changes it.
 *
 * HELD (the default): payments settle into the platform's provider balance,
 * the platform pays each branch every `settlement_interval_days`, and online
 * payouts draw on what it holds for the branch. DIRECT: each branch's
 * collection account has a provider subaccount and payments settle straight
 * into it, so nothing is held and there are no online payouts or online
 * refunds.
 *
 * A change of mode never takes effect at once. It waits for the first day of
 * next month, and a move to direct also waits until the platform holds nothing
 * for the school. Moving to direct is refused until every branch's collection
 * account is set up with the provider, or on the first of the month a branch
 * would be unable to take a payment. Choosing the mode already in force cancels
 * a change still waiting; choosing the mode already waiting keeps its date.
 */

import type { CustodyBranch, CustodyMode, CustodySettings } from "@/redux/services/payments/payments-types";

export const CUSTODY_MODES: { value: CustodyMode; label: string; detail: string }[] = [
  {
    value: "HELD",
    label: "Held, then paid to each branch",
    detail: "Payments are held for the school and paid into each branch's bank on its settlement interval. Online payouts draw on what is held for the branch.",
  },
  {
    value: "DIRECT",
    label: "Straight to each branch's bank",
    detail: "Each branch's collection account takes its payments directly. There are no online payouts or online refunds; pay and refund from the bank.",
  },
];

export const custodyModeLabel = (mode: CustodyMode | null | undefined): string =>
  CUSTODY_MODES.find((m) => m.value === mode)?.label ?? "Held, then paid to each branch";

/** The first day of the month after `today` (`YYYY-MM-DD`), when a mode change takes effect. */
export function firstOfNextMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The branches whose collection account is missing or not set up with the provider. */
export function branchesNotReady(branches: readonly CustodyBranch[]): string[] {
  return branches
    .filter((b) => !b.collection_account?.subaccount_ready)
    .map((b) => b.branch_name);
}

/** What saving `chosen` as the mode would do. */
export type CustodyChange =
  | { kind: "none" }
  | { kind: "cancel"; pending: CustodyMode }
  | { kind: "keep"; from: string | null }
  | { kind: "schedule"; to: CustodyMode; from: string };

export function custodyChange(settings: Pick<CustodySettings, "stored_mode" | "pending_mode" | "pending_from">, chosen: CustodyMode, today: string): CustodyChange {
  if (chosen === settings.stored_mode) {
    return settings.pending_mode ? { kind: "cancel", pending: settings.pending_mode } : { kind: "none" };
  }
  if (chosen === settings.pending_mode) return { kind: "keep", from: settings.pending_from };
  return { kind: "schedule", to: chosen, from: firstOfNextMonth(today) };
}

/** Whole days within the server's bounds, or null. */
export function wholeDaysIn(raw: string, low: number, high: number): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= low && n <= high ? n : null;
}

export const SETTLEMENT_INTERVAL_DAYS = { low: 1, high: 7 } as const;
export const CLEARING_STALE_DAYS = { low: 1, high: 60 } as const;
