/**
 * Where a held settlement stands, in words a reader can act on.
 *
 * In held mode the platform keeps a school's online payments in its own
 * provider balance and pays each branch on its interval: a morning run builds
 * one settlement per due branch (payments covered, less the provider's fees and
 * the transfer fee), a platform operator puts it forward, and two different
 * platform people approve it before the money is sent. The server reports this
 * as a status (PENDING, PAID, FAILED) plus the approval state of the transfer
 * batch behind it, so the stage is read from both:
 *
 * - PENDING with no transfer batch: still being prepared, nothing to send yet.
 * - PENDING, batch not yet put forward (or put forward and rejected): ready to
 *   submit.
 * - PENDING, approval pending: waiting for the two approvers.
 * - PENDING, approved: approved and being sent.
 * - PAID: in the branch's bank, and booked in the school's books.
 * - FAILED: the transfer failed; its payments go into the next settlement.
 */

import type { HeldSettlement } from "@/redux/services/payments/payments-types";

export type HeldSettlementStage =
  | "PREPARING"
  | "TO_SUBMIT"
  | "AWAITING_APPROVAL"
  | "SENDING"
  | "PAID"
  | "FAILED";

export function heldSettlementStage(row: Pick<HeldSettlement, "status" | "batch">): HeldSettlementStage {
  if (row.status === "PAID") return "PAID";
  if (row.status === "FAILED") return "FAILED";
  if (!row.batch) return "PREPARING";
  const approval = row.batch.approval_status ?? null;
  if (approval === "PENDING") return "AWAITING_APPROVAL";
  if (approval === "APPROVED") return "SENDING";
  return "TO_SUBMIT";
}

export const STAGE_LABEL: Record<HeldSettlementStage, { label: string; cls: string }> = {
  PREPARING: { label: "Being prepared", cls: "bg-gray-02 text-gray-01" },
  TO_SUBMIT: { label: "Ready to submit", cls: "bg-amber-50 text-amber-700" },
  AWAITING_APPROVAL: { label: "Waiting for approval", cls: "bg-amber-50 text-amber-700" },
  SENDING: { label: "Approved, sending", cls: "bg-blue-50 text-blue-700" },
  PAID: { label: "Paid", cls: "bg-green-01/10 text-green-01" },
  FAILED: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
};

/** Whether a platform operator may put this settlement forward for approval now. */
export function canSubmitHeldSettlement(row: Pick<HeldSettlement, "status" | "batch">): boolean {
  return heldSettlementStage(row) === "TO_SUBMIT";
}

/** The status filter's choices, as the list routes take them. */
export const HELD_STATUS_CHOICES = [
  ["PENDING", "Not yet paid"],
  ["PAID", "Paid"],
  ["FAILED", "Failed"],
] as const;

/** The fees a branch bears on a settlement: the provider's on the payments, and the transfer's. */
export function heldSettlementFees(row: Pick<HeldSettlement, "fees" | "transfer_fee">): number {
  return (row.fees || 0) + (row.transfer_fee || 0);
}

/** The tenants (schools) a platform list holds, by slug, for its school filter. */
export function tenantsIn(rows: readonly { tenant: string; tenant_name: string }[]): { slug: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) if (!seen.has(row.tenant)) seen.set(row.tenant, row.tenant_name || row.tenant);
  return [...seen].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
}
