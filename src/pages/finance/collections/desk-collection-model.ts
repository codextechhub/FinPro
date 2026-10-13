/**
 * The rules of collecting a payment at a branch desk.
 *
 * A bursar at the desk starts a checkout for a family, shows its QR code, and
 * the parent pays on their own phone. The collection is posted with origin
 * DESK so reports can tell the counter from the rest, and the screen reads it
 * back every few seconds until the provider says it is paid.
 *
 * Polling stops on the first of: the dialog closing, a final answer from the
 * server, or ten minutes passing. Failed and Abandoned are final answers but
 * not promises: the provider reports what it knew when asked, and a payer can
 * still finish on the same checkout, so those read "Not paid" with a way to
 * check again rather than a closed door.
 */

import type { Collection, CollectionStatus, InitiateCollectionPayload } from "@/redux/services/payments/payments-types";

/** How often the server is asked while the payer is paying. */
export const DESK_POLL_MS = 3000;

/** How long the screen keeps asking before it stops and offers to check again. */
export const DESK_POLL_LIMIT_MS = 10 * 60 * 1000;

export type DeskOutcome = "waiting" | "paid" | "not_paid" | "refunded";

/** What the screen says for a collection status. */
export function deskOutcome(status: CollectionStatus | undefined): DeskOutcome {
  if (status === "SUCCEEDED") return "paid";
  if (status === "REFUNDED") return "refunded";
  if (status === "FAILED" || status === "ABANDONED") return "not_paid";
  return "waiting";
}

/** Whether the server has given an answer that ends the wait, so polling can stop. */
export function deskIsFinal(status: CollectionStatus | undefined): boolean {
  return deskOutcome(status) !== "waiting";
}

/** Whether to keep asking: not final, and not past the time limit. */
export function deskShouldPoll(status: CollectionStatus | undefined, startedAt: number, now: number): boolean {
  return !deskIsFinal(status) && now - startedAt < DESK_POLL_LIMIT_MS;
}

/** Whether the screen has stopped asking without a final answer. */
export function deskTimedOut(status: CollectionStatus | undefined, startedAt: number, now: number): boolean {
  return !deskIsFinal(status) && now - startedAt >= DESK_POLL_LIMIT_MS;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An optional payer email is acceptable blank or well formed. */
export function deskEmailError(email: string): string | null {
  const value = email.trim();
  return !value || EMAIL.test(value) ? null : "Enter a valid email address, or leave it blank.";
}

/** The most that may be collected: the invoice's balance, or nothing in particular for a customer account. */
export function deskAmountError(amountKobo: number, balanceKobo: number | null): string | null {
  if (!(amountKobo > 0)) return "Enter an amount greater than zero.";
  if (balanceKobo !== null && amountKobo > balanceKobo) return "The amount cannot be more than the invoice balance.";
  return null;
}

/**
 * Whether the collection must name the bank account its money lands in.
 *
 * The server books a collection to its invoice's branch. With no invoice, a
 * customer filed under a branch decides it. A customer every branch shares, at
 * a school with several, decides nothing, so the account does: the bursar
 * picks one and the server refuses the request without it.
 */
export function deskNeedsDepositAccount(args: {
  invoiceId: number | null;
  customerBranchId: number | null | undefined;
  multiBranch: boolean;
}): boolean {
  return args.invoiceId === null && args.multiBranch && args.customerBranchId === null;
}

/** The request body for a desk collection. */
export function deskCollectionBody(args: {
  entity: string;
  amountKobo: number;
  email: string;
  customerCode: string;
  invoiceId: number | null;
  depositAccount: string;
  narration?: string;
}): InitiateCollectionPayload {
  const email = args.email.trim();
  return {
    entity: args.entity,
    amount: args.amountKobo,
    customer: args.customerCode,
    ...(args.invoiceId !== null ? { invoice: args.invoiceId } : {}),
    ...(args.depositAccount ? { deposit_account: args.depositAccount } : {}),
    ...(email ? { payer_email: email } : {}),
    ...(args.narration ? { narration: args.narration } : {}),
    origin: "DESK",
  };
}

/** The label of a collection's origin. */
export function originWord(origin: Collection["origin"]): string {
  return origin === "DESK" ? "Desk" : "Online";
}
