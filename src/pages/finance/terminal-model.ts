/**
 * Branch payment terminals: how their state reads, what the provider said
 * about paying at one, and the rules for the numbers each one notifies.
 *
 * Every branch has its own payment terminal at the provider, opened for it
 * automatically. A parent pays at it from a link, a code or a transfer, and the
 * money is booked to the branch at once; which pupil it is for is matched
 * afterwards (see terminal-payment-model.ts). A terminal needs at least one
 * WhatsApp number to notify, the branch's own phone being the first, and keeps
 * at most five. A branch with no phone waits for a number before anything is
 * opened.
 *
 * What the provider returns about how to pay is not fixed: a payment page link,
 * a code image, a poster, a list of payment methods, in whichever names it
 * used. Everything here reads it defensively and shows only what is there.
 */

import type { TerminalPaymentDetails, TerminalStatus, VirtualTerminal } from "@/redux/services/payments/payments-types";

/** The most numbers a terminal keeps. */
export const MAX_TERMINAL_NUMBERS = 5;

export interface TerminalWord {
  label: string;
  detail: string;
  /** Tailwind classes for the pill. */
  tone: string;
}

/** How each terminal state reads, in plain words. */
export function terminalWord(status: TerminalStatus | undefined): TerminalWord {
  switch (status) {
    case "ACTIVE":
      return { label: "Open", detail: "Parents can pay at this terminal.", tone: "bg-green-01/10 text-green-01" };
    case "NEEDS_NUMBER":
      return { label: "Waiting for a phone number", detail: "Add a WhatsApp number below and the terminal opens by itself.", tone: "bg-amber-50 text-amber-700" };
    case "PENDING":
      return { label: "Being set up", detail: "The payment provider is opening it. This usually takes a moment.", tone: "bg-blue-50 text-blue-700" };
    case "FAILED":
      return { label: "Failed", detail: "The payment provider could not open it.", tone: "bg-destructive/10 text-destructive" };
    case "DEACTIVATED":
      return { label: "Switched off", detail: "This terminal was switched off at the provider and cannot be turned back on.", tone: "bg-gray-03/60 text-gray-05" };
    default:
      return { label: "Unknown", detail: "", tone: "bg-gray-03/60 text-gray-05" };
  }
}

/** What the retry button says, or null when a retry would do nothing. */
export function retryLabel(status: TerminalStatus | undefined): string | null {
  if (status === "FAILED") return "Try again";
  if (status === "PENDING") return "Try again";
  if (status === "ACTIVE") return "Refresh details";
  return null;
}

/** Where the terminal's money goes, in words. Null where the field is hidden. */
export function routeWords(routedToBranchBank: boolean | undefined): string | null {
  if (routedToBranchBank === undefined) return null;
  return routedToBranchBank
    ? "Paid straight into the branch's bank."
    : "Held for the branch, then paid into its bank.";
}

const WEB_URL = /^https?:\/\//i;

/** The first value that is a web address. */
function firstUrl(...candidates: (string | undefined)[]): string | null {
  return candidates.find((c): c is string => typeof c === "string" && WEB_URL.test(c.trim()))?.trim() ?? null;
}

/** The terminal's payment page, whichever name the provider gave it. */
export function paymentPageLink(details: TerminalPaymentDetails | undefined): string | null {
  return details ? firstUrl(details.payment_url, details.payment_link, details.link) : null;
}

/** An image of the terminal's code, when the provider sent one as an address or inline image. */
export function codeImage(details: TerminalPaymentDetails | undefined): string | null {
  if (!details) return null;
  const inline = [details.qr_code_url, details.qr_code].find((c): c is string => typeof c === "string" && /^data:image\//i.test(c));
  return inline ?? firstUrl(details.qr_code_url, details.qr_code);
}

/** The poster the provider offers for the wall, when it sent one. */
export function posterLink(details: TerminalPaymentDetails | undefined): string | null {
  return details ? firstUrl(details.poster_url) : null;
}

/** One payment method as a line: text as sent, or the readable values of an object. */
export function describeMethod(method: unknown): string | null {
  if (typeof method === "string") return method.trim() || null;
  if (!method || typeof method !== "object") return null;
  const parts = Object.entries(method as Record<string, unknown>)
    .filter(([, value]) => (typeof value === "string" || typeof value === "number") && String(value).trim() !== "")
    .map(([key, value]) => (key === "type" || key === "name" || key === "bank" ? String(value) : `${key.replace(/_/g, " ")}: ${value}`));
  return parts.length ? parts.join(" · ") : null;
}

/** The payment methods the provider listed, as readable lines. */
export function methodLines(details: TerminalPaymentDetails | undefined): string[] {
  const list = details?.paymentMethods ?? details?.payment_methods;
  return Array.isArray(list) ? list.flatMap((m) => describeMethod(m) ?? []) : [];
}

/** Whether the provider sent anything about how to pay. */
export function hasPaymentDetails(details: TerminalPaymentDetails | undefined): boolean {
  return !!(paymentPageLink(details) || codeImage(details) || posterLink(details) || methodLines(details).length);
}

/** Whether another number can be added. */
export function mayAddNumber(count: number): boolean {
  return count < MAX_TERMINAL_NUMBERS;
}

/** Whether a number can be removed: the last one is kept, because the provider needs one. */
export function mayRemoveNumber(count: number): boolean {
  return count > 1;
}

/** What is wrong with a number being added, or null. The server checks the format itself. */
export function numberError(name: string, number: string): string | null {
  if (!name.trim()) return "Enter the person's name.";
  if (!/^\+?[\d\s()-]{7,20}$/.test(number.trim())) return "Enter the number with its country code, or a Nigerian number starting with 0.";
  return null;
}

/** The terminals sorted for display: branch name, then oldest first. */
export function terminalsInOrder(rows: readonly VirtualTerminal[]): VirtualTerminal[] {
  return [...rows].sort((a, b) => a.branch_name.localeCompare(b.branch_name) || a.id - b.id);
}
