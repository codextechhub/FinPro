/**
 * Types for the receivables screens that sit beside the invoice cycle: the
 * receivables policy, deferred fee income, the doubtful-debt provision, customer
 * deposits, credit transfers between customers, optional fee item assignments,
 * opening invoices, and one payer paying for several customers.
 *
 * Every shape mirrors a vs_finance response read off its serializer or view
 * (views_accruals, views_payers, views_ar). Money is integer kobo.
 */

import type { FinanceAuditLog, SettingConsumer } from "./setup-types";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
}

/** One rung of the ageing ladder: debts older than `over_days` are provided for at `rate_bps`. */
export interface ProvisionBand {
  over_days: number;
  rate_bps: number;
}

export type RevenueRecognition = "SPREAD_MONTHLY" | "AT_PERIOD_START";
export type PayerPaymentSplit = "OLDEST_FIRST" | "PROPORTIONAL" | "AS_ENTERED";
export type PayerPaymentSurplus = "MOST_RECENT_BILL" | "PAYER";

/** GET /finance/settings/receivables/ -> data.settings. */
export interface ReceivablesSettingsValues {
  revenue_recognition: RevenueRecognition;
  revenue_recognition_label: string;
  revenue_recognition_options: ChoiceOption<RevenueRecognition>[];
  provision_bands: ProvisionBand[];
  deposits_offset_unpaid_bills: boolean;
  unclaimed_deposit_years: number;
  payer_payment_split: PayerPaymentSplit;
  payer_payment_split_options: ChoiceOption<PayerPaymentSplit>[];
  payer_payment_surplus: PayerPaymentSurplus;
  payer_payment_surplus_options: ChoiceOption<PayerPaymentSurplus>[];
  updated_at: string | null;
  updated_by: string | null;
}

export interface ReceivablesSettingsPayload {
  settings: ReceivablesSettingsValues;
  consumers: Record<string, SettingConsumer>;
  history: FinanceAuditLog[];
}

export type ReceivablesSettingsUpdate = Partial<Pick<ReceivablesSettingsValues,
  "revenue_recognition" | "provision_bands" | "deposits_offset_unpaid_bills"
  | "unclaimed_deposit_years" | "payer_payment_split" | "payer_payment_surplus">>;

/** GET /finance/deferred-income/: waiting, released, and what falls due by month. */
export interface DeferredIncomeSummary {
  pending: number;
  released: number;
  /** Up to twelve months, earliest first; `month` is `YYYY-MM`. */
  by_month: { month: string; amount: number }[];
}

/** One journal a release run posted: one per branch. */
export interface DeferredIncomeRelease {
  id: number;
  branch_id: number | null;
  date: string;
  amount: number;
  journal_id: number;
}

/**
 * One release journal as the release list shows it, newest first. `can_reverse`
 * is true only when the month's undo would reverse it: not yet reversed, its
 * month open, and no branch holding a release of the month has closed it on
 * its own (the undo reverses every branch's release of the month together).
 * `reverse_blocked_reason` says why a release not yet reversed cannot be
 * undone, and is null otherwise. `branch_period_status` is where the release's
 * own branch stands with the month, the month's status until the branch has
 * one of its own.
 */
export interface DeferredIncomeReleaseRow {
  id: number;
  branch_id: number | null;
  branch_name: string | null;
  date: string;
  /** `YYYY-MM`. */
  month: string;
  period_id: number | null;
  period_name: string | null;
  period_status: string | null;
  branch_period_status: string | null;
  amount: number;
  journal_id: number;
  journal_number: string | null;
  reversed: boolean;
  reversed_at: string | null;
  can_reverse: boolean;
  reverse_blocked_reason: string | null;
}

export interface DeferredIncomeReleaseResult {
  up_to: string;
  releases: DeferredIncomeRelease[];
}

/** One branch's figures in a provision run; `bands` is keyed by the band's `over_days`. */
export interface ProvisionLine {
  branch_id: number | null;
  branch_name: string | null;
  required: number;
  current: number;
  movement: number;
  bands: Record<string, { owed: number; required: number }>;
  journal_id: number | null;
}

/**
 * A doubtful-debt provision run, whole or as the reader's branches' part of it.
 *
 * A run covers every branch at once. A reader bound to some branches is sent
 * only those branches' `lines`, with `required_total` and `movement_total`
 * summed from them, and `partial_view` true.
 */
export interface DoubtfulDebtProvision {
  id: number;
  document_number: string;
  status: string;
  as_of: string;
  narration: string;
  required_total: number;
  movement_total: number;
  policy_snapshot: ProvisionBand[];
  lines: ProvisionLine[];
  /** Null in a partial view: whether the run needs approval turns on its whole
   *  total, which the reader of a part is not shown. */
  approval_required?: boolean | null;
  created_at: string;
  /** True when the response is the reader's branches' part of the run. Absent
   *  from older servers, which never send such a part. */
  partial_view?: boolean;
}

export type DepositStatus = "HELD" | "RELEASED" | "FORFEITED" | "CANCELLED";

export interface CustomerDeposit {
  id: number;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  branch_id: number | null;
  branch_name: string | null;
  invoice_id: number;
  invoice_number: string;
  amount: number;
  amount_naira: string;
  status: DepositStatus;
  /** The day the customer left and the deposit became theirs to claim. */
  claim_opened_on: string | null;
  release_note_number: string | null;
  forfeiture_id: number | null;
}

export interface DepositForfeitResult {
  forfeitures: { id: number; branch_id: number | null; amount: number; journal_id: number }[];
  skipped: unknown;
}

export interface CustomerCreditTransfer {
  id: number;
  document_number: string;
  status: string;
  branch_id: number | null;
  from_customer_id: number;
  from_customer_code: string;
  from_customer_name: string;
  to_customer_id: number;
  to_customer_code: string;
  to_customer_name: string;
  transfer_date: string;
  amount: number;
  amount_naira: string;
  reason: string;
  receipt_id: number | null;
  receipt_number: string | null;
  approval_required?: boolean;
}

export type SubmittedTransfer = CustomerCreditTransfer & { approval?: ApprovalParkState };
export type SubmittedProvision = DoubtfulDebtProvision & { approval?: ApprovalParkState };

export interface PartyRef {
  id: number;
  code: string;
  name: string;
}

/** GET /finance/fee-structures/<code>/items/<id>/assignments/. */
export interface FeeItemAssignments {
  item_id: number;
  description: string;
  is_optional: boolean;
  customers: PartyRef[];
}

/** One unpaid bill carried in from before the books went live. Amount in kobo. */
export interface OpeningInvoiceRow {
  customer: string;
  invoice_date: string;
  due_date?: string;
  amount: number;
  reference?: string;
  period_label?: string;
  narration?: string;
  branch?: number;
}

export interface WriteOffRecoveryResult {
  recovery: { id: number; amount: number; journal_id: number; payment_id: number };
}

/** A payer paying for a customer. Ending a link switches it off and keeps it. */
export interface PayerLink {
  id: number;
  payer: PartyRef;
  customer: PartyRef;
  is_active: boolean;
  source_type: string;
  source_id: string;
}

/** A bill a share settles, in the preview. */
export interface PayerPlanBill {
  id: number;
  document_number: string;
  kind: "INVOICE" | "DEBIT_NOTE";
  balance: number;
  applied: number;
}

/**
 * One customer's share of a payment, at one branch.
 *
 * `RECEIPT` is a receipt at the branch whose bank received the money; `HELD` is
 * money held for the branch where that customer's bills sit, forwarded through
 * its own approval route. `outstanding` and `bills` are present only for a
 * branch the reader reaches.
 */
export interface PayerPlanShare {
  customer: PartyRef;
  branch_id: number | null;
  branch_name: string;
  kind: "RECEIPT" | "HELD";
  amount: number;
  /** The part of `amount` no bill takes, left as that customer's credit. */
  credit: number;
  outstanding?: number;
  bills?: PayerPlanBill[];
}

export interface PayerPaymentPlan {
  payer: PartyRef;
  bank_account: { id: number; name: string };
  branch_id: number | null;
  branch_name: string;
  amount: number;
  payment_date: string;
  split: string;
  shares: PayerPlanShare[];
}

export interface PayerPaymentShare {
  id: number;
  customer: PartyRef;
  branch_id: number | null;
  branch_name: string;
  kind: "RECEIPT" | "HELD";
  amount: number;
  credit: number;
  document: { id: number; document_number: string; status: string };
  /** For a held share: the forward that sent it on, while it stands. */
  forwarded_by?: { id: number; document_number: string; status: string } | null;
  bills?: { invoice_id: number; document_number: string; applied: number }[];
}

export interface PayerPayment {
  id: number;
  document_number: string;
  status: string;
  payer: PartyRef;
  branch_id: number | null;
  branch_name: string;
  bank_account: { id: number; name: string };
  amount: number;
  payment_date: string;
  method: string;
  split: string;
  reference: string;
  narration: string;
  shares: PayerPaymentShare[];
}

/** The body shared by preview and record. `shares` is the bursar's own split. */
export interface PayerPaymentInput {
  entity: string;
  payer: string | number;
  bank_account: string | number;
  amount: number;
  payment_date: string;
  method?: string;
  reference?: string;
  narration?: string;
  split?: PayerPaymentSplit;
  shares?: { customer: string | number; amount: number }[];
}
