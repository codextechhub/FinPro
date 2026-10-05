/**
 * The rules a shared bank account split must meet before it is sent, checked
 * here so the bursar fixes them on the form rather than reading a refusal
 * (vs_finance.bank_splits.split_shared_bank_account checks them all again).
 *
 * A shared account is one no branch owns. Splitting it retires it and opens
 * one bank account per named branch, each with the share the branches agreed.
 * The shares must add up exactly to the shared account's book balance, so no
 * naira appears or disappears in the cutover.
 *
 * Where a branch's own entries on the shared account come to more or less than
 * its agreed share, the difference is treated as the person splitting chooses:
 * a debt between branches (the default, booked as inter-branch transfers that
 * show on the pair balances) or a permanent move through retained earnings.
 */

import type { BankSplitDifferenceTreatment } from "@/redux/services/finance/interbranch-types";

export interface SplitRow {
  branch: string;
  opening_balance: number;
  bank_account_name: string;
  ledger_account_code: string;
  ledger_account_name: string;
  is_primary: boolean;
  is_primary_collection: boolean;
}

export const DIFFERENCE_TREATMENTS: readonly { value: BankSplitDifferenceTreatment; label: string; help: string }[] = [
  {
    value: "DEBT",
    label: "Debt between branches",
    help: "A branch that kept more of the shared cash than its share owes the branch that kept less. Each difference shows on the inter-branch balances and is repaid with a cash transfer.",
  },
  {
    value: "PERMANENT_MOVE",
    label: "Permanent move through retained earnings",
    help: "Each branch simply starts with its agreed share. The difference becomes a lasting shift of equity between the branches, and nothing is owed.",
  },
];

/** The agreed total and what is left to place against the book balance. */
export function splitTotals(bookBalance: number, rows: Pick<SplitRow, "opening_balance">[]) {
  const agreed = rows.reduce((sum, row) => sum + (row.opening_balance || 0), 0);
  return { agreed, remaining: bookBalance - agreed, balanced: agreed === bookBalance };
}

/**
 * Everything on the form the server would refuse, in plain words. Empty when
 * the split may be sent. `ledgerPrefix` is the first digit of the shared
 * account's ledger code: a successor ledger must be the same kind of account.
 */
export function splitProblems({ rows, bookBalance, ledgerPrefix, agreementReference, splitDate }: {
  rows: SplitRow[];
  bookBalance: number;
  ledgerPrefix: string;
  agreementReference: string;
  splitDate: string;
}): string[] {
  const problems: string[] = [];
  if (!splitDate) problems.push("Give the split date.");
  if (!agreementReference.trim()) problems.push("Give the reference of the bursars' agreement on these shares.");
  if (rows.length < 2) problems.push("Split into at least two branches.");
  if (rows.some((row) => !row.branch)) problems.push("Choose the branch for every share.");
  const branches = rows.map((row) => row.branch).filter(Boolean);
  if (new Set(branches).size !== branches.length) problems.push("Name each branch once.");
  if (rows.some((row) => !row.bank_account_name.trim())) problems.push("Name every new bank account.");
  if (rows.some((row) => !row.ledger_account_name.trim())) problems.push("Name every new ledger account.");
  const names = rows.map((row) => row.bank_account_name.trim()).filter(Boolean);
  if (new Set(names).size !== names.length) problems.push("Each new bank account needs its own name.");
  const ledgerNames = rows.map((row) => row.ledger_account_name.trim()).filter(Boolean);
  if (new Set(ledgerNames).size !== ledgerNames.length) problems.push("Each new ledger account needs its own name.");
  if (rows.some((row) => !/^[0-9]{4}$/.test(row.ledger_account_code))) {
    problems.push("Every new ledger code is four digits.");
  } else if (ledgerPrefix && rows.some((row) => !row.ledger_account_code.startsWith(ledgerPrefix))) {
    problems.push(`Every new ledger code starts with ${ledgerPrefix}, like the shared account's own.`);
  }
  const codes = rows.map((row) => row.ledger_account_code);
  if (new Set(codes).size !== codes.length) problems.push("Each new ledger code is different.");
  if (rows.filter((row) => row.is_primary).length > 1) problems.push("Only one new account can be the main account.");
  const { balanced } = splitTotals(bookBalance, rows);
  if (!balanced) problems.push("The shares must add up exactly to the account's book balance.");
  return problems;
}
