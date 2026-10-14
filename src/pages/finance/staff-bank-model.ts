/**
 * Staff bank accounts for payroll paid through Paystack, in plain words.
 *
 * Nobody is paid into an account because somebody typed it. When a bank or an
 * account number is saved, Paystack is asked who holds the account:
 *
 * - the name matches the staff member: the account is **Checked**;
 * - the name does not match: the account **Needs a second person**, who is
 *   neither the one who made the change nor the staff member, to look at it and
 *   confirm it before a naira goes there;
 * - Paystack cannot find the account: **Could not check**;
 * - Paystack could not be reached: **Not checked yet**, to check again.
 *
 * Any change to the bank or the number starts the check over, so a checked
 * account cannot be pointed somewhere else and still be paid. Bola, the
 * bursar, types her cousin's number for Tunde Adeyemi: the bank names Bola
 * Okafor, the account needs a second person, and Mr Eze confirms it after
 * asking Tunde. Bola cannot confirm it herself, and nor can Tunde.
 */

import type { StaffBankAccount, StaffBankState } from "@/redux/services/finance/payroll-paystack-types";

export interface StaffBankWord {
  label: string;
  detail: string;
  /** Tailwind classes for the pill. */
  tone: string;
}

/** What each state reads, with a sentence saying what it means for payroll. */
export function staffBankWord(state: StaffBankState | undefined): StaffBankWord | null {
  switch (state) {
    case "VERIFIED":
      return { label: "Checked", detail: "Paystack named the account's holder and the name matches. Payroll can pay it.", tone: "bg-green-01/10 text-green-01" };
    case "CONFIRMED":
      return { label: "Checked", detail: "The holder's name did not match, and a second person confirmed the account. Payroll can pay it.", tone: "bg-green-01/10 text-green-01" };
    case "NEEDS_CONFIRMATION":
      return { label: "Needs a second person", detail: "The account holder's name does not match the staff member's. Nothing is paid to it until a second person confirms it.", tone: "bg-amber-50 text-amber-800" };
    case "FAILED":
      return { label: "Could not check", detail: "Paystack could not find this account. Correct the bank or the number.", tone: "bg-destructive/10 text-destructive" };
    case "UNVERIFIED":
      return { label: "Not checked yet", detail: "Paystack could not be reached, so the account was saved without a check. Check it again.", tone: "bg-gray-03/60 text-gray-05" };
    default:
      return null;
  }
}

/** The states a filter offers, as [value, label]; the value is what the list takes as `state`. */
export const STAFF_BANK_FILTERS: readonly (readonly [string, string])[] = [
  ["", "All accounts"],
  ["NEEDS_CONFIRMATION", "Needs a second person"],
  ["FAILED", "Could not check"],
  ["UNVERIFIED", "Not checked yet"],
  ["VERIFIED", "Checked"],
  ["CONFIRMED", "Confirmed by a second person"],
];

/** Whether Check again does anything: only an account not checked or that could not be found is asked again. */
export function offersCheckAgain(account: Pick<StaffBankAccount, "verification_state">): boolean {
  return account.verification_state === "UNVERIFIED" || account.verification_state === "FAILED";
}

/** Who is reading, for the rule that nobody confirms their own change. */
export interface Reader {
  id: number | string | null | undefined;
  /** The name the server shows for the reader: first and last name, else the email. */
  name: string;
}

/** The reader's display name the way the server words it. */
export function readerName(user: { first_name?: string; last_name?: string; email?: string } | null | undefined): string {
  const full = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return full || user?.email || "";
}

export interface ConfirmOffer {
  /** Show the Confirm button. */
  offered: boolean;
  /** Why a holder of the key is not offered it, in plain words; null otherwise. */
  hint: string | null;
}

/**
 * Whether Confirm is offered. It needs `finance.staff_bank.confirm`, an account
 * waiting for a second person, and a reader who is neither the staff member nor
 * the person who made the last change. The server refuses those two (403) in its
 * own words; the screen does not offer what it knows will be refused. The last
 * change is known by the name the server shows, so a reader whose name matches
 * it is treated as the person who made it.
 */
export function confirmOffer(account: StaffBankAccount, reader: Reader, mayConfirm: boolean): ConfirmOffer {
  if (!mayConfirm || account.verification_state !== "NEEDS_CONFIRMATION") return { offered: false, hint: null };
  if (reader.id != null && String(account.employee_id) === String(reader.id)) {
    return { offered: false, hint: "This is your own bank account. A second person confirms it." };
  }
  if (reader.name && account.changed_by_name && account.changed_by_name.trim().toLowerCase() === reader.name.trim().toLowerCase()) {
    return { offered: false, hint: "You made the last change to this account, so a second person confirms it." };
  }
  return { offered: true, hint: null };
}

/** An account number as ten digits with spaces removed; null when it is not ten digits. */
export function cleanAccountNumber(text: string): string | null {
  const digits = text.replace(/\s+/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

export interface BankForm {
  bankCode: string;
  bankName: string;
  accountNumber: string;
}

/** The form an existing account opens with. */
export function bankFormOf(account: Pick<StaffBankAccount, "bank_code" | "bank_name" | "account_number"> | null): BankForm {
  return { bankCode: account?.bank_code ?? "", bankName: account?.bank_name ?? "", accountNumber: account?.account_number ?? "" };
}

/** What is wrong with the form, in plain words, or null. */
export function bankFormProblem(form: BankForm): string | null {
  if (!form.bankCode) return "Choose the staff member's bank.";
  if (!cleanAccountNumber(form.accountNumber)) return "Enter the 10-digit account number.";
  return null;
}

/** The body that saves only what changed from the saved account; empty when nothing did. */
export function bankChanges(saved: Pick<StaffBankAccount, "bank_code" | "bank_name" | "account_number"> | null, form: BankForm): { bank_code?: string; bank_name?: string; account_number?: string } {
  const was = bankFormOf(saved);
  const number = cleanAccountNumber(form.accountNumber) ?? form.accountNumber.trim();
  const out: { bank_code?: string; bank_name?: string; account_number?: string } = {};
  if (form.bankCode !== was.bankCode) { out.bank_code = form.bankCode; out.bank_name = form.bankName; }
  else if (form.bankName && form.bankName !== was.bankName) out.bank_name = form.bankName;
  if (number !== was.accountNumber) out.account_number = number;
  return out;
}
