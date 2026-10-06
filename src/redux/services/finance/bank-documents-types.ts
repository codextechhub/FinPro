/**
 * Bank documents: money in or out of a bank account that is not a receipt, a bill
 * or a payroll run, and money moved between two accounts of one branch.
 *
 * Each carries its bank account's branch and posts in that branch's books. The
 * counter-account of a bank transaction is an ordinary account (capital, a loan,
 * drawings, interest, charges); one a sub-ledger keeps is refused by name.
 */

export type BankTransactionDirection = "IN" | "OUT";

/**
 * Where a bank document stands with its approval route, read from its latest
 * approval: `NOT_SUBMITTED` when it never went for approval (posted at once, or
 * withdrawn), `PENDING` while a request is in flight, then `APPROVED` or
 * `REJECTED`. A rejected document goes back to DRAFT, so its status alone
 * cannot tell it from one still waiting.
 */
export type BankDocumentApprovalState = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";

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
  /** The branch's name; null for a document not yet given a branch. */
  branch_name?: string | null;
  approval_state?: BankDocumentApprovalState;
  /** True while an approver has handed it back to whoever sent it (a DRAFT still PENDING). */
  approval_returned?: boolean;
  /** The latest approval request, null before it is first sent; absent where the read does not name it. */
  workflow_instance_id?: string | number | null;
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
  /** The branch's name; null for a document not yet given a branch. */
  branch_name?: string | null;
  approval_state?: BankDocumentApprovalState;
  /** True while an approver has handed it back to whoever sent it (a DRAFT still PENDING). */
  approval_returned?: boolean;
  /** The latest approval request, null before it is first sent; absent where the read does not name it. */
  workflow_instance_id?: string | number | null;
}
