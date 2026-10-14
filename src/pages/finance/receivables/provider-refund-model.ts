/**
 * Refunds returned to the payer through the payment provider: when they are
 * offered, what their state reads, and which payment a refund may return.
 *
 * A refund raised with the method Online is tied to the confirmed online
 * payment it returns. Posting it reserves the branch's held money and asks the
 * provider; the books record it only when the provider confirms, so a refund
 * can wait for a while after posting. A failed one is a draft again, to send
 * again or to pay from the branch's bank.
 *
 * Only a school whose online money the platform holds (custody HELD) can refund
 * this way: at DIRECT the money is already in the branch's bank, so the option
 * is not shown there. A reader who cannot read the custody mode (it opens to
 * the payment settings, payouts, refunds and desk collection keys) is not
 * offered it either, rather than offered something the server may refuse.
 */

import type { CustodyReading } from "@/components/finance-ui/held-custody";
import type { Collection, ProviderRefund, ProviderRefundStatus } from "@/redux/services/payments/payments-types";

/** The finance refund's method for one returned through the provider. */
export const ONLINE_REFUND_METHOD = "ONLINE";

/** The method a refund paid from the bank is raised with. */
export const BANK_REFUND_METHOD = "BANK_TRANSFER";

export interface ProviderRefundWord {
  label: string;
  detail: string;
  /** Tailwind classes for the pill. */
  tone: string;
}

/** What each provider-refund state reads; `provider` is the provider's display name. */
export function providerRefundWord(status: ProviderRefundStatus | undefined, provider: string): ProviderRefundWord {
  switch (status) {
    case "LINKED":
      return { label: "Tied to a payment", detail: `Not sent yet. It goes to ${provider} when the refund is posted.`, tone: "bg-amber-50 text-amber-700" };
    case "PROCESSING":
      return { label: "Processing", detail: `${provider} is returning the money to the payer. This can take a while.`, tone: "bg-blue-50 text-blue-700" };
    case "PROCESSED":
      return { label: "Returned", detail: "The money has gone back to the payer.", tone: "bg-green-01/10 text-green-01" };
    case "FAILED":
      return { label: "Failed", detail: `${provider} could not return the money. The refund is a draft again.`, tone: "bg-destructive/10 text-destructive" };
    case "CANCELLED":
      return { label: "Dropped", detail: "This was dropped before it was sent.", tone: "bg-gray-03/60 text-gray-05" };
    default:
      return { label: "Online refund", detail: "", tone: "bg-gray-03/60 text-gray-05" };
  }
}

/**
 * The refund's live tie among its rows (newest first): the first one not
 * dropped. A dropped tie is history, and a newer tie always supersedes it.
 */
export function currentProviderRefund(rows: readonly ProviderRefund[] | undefined): ProviderRefund | null {
  return rows?.find((row) => row.status !== "CANCELLED") ?? null;
}

/** The current tie of each refund in a page of ties, by finance refund id. */
export function providerRefundsByRefund(rows: readonly ProviderRefund[] | undefined): Map<number, ProviderRefund> {
  const byRefund = new Map<number, ProviderRefund>();
  for (const row of rows ?? []) {
    if (row.status !== "CANCELLED" && !byRefund.has(row.refund_id)) byRefund.set(row.refund_id, row);
  }
  return byRefund;
}

/** Whether a refund can be raised to return an online payment: held custody, the key, a writable payment field. */
export function onlineRefundOffered(args: { custody: CustodyReading; mayCreate: boolean; paymentWritable: boolean }): boolean {
  return args.custody === "HELD" && args.mayCreate && args.paymentWritable;
}

/** Whether a failed tie offers Try again: the provider failed it and the refund is a draft again. */
export function offersTryAgain(link: Pick<ProviderRefund, "status" | "refund_status">, refundMethod: string | undefined): boolean {
  return link.status === "FAILED" && link.refund_status === "DRAFT" && refundMethod === ONLINE_REFUND_METHOD;
}

/** Whether Pay from bank instead is offered: not sent yet, or failed, on a draft still raised as online. */
export function offersPayFromBank(link: Pick<ProviderRefund, "status" | "refund_status">, refundMethod: string | undefined): boolean {
  return (link.status === "LINKED" || link.status === "FAILED")
    && link.refund_status === "DRAFT" && refundMethod === ONLINE_REFUND_METHOD;
}

/** Whether a draft online refund still needs its payment chosen. */
export function needsPayment(link: ProviderRefund | null, refundMethod: string | undefined, refundStatus: string): boolean {
  return refundMethod === ONLINE_REFUND_METHOD && refundStatus === "DRAFT" && (link === null || link.status === "FAILED");
}

/**
 * The paid online payments a refund for this customer may return: confirmed
 * payments of the customer, at the refund's branch when it has one. Newest first
 * as the server lists them.
 */
export function returnablePayments(
  payments: readonly Collection[] | undefined,
  args: { customerCode: string; branch: number | null | undefined },
): Collection[] {
  return (payments ?? []).filter((p) =>
    p.status === "SUCCEEDED"
    && p.customer_code === args.customerCode
    && (args.branch == null || p.branch == null || p.branch === args.branch));
}

/** What is wrong with a refund amount against the payment it returns, or null. */
export function paymentAmountError(amountKobo: number, payment: Pick<Collection, "amount"> | null): string | null {
  if (!payment || !(amountKobo > 0)) return null;
  return amountKobo > payment.amount ? "The refund is more than the payment it returns." : null;
}

/** What the picker holds: a payment's id from the list, or a reference typed by hand. */
export interface OnlineRefundChoice {
  online: boolean;
  /** The payment id (a number as text) or the reference typed in; blank until chosen. */
  collection: string;
  /** The listed payment chosen, when it was picked rather than typed. */
  payment: Collection | null;
}

export const NO_ONLINE_REFUND: OnlineRefundChoice = { online: false, collection: "", payment: null };

/** Whether the refund form is complete as far as the way it is paid goes. */
export function paymentChoiceReady(choice: OnlineRefundChoice, bankAccount: string): boolean {
  return choice.online ? choice.collection.trim() !== "" : bankAccount !== "";
}
