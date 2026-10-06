/**
 * Shapes of the inter-branch endpoints (vs_finance views_ops/interbranch.py and
 * the shared bank split in views_ops/banking.py), field for field as their
 * serializers send them. Money is integer kobo throughout.
 *
 * `branch_*` is always the SENDING branch (the one that gives money, goods, a
 * customer's open balance or a share of a cost) and `to_branch_*` the
 * receiving one. Except for a forwarded receipt, the receiving branch then owes
 * the sending branch the amount.
 */

import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

/** What a transfer moves between two branches (InterBranchTransferKind). */
export type InterBranchKind =
  | "CASH"
  | "FORWARDED_RECEIPT"
  | "RECEIVABLE"
  | "RECHARGE"
  | "GOODS"
  | "INCOME_GIVEN_BACK"
  | "BANK_SPLIT";

/**
 * Where a transfer stands, in the words both branches use (`stage` on the model).
 * `DECLINED` is a request the asked branch refused; `NOT_SENT` is a send nobody
 * asked for, or a forwarded receipt, whose approval ended unapproved (status
 * CANCELLED, nothing booked).
 */
export type InterBranchStage =
  | "REQUESTED"
  | "PENDING_APPROVAL"
  | "SENT"
  | "RECEIVED"
  | "DECLINED"
  | "NOT_SENT"
  | "VOIDED";

/** One branch's side of a transfer and the journal it posted (blank where the
 *  side is another document's own journal). */
export interface InterBranchLegJournal {
  role: "SENDING" | "RECEIVING";
  branch_id: number;
  journal_id: number | null;
}

export interface InterBranchTransfer {
  id: number;
  document_number: string;
  kind: InterBranchKind;
  kind_label: string;
  /** DRAFT, PENDING_APPROVAL, APPROVED, POSTED, CANCELLED or REVERSED. */
  status: string;
  stage: InterBranchStage;
  branch_id: number;
  branch_name: string;
  to_branch_id: number;
  to_branch_name: string;
  amount: number;
  transfer_date: string;
  purpose: string;
  reference: string;
  repay_by: string | null;
  from_bank_account_id: number | null;
  from_bank_account_name: string | null;
  to_bank_account_id: number | null;
  to_bank_account_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  held_receipt_id: number | null;
  receipt_id: number | null;
  recharge_id: number | null;
  requested_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  arrival_date: string | null;
  declined_at: string | null;
  decline_reason: string;
  journals: InterBranchLegJournal[];
  /** Present when a send or forward was held for approval at the sending branch. */
  approval?: ApprovalParkState;
  /** The credit note's or concession's journal behind an INCOME_GIVEN_BACK transfer. */
  adjustment_entry_id?: number | null;
  /** What a RECEIVABLE move carried; empty for every other kind. */
  moved_items?: MovedItem[];
  /** Who owes whom for a RECEIVABLE move; null for every other kind. */
  net_owed?: MoveNetOwed | null;
  /** Where its approval stands: NOT_SUBMITTED, PENDING, APPROVED or REJECTED; absent from an older server. */
  approval_state?: string;
  /** True while an approver has handed it back to whoever sent it (a DRAFT still PENDING). */
  approval_returned?: boolean;
  /** The latest approval request, null before it is first sent; absent where the read does not name it. */
  workflow_instance_id?: string | number | null;
}

/**
 * One document a receivable move carried: an open invoice or debit note (its
 * balance moved, with `deferred_amount` of income not yet earned), or a credit
 * drawn from a receipt or a credit note.
 */
export interface MovedItem {
  kind: "INVOICE" | "DEBIT_NOTE" | "RECEIPT_CREDIT" | "NOTE_CREDIT";
  document_number: string;
  invoice_id: number | null;
  note_id: number | null;
  payment_id: number | null;
  amount: number;
  deferred_amount: number;
}

/**
 * Open bills less the credit and unearned income a move handed over: the
 * inter-branch balance it booked. Both branches are null when it nets to 0.
 */
export interface MoveNetOwed {
  amount: number;
  owed_by: { id: number; name: string } | null;
  owed_to: { id: number; name: string } | null;
}

export interface InterBranchListParams {
  entity: string;
  page?: number;
  page_size?: number;
  kind?: string;
  status?: string;
  /** "returned" keeps only sends an approver sent back to whoever sent them. */
  approval?: "returned";
  /** Either side. */
  branch?: number;
  /** With `branch`, the other side. */
  counterparty?: number;
  date_from?: string;
  date_to?: string;
  /** A credit note's or concession's journal id: the income it gave back. */
  adjustment?: number;
}

/** POST /finance/inter-branch-transfers/ - send money unprompted. */
export interface SendMoneyBody {
  entity: string;
  from_bank_account: number | string;
  to_branch: number;
  to_bank_account?: number | string;
  amount: number;
  transfer_date?: string;
  purpose: string;
  repay_by?: string;
  reference?: string;
}

/** POST /finance/inter-branch-transfers/requests/ - ask another branch for money. */
export interface RequestMoneyBody {
  entity: string;
  from_branch: number;
  amount: number;
  purpose: string;
  to_branch?: number;
  transfer_date?: string;
  repay_by?: string;
  to_bank_account?: number | string;
}

/** POST /finance/inter-branch-transfers/<id>/send/ - meet a request. */
export interface SendRequestedBody {
  id: number;
  entity: string;
  from_bank_account: number | string;
  to_bank_account?: number | string;
  transfer_date?: string;
}

/** POST /finance/inter-branch-transfers/receivable-moves/ - move a customer's open balance. */
export interface ReceivableMoveBody {
  entity: string;
  customer: string | number;
  from_branch: number;
  to_branch: number;
  move_date?: string;
  purpose?: string;
  move_key?: string;
}

/**
 * What a receivable move carried. `amount` is the customer's net balance that
 * moved (open bills less the credit that went with them, negative when the
 * customer was in credit); `deferred_amount` the income not yet earned that
 * moved with the invoices. `transfer_id` is null when nothing was open.
 */
export interface ReceivableMoveResult {
  transfer_id: number | null;
  amount: number;
  invoice_count: number;
  invoice_ids: number[];
  debit_note_count: number;
  credit_count: number;
  credit_amount: number;
  deferred_amount: number;
}

export interface BranchRef {
  id: number;
  name: string;
}

/** One pair of branches, reported once as `owed_by` owes `owed_to` `amount`. */
export interface InterBranchPair {
  owed_to: BranchRef;
  owed_by: BranchRef;
  amount: number;
  /** False when the two branches' books disagree about the figure. */
  balanced: boolean;
}

export interface InterBranchHeld {
  held_by: BranchRef;
  held_for: BranchRef;
  amount: number;
}

export interface InterBranchBalances {
  pairs: InterBranchPair[];
  held: InterBranchHeld[];
  /** The inter-branch account across every branch (zero when the books agree);
   *  null for a reader bound to some branches. */
  net_total: number | null;
}

/**
 * One customer of a branch (or one every branch shares), found by exact code
 * for a held receipt. Only what the held-receipt form already sends and echoes:
 * no balance, contact or invoice.
 */
export interface HeldReceiptCustomer {
  id: number;
  code: string;
  name: string;
  branch_id: number | null;
}

export interface HeldReceipt {
  id: number;
  document_number: string;
  status: string;
  branch_id: number;
  branch_name: string;
  for_branch_id: number;
  for_branch_name: string;
  bank_account_id: number;
  bank_account_name: string;
  customer_id: number;
  customer_name: string;
  amount: number;
  receipt_date: string;
  method: string;
  reference: string;
  narration: string;
  journal_id: number | null;
  /** The live transfer forwarding it, if any. */
  forwarded_by: {
    id: number; document_number: string; status: string;
    /** True while an approver has sent the forward back to whoever sent it; absent from an older server. */
    approval_returned?: boolean;
  } | null;
}

export interface RecordHeldReceiptBody {
  entity: string;
  bank_account: number | string;
  for_branch: number;
  customer: string | number;
  amount: number;
  receipt_date: string;
  method?: string;
  reference?: string;
  narration?: string;
}

export interface ForwardHeldReceiptBody {
  id: number;
  entity: string;
  to_bank_account?: number | string;
  from_bank_account?: number | string;
  transfer_date?: string;
  purpose?: string;
}

export type RechargeBasis = "COUNTS" | "PERCENTAGES";

/** One branch's share of a recharge. A branch-bound reader sees only their own
 *  branches' shares unless they work in the paying branch. */
export interface RechargeLine {
  branch_id: number;
  branch_name: string;
  /** A count, or a percentage in basis points (10000 is 100%). */
  weight: number;
  amount: number;
  /** Null on the paying branch's own line, which moves nothing. */
  transfer_id: number | null;
}

export interface Recharge {
  id: number;
  document_number: string;
  status: string;
  branch_id: number;
  branch_name: string;
  rule_id: number | null;
  expense_account_id: number;
  expense_account_code: string;
  amount: number;
  recharge_date: string;
  basis: RechargeBasis;
  narration: string;
  reference: string;
  lines: RechargeLine[];
}

export type RechargeWeight = { branch: number; count: number } | { branch: number; percent: number };

export interface CreateRechargeBody {
  entity: string;
  branch?: number;
  amount: number;
  recharge_date?: string;
  narration: string;
  expense_account?: string;
  rule?: number;
  basis?: RechargeBasis;
  weights?: RechargeWeight[];
  reference?: string;
}

export type SharedCostTreatment = "ABSORB" | "RECHARGE";

export interface SharedCostRule {
  id: number;
  name: string;
  treatment: SharedCostTreatment;
  basis: RechargeBasis;
  expense_account_id: number | null;
  expense_account_code: string | null;
  is_active: boolean;
  shares: { branch_id: number; branch_name: string; percent: number }[];
}

export interface SharedCostRuleBody {
  entity: string;
  name?: string;
  treatment?: SharedCostTreatment;
  basis?: RechargeBasis;
  expense_account?: string | null;
  is_active?: boolean;
  shares?: { branch: number; percent: number }[];
}

/** How a branch's difference on a shared bank account is treated when it is split. */
export type BankSplitDifferenceTreatment = "DEBT" | "PERMANENT_MOVE";

export interface BankSplitAllocation {
  branch: number;
  /** Signed kobo: an overdraft share is negative. */
  opening_balance: number;
  bank_account_name: string;
  ledger_account_code: string;
  ledger_account_name: string;
  is_primary: boolean;
  is_primary_collection: boolean;
}

export interface BankSplitBody {
  id: number;
  entity: string;
  split_date: string;
  agreement_reference: string;
  difference_treatment: BankSplitDifferenceTreatment;
  allocations: BankSplitAllocation[];
}

/**
 * What a split of a shared bank account would start from, read before any share
 * is agreed: the whole ledger's balance, the part still in entries no branch
 * holds (the split refuses until it is 0), and each branch's own book balance
 * on the account, read exactly as the split will measure its difference.
 */
export interface BankSplitPreview {
  bank_account_id: number;
  legacy_balance: number;
  unbranched_balance: number;
  split_date: string;
  branches: { branch_id: number; branch_name: string; book_balance: number }[];
}

export interface BankSplitResult {
  legacy_bank_account_id: number;
  legacy_balance: number;
  bank_accounts: {
    id: number;
    name: string;
    branch_id: number;
    gl_account_id: number;
    gl_account_code: string;
    opening_balance: number;
    is_primary: boolean;
    is_primary_collection: boolean;
  }[];
  journal_ids: number[];
  difference_treatment: BankSplitDifferenceTreatment;
  /** The BANK_SPLIT transfers a debt treatment booked, empty otherwise. */
  inter_branch_transfers: {
    id: number;
    document_number: string;
    from_branch_id: number;
    to_branch_id: number;
    amount: number;
  }[];
}
