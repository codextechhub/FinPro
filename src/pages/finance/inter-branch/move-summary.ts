/**
 * What a receivable move carried and what it left owing between two branches,
 * from the move's response.
 *
 * The response sends the net balance that moved (`amount`: open bills less the
 * credit that went with them) beside the credit and the unearned income. The
 * old branch's journal (vs_finance.inter_branch._post_receivable_pair) books the
 * inter-branch line as open bills less credit less unearned income, which is
 * `amount - deferred_amount`: the new branch owes the old one for bills it will
 * now collect, and is owed for the credit and unearned fees it now answers for.
 *
 * Tunde owed N400,000 on a term billed at Ikeja and had N10,000 credit; N380,000
 * of the term was not yet earned when he moved to Lekki. Lekki takes the bill,
 * the credit and the unearned N380,000, and owes Ikeja N400,000 - N10,000 -
 * N380,000 = N10,000: the N20,000 Ikeja already earned, less the N10,000 of
 * credit Lekki now holds for Tunde.
 */

import type { ReceivableMoveResult } from "@/redux/services/finance/interbranch-types";

export interface MoveSummary {
  /** Open invoices and debit notes, kobo. */
  owed: number;
  invoiceCount: number;
  debitNoteCount: number;
  /** Unapplied credit that went with the customer, kobo. */
  credit: number;
  creditCount: number;
  /** Income not yet earned that moved with the invoices, kobo. */
  deferred: number;
  /** What the new branch owes the old one; negative when the old owes the new. */
  debt: number;
}

export function moveSummary(r: ReceivableMoveResult): MoveSummary {
  return {
    owed: r.amount + r.credit_amount,
    invoiceCount: r.invoice_count,
    debitNoteCount: r.debit_note_count,
    credit: r.credit_amount,
    creditCount: r.credit_count,
    deferred: r.deferred_amount,
    debt: r.amount - r.deferred_amount,
  };
}

/** The resulting debt between the branches, in one sentence. */
export function moveDebtSentence(debt: number, from: string, to: string, money: (kobo: number) => string): string {
  if (debt > 0) {
    return `${to} owes ${from} ${money(debt)}: the bills ${to} now collects, less the credit and unearned fees it took over.`;
  }
  if (debt < 0) {
    return `${from} owes ${to} ${money(-debt)}: the credit and unearned fees ${to} took over came to more than the bills it now collects.`;
  }
  return "Nothing is owed between the branches.";
}

/** "2 invoices", "1 debit note" - a count with its noun. */
export function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
