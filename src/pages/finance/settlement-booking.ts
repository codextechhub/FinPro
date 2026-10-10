/**
 * Booking a bank line as the provider's settlement of online payments.
 *
 * A confirmed online payment is booked to gateway clearing: the provider holds
 * the money. When the provider pays a day's payments on to the bank, less its
 * fees, the bank line is booked as their settlement in one journal, in the
 * bank account's branch:
 *
 *     Dr bank (what arrived)   Dr bank charges (the fee)   Cr gateway clearing (the payments)
 *
 * Bright Star's Ikeja account shows N985,000 from Paystack; it carries
 * N1,000,000 of Tuesday's payments, so the fee is N15,000.
 *
 * The server refuses a booking the figures cannot explain, and the form says so
 * before it is sent rather than leaving the reader to meet the refusal:
 *
 * - the line brings more than the payments named (a negative fee);
 * - every payment has a fee the provider reported, and those fees do not add
 *   up to the shortfall (the line carries other payments too, or not all of
 *   these);
 * - the line is dated before a payment it claims to settle (money cannot leave
 *   clearing before it entered it).
 *
 * The server also checks that each payment is still waiting in clearing,
 * belongs to the bank account's branch, and was not held by the platform. The
 * branch is checked here first: both the line and each payment name their
 * branch, so the dialog offers only the payments of the line's own branch
 * (`paymentsForLine`). Anything else is the server's refusal, shown as it words
 * it.
 */

import { calendarDayOf } from "../../utils/dates";
import { formatMoney } from "../../utils/money";
import type { SettlementRow, UnmatchedBankLine } from "@/redux/services/payments/payments-types";

/**
 * The account a confirmed online payment waits in, as an accountant screen names
 * it: the account's name and what it holds in plain words, the same pair the
 * books' own chart of accounts carries.
 */
export const GATEWAY_CLEARING_NAME = "Gateway clearing";

export interface SettlementFigures {
  gross: number;
  fee: number;
  net: number;
}

/** What the journal would book for this line and these payments. */
export function settlementFigures(line: Pick<UnmatchedBankLine, "amount">, payments: readonly Pick<SettlementRow, "amount">[]): SettlementFigures {
  const gross = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const net = line.amount;
  return { gross, net, fee: gross - net };
}

/**
 * Why this booking would be refused, or null when the figures explain it.
 * `timeZone` is the school's, which decides the day a payment was confirmed.
 * `postingDate`, when the reader sets one, is the day the journal lands instead
 * of the line's own date.
 */
export function settlementProblem(
  line: Pick<UnmatchedBankLine, "amount" | "txn_date">,
  payments: readonly Pick<SettlementRow, "amount" | "reported_fee" | "confirmed_at" | "reference">[],
  timeZone: string,
  postingDate?: string,
): string | null {
  if (line.amount <= 0) return "Only money arriving in the bank can settle online payments.";
  if (!payments.length) return "Pick the payments this line settles.";
  const { gross, fee } = settlementFigures(line, payments);
  if (fee < 0) return "The line brings more than the payments picked. Pick the rest of the payments it carries.";
  const reported = payments.map((p) => p.reported_fee);
  if (reported.every((f) => f !== null && f !== undefined)) {
    const total = reported.reduce<number>((sum, f) => sum + (f ?? 0), 0);
    if (total !== fee) {
      return `The line is ${formatMoney(fee)} short of the ${formatMoney(gross)} picked, but the provider's fees on them come to ${formatMoney(total)}. It carries other payments too, or not all of these.`;
    }
  }
  const booked = postingDate || line.txn_date;
  const late = payments.find((p) => {
    const day = calendarDayOf(p.confirmed_at, timeZone);
    return day !== null && day > booked;
  });
  if (late) {
    return postingDate
      ? `The settlement would be booked before payment ${late.reference} was received.`
      : `The line is dated before payment ${late.reference} was received.`;
  }
  return null;
}

/**
 * The payments a bank line may settle: those of the line's own branch, since a
 * settlement books in its bank account's branch. Ikeja's GTBank line is offered
 * Ikeja's payments, never Lekki's. A line or a payment that does not name its
 * branch (an older server) leaves the list as it is.
 */
export function paymentsForLine<T extends Pick<SettlementRow, "branch_id">>(
  line: Pick<UnmatchedBankLine, "branch_id">, payments: readonly T[],
): T[] {
  if (line.branch_id == null) return [...payments];
  return payments.filter((p) => p.branch_id === undefined || p.branch_id === line.branch_id);
}

/** The waiting payments a line could settle: confirmed collections still in clearing. */
export function waitingPayments(rows: readonly SettlementRow[]): SettlementRow[] {
  return rows.filter((r) => r.kind === "COLLECTION" && !r.settled && r.via_clearing !== false);
}
