/**
 * What a reader may do to an inter-branch transfer, and what it means, as the
 * backend decides it (vs_finance views_ops/interbranch.py and inter_branch.py).
 *
 * Each action belongs to one side:
 *
 * - **Send** and **Decline** meet or refuse a request, and belong to the branch
 *   that was asked (the sending branch). Only a request still waiting can be
 *   sent or declined. Nothing was booked yet, so a decline reverses nothing.
 *   A send an approver sent back is offered neither: whoever sent it resumes
 *   it as it is, or withdraws it from their approvals to change it.
 * - **Confirm arrival** belongs to the receiving branch, for money only (cash
 *   and forwarded receipts), once it is sent and not yet confirmed.
 * - **Void** reverses both branches' books, so it needs somebody who works in
 *   both. Goods, a shared bank split's difference, a recharge's share and income
 *   given back are never voided here; each says what to do instead.
 *
 * Mrs Adeyemi works only at Lekki. Ikeja's request to Lekki offers her Send and
 * Decline; Ikeja's money sent to Lekki offers her Confirm arrival; nothing she
 * can see offers her Void, because every transfer has a second branch she does
 * not work in. Mrs Bello covers the whole school and is offered all of them.
 */

import type { InterBranchKind, InterBranchStage, InterBranchTransfer } from "@/redux/services/finance/interbranch-types";
import { financeReturnedFacts } from "@/components/finance-ui/returned-correction";

/** The reach question the host answers (`useReaderReach`). */
export interface TransferReach {
  covers(ids: number[]): boolean;
}

/** The inter-branch keys the reader holds. */
export interface TransferKeys {
  transfer: boolean;
  confirm: boolean;
  reverse: boolean;
}

export type TransferAction = "send" | "decline" | "confirm" | "void";

/** The kinds that move money between two banks. */
export const MONEY_KINDS: readonly InterBranchKind[] = ["CASH", "FORWARDED_RECEIPT"];

/** Whether a transfer is a request still waiting for the asked branch. */
export function isOpenRequest(t: Pick<InterBranchTransfer, "kind" | "status" | "requested_at">): boolean {
  return t.kind === "CASH" && t.status === "DRAFT" && !!t.requested_at;
}

/**
 * Why a posted transfer of this kind is never voided from the register, or
 * null when it may be. The words follow the backend's own refusals.
 */
export function voidBlockedByKind(t: Pick<InterBranchTransfer, "kind" | "reference">): string | null {
  switch (t.kind) {
    case "GOODS":
      return "Goods are not voided. Send them back with a stock transfer the other way.";
    case "BANK_SPLIT":
      return "This difference was agreed when a shared bank account was split, and that account is retired. It is never voided: settle it with a cash transfer the other way.";
    case "RECHARGE":
      return "This is one branch's share of a recharge. Void the recharge instead, which voids every share together.";
    case "INCOME_GIVEN_BACK":
      return `This is voided only with the document that gave the income back${t.reference ? ` (${t.reference})` : ""}. Void that document instead.`;
    default:
      return null;
  }
}

/** The actions this reader is offered on `t`. */
export function transferActions(
  t: InterBranchTransfer,
  keys: TransferKeys,
  reach: TransferReach,
): TransferAction[] {
  const actions: TransferAction[] = [];
  if (isOpenRequest(t) && !financeReturnedFacts(t)?.approval_returned && keys.transfer && reach.covers([t.branch_id])) {
    actions.push("send", "decline");
  }
  if (
    MONEY_KINDS.includes(t.kind) && t.status === "POSTED" && !t.received_at
    && keys.confirm && reach.covers([t.to_branch_id])
  ) {
    actions.push("confirm");
  }
  if (
    t.status === "POSTED" && voidBlockedByKind(t) === null && keys.reverse
    && reach.covers([t.branch_id, t.to_branch_id])
  ) {
    actions.push("void");
  }
  return actions;
}

/**
 * Why the reader is not offered Void on a posted transfer that can be voided,
 * or null. Shown in the detail so a branch-bound bursar learns who can.
 */
export function voidReachNote(
  t: InterBranchTransfer,
  keys: TransferKeys,
  reach: TransferReach,
): string | null {
  if (t.status !== "POSTED" || voidBlockedByKind(t) !== null || !keys.reverse) return null;
  if (reach.covers([t.branch_id, t.to_branch_id])) return null;
  return `Voiding changes both ${t.branch_name}'s and ${t.to_branch_name}'s books, so it needs somebody who works in both.`;
}

/** What voiding this transfer is refused for, said before the reader tries. */
export function voidConditions(t: Pick<InterBranchTransfer, "kind" | "to_branch_name">): string {
  if (t.kind === "RECEIVABLE") {
    return `Everything moved goes back to the branch it came from. Refused once anything moved has been paid, credited or released at ${t.to_branch_name}; move the balance back with another move instead.`;
  }
  if (MONEY_KINDS.includes(t.kind)) {
    return "Both branches' journals are reversed. Refused while either bank side is matched on a reconciliation: unmatch it there first.";
  }
  return "Both branches' journals are reversed.";
}

const STAGE_WORDS: Record<InterBranchStage, string> = {
  REQUESTED: "Requested",
  PENDING_APPROVAL: "Waiting for approval",
  SENT: "Sent",
  RECEIVED: "Arrived",
  DECLINED: "Declined",
  NOT_SENT: "Not sent",
  VOIDED: "Voided",
};

/** The stage in plain words. A kind that moves no money reads "Booked" once posted. */
export function stageLabel(t: Pick<InterBranchTransfer, "kind" | "stage">): string {
  if (t.stage === "SENT" && !MONEY_KINDS.includes(t.kind)) return "Booked";
  if (t.stage === "SENT") return "Sent, not yet confirmed";
  return STAGE_WORDS[t.stage] ?? t.stage;
}

/** Pill tone for a stage. */
export function stageTone(t: Pick<InterBranchTransfer, "kind" | "stage">): "good" | "waiting" | "closed" {
  if (t.stage === "RECEIVED" || (t.stage === "SENT" && !MONEY_KINDS.includes(t.kind))) return "good";
  if (t.stage === "DECLINED" || t.stage === "NOT_SENT" || t.stage === "VOIDED") return "closed";
  return "waiting";
}

/**
 * One sentence on what the transfer leaves between the two branches.
 * `money` formats kobo in the school's currency.
 */
export function transferMeaning(
  t: Pick<InterBranchTransfer, "kind" | "branch_name" | "to_branch_name" | "amount" | "customer_name">,
  money: (kobo: number) => string,
): string {
  const from = t.branch_name;
  const to = t.to_branch_name;
  const amount = money(t.amount);
  switch (t.kind) {
    case "CASH":
      return `${from} sends ${amount} to ${to}, and ${to} owes ${from} until it is repaid.`;
    case "FORWARDED_RECEIPT":
      return `${from} passes on ${amount} it collected for ${to}${t.customer_name ? ` from ${t.customer_name}` : ""}. It settles the bills at ${to}, and nothing is owed.`;
    case "RECEIVABLE":
      return `${t.customer_name ?? "A customer"}'s open balance moved from ${from} to ${to}. Income ${from} already earned stays there, and ${to} owes it for that.`;
    case "RECHARGE":
      return `${to}'s share of a cost ${from} paid: ${to} owes ${from} ${amount}.`;
    case "GOODS":
      return `Stock worth ${amount} moved from ${from}'s store to ${to}'s, and ${to} owes ${from} for it.`;
    case "INCOME_GIVEN_BACK":
      return `${from} took back ${amount} of income ${to} had booked on a moved bill, so what ${from} owes ${to} drops by that much.`;
    case "BANK_SPLIT":
      return `When a shared bank account was split, ${to} kept ${amount} of ${from}'s cash, and owes it.`;
    default:
      return `${from} to ${to}: ${amount}.`;
  }
}

/**
 * What a transfer whose send was never approved leaves the reader to do, or
 * null for any other stage. Its approval was rejected, withdrawn or cancelled,
 * and nothing was booked: a forwarded receipt is held again, to forward or
 * void; money is sent again as a new transfer.
 */
export function notSentNote(t: Pick<InterBranchTransfer, "kind" | "stage" | "branch_name" | "to_branch_name">): string | null {
  if (t.stage !== "NOT_SENT") return null;
  if (t.kind === "FORWARDED_RECEIPT") {
    return `Not sent: its approval ended without approving it, and nothing was booked. ${t.branch_name} holds the receipt again, to forward to ${t.to_branch_name} or void.`;
  }
  return `Not sent: its approval ended without approving it, and nothing was booked. To send the money, make a new transfer.`;
}

/** What each kind is called on screen. */
export const KIND_LABELS: Record<InterBranchKind, string> = {
  CASH: "Money",
  FORWARDED_RECEIPT: "Forwarded receipt",
  RECEIVABLE: "Customer balance moved",
  RECHARGE: "Recharge share",
  GOODS: "Stock",
  INCOME_GIVEN_BACK: "Income given back",
  BANK_SPLIT: "Shared bank split",
};

/**
 * The register's stage filter, as the list endpoint's `status` values. A send
 * an approver sent back is a DRAFT, so the filter that lists requests lists it
 * too, under the word its row wears as well.
 */
export const STATUS_FILTERS: readonly (readonly [string, string])[] = [
  ["", "Any stage"],
  ["DRAFT", "Requested or sent back"],
  ["PENDING_APPROVAL", "Waiting for approval"],
  ["POSTED", "Sent or booked"],
  ["CANCELLED", "Declined or not sent"],
  ["REVERSED", "Voided"],
];
