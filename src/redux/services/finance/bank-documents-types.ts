/**
 * Bank documents: money in or out of a bank account that is not a receipt, a bill
 * or a payroll run, and money moved between two accounts of one branch.
 *
 * Each carries its bank account's branch and posts in that branch's books. The
 * counter-account of a bank transaction is an ordinary account (capital, a loan,
 * drawings, interest, charges); one a sub-ledger keeps is refused by name.
 */

export type BankTransactionDirection = "IN" | "OUT";

export interface BankTransactionDocument {
  id: number;
  document_number: string;
  status: string;
  branch_id: number | null;
  bank_account_id: number;
  bank_account_name: string;
  direction: BankTransactionDirection;
  amount: number;
  counter_account_id: number;
  counter_account_code: string;
  counter_account_name: string;
  transaction_date: string;
  narration: string;
  reference: string;
  journal_id: number | null;
}

export interface BankTransferDocument {
  id: number;
  document_number: string;
  status: string;
  branch_id: number | null;
  from_account_id: number;
  from_account_name: string;
  to_account_id: number;
  to_account_name: string;
  amount: number;
  transfer_date: string;
  narration: string;
  reference: string;
  journal_id: number | null;
}
