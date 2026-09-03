/**
 * Whether an AR adjustment posts straight to the ledger or has to be approved.
 *
 * The rule is not the same for all four documents, and that asymmetry is the whole
 * point. A refund moves cash out and a write-off concedes income, so both need a
 * second person at any size. A concession or a credit note gives revenue away, so
 * both need one **at or above the tenant's adjustment threshold** (₦50,000 by
 * default) and post directly below it.
 *
 * So one concession form behaves two ways, and the person filling it in has to know
 * which before they commit - not at submit time, when they have already written the
 * reason and picked the invoice.
 *
 * Two sources, deliberately kept apart:
 *
 *   * **The server's `approval_required`** decides what actually happens. It is on
 *     every adjustment read, it is computed by the same function the post endpoint
 *     calls, and it can never disagree with the refusal.
 *   * **The threshold read off the workflow template** only powers the *label*, on a
 *     form whose document does not exist yet and therefore has no server answer.
 *
 * Never act on the predicted one. If the two disagree the server is right, and the
 * screen should follow it rather than argue.
 */

import type { WorkflowTemplate } from "@/redux/services/dashboard/workflow-types";

/** The four documents this applies to, by their workflow document type. */
export type AdjustmentDocType =
  | "finance.refund"
  | "finance.write_off"
  | "finance.concession"
  | "finance.credit_note";

export type GateMode =
  /** No ladder published: this document type posts directly at any amount. */
  | "never"
  /** Every amount goes through approval (refunds, write-offs). */
  | "always"
  /** Gated at or above `threshold` kobo, posts directly below it. */
  | "threshold";

export interface GateRule {
  mode: GateMode;
  /** Kobo, only meaningful when `mode` is `"threshold"`. */
  threshold: number | null;
}

export const NO_GATE: GateRule = { mode: "never", threshold: null };

interface StageLike {
  inclusion_condition?: unknown;
  retired_at?: string | null;
}

/** The `gte` amount a stage applies from, or null when it always applies. */
function stageThreshold(stage: StageLike): number | null {
  const condition = stage.inclusion_condition;
  if (!condition || typeof condition !== "object") return null;
  const { op, value } = condition as { op?: unknown; value?: unknown };
  if (op !== "gte" || typeof value !== "number") return null;
  return value;
}

/**
 * Turn the published template for one document type into the rule its form follows.
 *
 * A stage with no condition always applies, so the document is always gated - one
 * such stage is enough. Otherwise the document is gated from the *lowest* threshold
 * any stage carries, because that is the first amount at which something applies.
 *
 * An unrecognised condition shape (anything but `gte` on a number) is treated as
 * always-applies rather than ignored. Erring towards "this needs approval" is the
 * safe direction for a label: the worst case is that the button says Submit and the
 * server lets a Post through, which the screen then corrects from the real answer.
 */
export function gateRuleFromTemplate(template: { stages?: StageLike[] } | null | undefined): GateRule {
  const stages = (template?.stages ?? []).filter((stage) => !stage.retired_at);
  if (stages.length === 0) return NO_GATE;

  let lowest: number | null = null;
  for (const stage of stages) {
    if (!stage.inclusion_condition) return { mode: "always", threshold: null };
    const value = stageThreshold(stage);
    if (value === null) return { mode: "always", threshold: null };
    lowest = lowest === null ? value : Math.min(lowest, value);
  }
  return lowest === null ? { mode: "always", threshold: null } : { mode: "threshold", threshold: lowest };
}

/**
 * Pick the template that actually governs a document type for this tenant.
 *
 * Mirrors the engine's cascade closely enough for a label: a tenant's own active
 * template wins over the shared platform one. Branch-level templates are not
 * distinguished here - the console has no branch context on these forms, and
 * getting the *threshold* wrong by a branch override only mislabels a button that
 * the server's answer immediately corrects.
 */
export function resolveGateRule(
  templates: WorkflowTemplate[] | undefined,
  documentType: AdjustmentDocType,
): GateRule {
  const matching = (templates ?? []).filter(
    (template) => template.document_type === documentType && template.is_active !== false,
  );
  if (matching.length === 0) return NO_GATE;
  const own = matching.find((template) => template.is_platform === false);
  return gateRuleFromTemplate(own ?? matching[0]);
}

/** Would an amount of this size need approval, by the predicted rule? */
export function predictsApproval(rule: GateRule, amountKobo: number): boolean {
  if (rule.mode === "never") return false;
  if (rule.mode === "always") return true;
  return rule.threshold !== null && amountKobo >= rule.threshold;
}

/**
 * The primary action for a draft.
 *
 * `serverAnswer` is the document's own `approval_required`. It is preferred
 * whenever it exists, because it is the same computation the post endpoint runs.
 * The predicted rule only covers the case where there is no document yet.
 */
export function primaryAction(
  serverAnswer: boolean | undefined,
  rule: GateRule,
  amountKobo: number,
): "post" | "submit" {
  const gated = serverAnswer ?? predictsApproval(rule, amountKobo);
  return gated ? "submit" : "post";
}

/**
 * The line explaining why this form is about to behave the way it is.
 *
 * Returns null when there is nothing worth saying - an ungated document type needs
 * no commentary, and neither does an amount nowhere near the threshold on a form
 * the user has not filled in yet.
 */
export function gateExplanation(
  rule: GateRule,
  amountKobo: number,
  formatMoney: (kobo: number) => string,
): string | null {
  if (rule.mode === "never") return null;
  if (rule.mode === "always") {
    return "This always needs a second person's approval before it reaches the ledger.";
  }
  if (rule.threshold === null) return null;
  if (amountKobo >= rule.threshold) {
    return `At ${formatMoney(rule.threshold)} or more this needs approval, so it will be submitted rather than posted.`;
  }
  if (amountKobo > 0) {
    return `Under ${formatMoney(rule.threshold)} this posts straight to the ledger. At ${formatMoney(rule.threshold)} or more it would need approval.`;
  }
  return `Amounts of ${formatMoney(rule.threshold)} or more need approval; smaller ones post directly.`;
}

// ── Bulk refusals ────────────────────────────────────────────────────────────

/**
 * The batch endpoints refuse a mixed batch **whole** rather than posting part of it,
 * with the offending rows unnamed:
 *
 *   "One or more refunds are approval-gated; submit this batch for approval
 *    instead of posting it."
 *
 * The screen has the amounts the user typed, so it can name them itself. That is
 * the difference between "something in here is too big" and "rows 3 and 7 are".
 */
export function isBatchGateRefusal(error: unknown): boolean {
  const message = batchRefusalMessage(error);
  return !!message && /approval-gated/i.test(message);
}

function batchRefusalMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const action = (data as { action?: unknown }).action;
  if (typeof action === "string") return action;
  if (Array.isArray(action) && typeof action[0] === "string") return action[0];
  const detail = (data as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail : null;
}

/** Which rows of a batch would be gated, by the predicted rule. 1-based. */
export function gatedBatchRows(
  rule: GateRule,
  amounts: number[],
): { index: number; amount: number }[] {
  return amounts
    .map((amount, position) => ({ index: position + 1, amount }))
    .filter((row) => predictsApproval(rule, row.amount));
}
