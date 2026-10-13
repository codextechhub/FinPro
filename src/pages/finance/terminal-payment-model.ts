/**
 * Payments made at a branch terminal, and how a person ties them to a customer.
 *
 * The provider reports the terminal, the amount, the payer's email and, for a
 * transfer, the sender's name and bank, and never the pupil. The money is
 * booked to the branch the moment it arrives, parked as unidentified receipts.
 * When exactly one customer of the branch has the payer's email it is applied
 * to them at once; otherwise it waits on the list with a note saying why and up
 * to five suggested customers, and a bursar matches it to a customer of the
 * same branch, which posts a receipt that settles that customer's oldest bills.
 * Undoing a match voids that receipt and puts the payment back on the list.
 */

import type { TerminalPayment, TerminalPaymentFilter, TerminalSuggestion } from "@/redux/services/payments/payments-types";
import type { Customer } from "@/redux/services/finance/ar-types";
import type { ListBranchView } from "./receivables/list-branch";

export const TERMINAL_FILTERS: readonly (readonly [TerminalPaymentFilter, string])[] = [
  ["UNMATCHED", "Unmatched"],
  ["MATCHED", "Matched"],
  ["ALL", "All"],
];

/** Whether a payment is waiting for a customer. Absent status (hidden by Field Access) reads as waiting only when nothing was matched. */
export function isUnmatched(payment: Pick<TerminalPayment, "status" | "matched_customer">): boolean {
  if (payment.status) return payment.status === "UNMATCHED";
  return payment.matched_customer == null;
}

/** Why a payment did not match by itself, in the server's words. */
export function unmatchedReason(payment: Pick<TerminalPayment, "match_note">): string {
  return payment.match_note?.trim() || "Not matched to a customer yet.";
}

/** Why a customer was suggested, in plain words. */
export function suggestionWords(reasons: TerminalSuggestion["reasons"]): string {
  const words: Record<TerminalSuggestion["reasons"][number], string> = {
    email: "Same email as the payer",
    name: "Name looks like the sender's",
    amount: "Owes exactly this amount",
  };
  return reasons.map((r) => words[r]).join(" · ");
}

/** The sender line: name and bank, whichever the provider gave. */
export function senderLine(payment: Pick<TerminalPayment, "sender_name" | "sender_bank">): string {
  return [payment.sender_name, payment.sender_bank].filter((v) => v && v.trim()).join(" · ");
}

/** Who matched a payment and how, for a matched row. */
export function matchedLine(payment: Pick<TerminalPayment, "match_method" | "matched_by_name" | "matched_customer_name" | "matched_customer_code">): string {
  const who = payment.matched_customer_name || payment.matched_customer_code || "a customer";
  if (payment.match_method === "AUTO") return `Matched to ${who} automatically, by the payer's email`;
  return payment.matched_by_name ? `Matched to ${who} by ${payment.matched_by_name}` : `Matched to ${who}`;
}

/**
 * The customers a payment may be matched to: those filed under its branch, and
 * those every branch shares. A payment's receipt settles only its own branch's
 * bills, so the server refuses any other; the picker leaves them out.
 */
export function customersForBranch(customers: readonly Customer[], branch: number | null | undefined): Customer[] {
  return customers.filter((c) => branch == null || c.branch_id == null || c.branch_id === branch);
}

/**
 * The branch view for this list. The shared list-branch rule can offer "No
 * branch yet", which a terminal payment never has (every one is booked to a
 * real branch), so that choice is dropped and an address naming it reads as
 * every branch.
 */
export function terminalBranchView(view: ListBranchView): ListBranchView {
  const selected = view.selected === "unassigned" ? "all" : view.selected;
  return { ...view, selected, offerUnassigned: false, showBranch: view.canChoose ? selected === "all" : view.showBranch };
}

/** The `?branch=` the list asks for. */
export function terminalBranchArg(view: ListBranchView): { branch?: number } {
  return view.canChoose && typeof view.selected === "number" ? { branch: view.selected } : {};
}
