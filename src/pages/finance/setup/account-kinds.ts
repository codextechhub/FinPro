import type { AccountKind } from "@/redux/services/finance/setup-types";
import { ACCOUNT_TYPES } from "@/utils/chart-of-accounts";

/**
 * The five kinds of account as a bursar asks for them. The wording is the
 * plain question ("what is this account for?") rather than the accounting
 * term, and the order puts the everyday kinds, money in and money out, first.
 */
export const KIND_CHOICES: ReadonlyArray<{ value: AccountKind; label: string; hint: string }> = [
  { value: "INCOME", label: "Money coming in", hint: "Fees, grants, donations and other money you receive." },
  { value: "EXPENSE", label: "Money going out", hint: "Salaries, utilities, repairs and other running costs." },
  { value: "ASSET", label: "Something we own", hint: "Cash, bank balances, equipment and money owed to us." },
  { value: "LIABILITY", label: "Something we owe", hint: "Loans, unpaid bills and money held for others." },
  { value: "EQUITY", label: "Owner's capital or reserves", hint: "Money put in by the owners or kept back as reserves." },
];

/** The plain label of a kind, or the raw value for a kind this screen does not know. */
export function kindLabel(kind: string): string {
  return KIND_CHOICES.find((choice) => choice.value === kind)?.label ?? kind;
}

/** The chart's group headings, in the order the chart reads. */
export const CHART_GROUP_HEADINGS: Record<AccountKind, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

/** Account kinds in chart order. */
export const KIND_ORDER: readonly AccountKind[] = ACCOUNT_TYPES;
