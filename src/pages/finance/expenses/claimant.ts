/**
 * Who an expense claim reimburses.
 *
 * The claimant is picked from the staff list the host supplies (`useDirectory`)
 * by default, and the claim is then tied to that person's account: Ngozi
 * records Tolu Fashola's claim for lab chemicals by choosing Tolu, and the
 * server copies Tolu's name onto the claim. Somebody who is not on the staff
 * list, such as Mrs Okafor from the PTA, is recorded by choosing "Not on the
 * staff list" and typing the name. A claim with no linked person reads as a
 * typed name wherever it is shown, which also covers every claim raised before
 * the staff list was offered.
 *
 * The person and the name are one Field Access switch on the server
 * (`finance.expenseclaim`, response names `claimant_id` and `claimant_name`,
 * body key `claimant` following them). A reader who may not read it sees no
 * claimant anywhere; one who may read and not change it sees it and is not
 * offered the New claim form, because a claim cannot be raised without one.
 */

import { allWritable, writableOnlyFollowing, type FieldAccess, type WriteFollows } from "@/components/finance-ui";
import type { ExpenseClaim } from "@/redux/services/finance/ops-types";

/** The Field Access resource of an expense claim. */
export const EXPENSE_CLAIM = "finance.expenseclaim";

/** The body key that picks the person, beside the response name carrying its switch. */
export const CLAIM_FOLLOWS: WriteFollows = { claimant: "claimant_name" };

/** The claimant a New claim form holds: a member of staff, or a typed name. */
export type ClaimantChoice =
  | { kind: "staff"; id: string }
  | { kind: "typed"; name: string };

export const NO_CLAIMANT: ClaimantChoice = { kind: "staff", id: "" };

/** Whether the choice names somebody, so the claim may be saved. */
export function claimantReady(choice: ClaimantChoice): boolean {
  return choice.kind === "staff" ? choice.id !== "" : choice.name.trim() !== "";
}

/**
 * The claimant part of a create body: the person's account as `claimant`, or
 * the typed name as `claimant_name`, never both, and nothing the reader may
 * not write.
 */
export function claimantBody(choice: ClaimantChoice, access: FieldAccess): { claimant?: number; claimant_name?: string } {
  const body = choice.kind === "staff"
    ? (choice.id ? { claimant: Number(choice.id) } : {})
    : { claimant_name: choice.name.trim() };
  return writableOnlyFollowing(access, body, CLAIM_FOLLOWS, { creating: true });
}

/** Whether the reader may give a new claim its claimant, without which no claim can be raised. */
export function canNameClaimant(access: FieldAccess): boolean {
  return allWritable(access, ["claimant", "claimant_name"], CLAIM_FOLLOWS, { creating: true });
}

/**
 * The claimant as a claim shows it, or null when the reader may not read it.
 * `typed` is true for a name not tied to anybody on the staff list.
 */
export function claimantShown(claim: Pick<ExpenseClaim, "claimant_id" | "claimant_name">): { name: string; typed: boolean } | null {
  if (claim.claimant_name === undefined) return null;
  return { name: claim.claimant_name || "-", typed: claim.claimant_id == null };
}

/**
 * The words a typed claimant carries beside its name. "Typed name" rather than
 * "not staff": every claim raised before the staff list was offered is typed,
 * a member of staff's included, and the tag must stay true of those.
 */
export const TYPED_CLAIMANT = "Typed name";
