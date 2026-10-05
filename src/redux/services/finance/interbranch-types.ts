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

/** Where a transfer stands, in the words both branches use (`stage` on the model). */
export type InterBranchStage =
  | "REQUESTED"
  | "PENDING_APPROVAL"
  | "SENT"
  | "RECEIVED"
  | "DECLINED"
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
}

export interface InterBranchListParams {
  entity: string;
  page?: number;
  page_size?: number;
  kind?: string;
  status?: string;
  /** Either side. */
  branch?: number;
  /** With `branch`, the other side. */
  counterparty?: number;
  date_from?: string;
  date_to?: string;
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
  forwarded_by: { id: number; document_number: string; status: string } | null;
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
