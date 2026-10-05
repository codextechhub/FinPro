/**
 * The rules behind the payer payment form, kept apart from React so they can be
 * tested on their own.
 *
 * Mr Okafor pays N500,000 into Ikeja's bank for Ada (Ikeja) and Emeka (Lekki).
 * The form previews the split before anything is saved and records exactly
 * what was previewed: the request a preview was made from is remembered, and a
 * change to any field makes that preview stale, so Record stays off until the
 * split on screen is the split that will be booked.
 *
 * The bursar may always type an amount per customer. Those amounts may come to
 * less than the payment (the rest goes where the school's surplus setting says)
 * but never to more, which the server refuses.
 */

import type { PayerPaymentInput, PayerPaymentSplit, PayerPlanShare } from "@/redux/services/finance/fees-types";

export interface PayerPaymentFormState {
  payer: string;
  bankAccount: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  narration: string;
  /** Empty means the school's own setting. */
  split: PayerPaymentSplit | "";
  /** Whether the bursar is typing an amount per customer. */
  manual: boolean;
  /** Kobo per customer code, used only when `manual`. */
  amounts: Record<string, number>;
}

export const emptyPayerPaymentForm = (): PayerPaymentFormState => ({
  payer: "", bankAccount: "", amount: 0, date: "", method: "BANK_TRANSFER",
  reference: "", narration: "", split: "", manual: false, amounts: {},
});

/** Whether the split in force asks the bursar for each customer's amount. */
export function needsManualAmounts(split: PayerPaymentSplit | "", policyDefault?: PayerPaymentSplit): boolean {
  return (split || policyDefault) === "AS_ENTERED";
}

/** The customers' typed amounts, positive ones only, in the order given. */
export function enteredShares(state: PayerPaymentFormState, codes: string[]) {
  return codes
    .map((code) => ({ customer: code, amount: state.amounts[code] ?? 0 }))
    .filter((share) => share.amount > 0);
}

/** What the typed amounts come to, and whether they fit inside the payment. */
export function manualTotals(state: PayerPaymentFormState, codes: string[]) {
  const entered = enteredShares(state, codes).reduce((sum, share) => sum + share.amount, 0);
  return { entered, left: state.amount - entered, fits: entered > 0 && entered <= state.amount };
}

/** The body for preview and record, or null while the form is not complete. */
export function payerPaymentInput(
  entity: string, state: PayerPaymentFormState, codes: string[],
): PayerPaymentInput | null {
  if (!state.payer || !state.bankAccount || state.amount <= 0 || !state.date) return null;
  const shares = state.manual ? enteredShares(state, codes) : [];
  if (state.manual && !manualTotals(state, codes).fits) return null;
  return {
    entity,
    payer: state.payer,
    bank_account: Number(state.bankAccount),
    amount: state.amount,
    payment_date: state.date,
    method: state.method,
    ...(state.reference.trim() ? { reference: state.reference.trim() } : {}),
    ...(state.narration.trim() ? { narration: state.narration.trim() } : {}),
    ...(state.manual ? { shares } : state.split ? { split: state.split } : {}),
  };
}

/** A stable key for a request, so a preview can be matched to the form it came from. */
export function inputKey(input: PayerPaymentInput | null): string {
  return input ? JSON.stringify(input) : "";
}

/** Each customer's total across the branches their shares sit at, to seed typed amounts. */
export function amountsFromPlan(shares: PayerPlanShare[]): Record<string, number> {
  const amounts: Record<string, number> = {};
  for (const share of shares) amounts[share.customer.code] = (amounts[share.customer.code] ?? 0) + share.amount;
  return amounts;
}
