/**
 * Field Access for the bank account master (`finance.bankaccount`).
 *
 * An account's name carries no switch. The bank, currency, ledger account and
 * the active, main and collection flags are typed in, each under its own
 * switch; the balances, the reconciliation progress, the recent ledger activity
 * and the provider subaccount are worked out and read-only. The difference
 * between the books and the statement is worked out from both balances, so it
 * is readable only when both are: with either hidden the other could be
 * recovered from it.
 */

import type { FieldAccess } from "@/components/finance-ui";

/** The `module.resource` key the bank account fields are registered under. */
export const BANK_ACCOUNT = "finance.bankaccount";

/** Which of an account's three balance figures a role may see. */
export function bankBalances(access: FieldAccess): { book: boolean; statement: boolean; difference: boolean } {
  const book = !access.isHidden("book_balance");
  const statement = !access.isHidden("statement_balance");
  return { book, statement, difference: book && statement && !access.isHidden("difference") };
}

/** A grid class for `count` summary cards in one row from `sm` up (phones stack them). */
export function cardColumns(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

/**
 * An option of the primary collection account picker: the account's name, with
 * its bank and currency only where the role may read them (both are
 * `finance.bankaccount` fields and leave the summary when hidden).
 */
export function bankOptionLabel(bank: { name: string; bank_name?: string; currency?: string }): string {
  return [bank.name, bank.bank_name, bank.currency].filter(Boolean).join(" · ");
}
