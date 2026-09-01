// vs_payments gateway types - collections (cash-in), virtual accounts, payouts
// (cash-out) and batches. Bank/beneficiary fields are FLS-stripped unless the
// caller holds the matching *.view_sensitive grant (use @/utils/fls).

export type CollectionStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "ABANDONED" | "REFUNDED";

export interface Collection {
  id: number;
  entity_code: string;
  provider: string;
  channel: string;
  reference: string;
  provider_reference: string | null;
  amount: number;
  amount_naira: string;
  status: CollectionStatus;
  customer_code: string | null;
  customer_name: string | null;
  deposit_account_code: string | null;
  deposit_account_name: string | null;
  invoice_id: number | null;
  payer_email: string;
  payer_name: string;
  narration: string;
  checkout_url: string | null;
  payment_id: number | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface VirtualAccount {
  id: number;
  entity_code: string;
  provider: string;
  customer_code: string | null;
  customer_name: string | null;
  account_number?: string; // FLS - stripped without view_sensitive
  bank_name: string;
  account_name?: string; // FLS
  provider_reference: string | null;
  deposit_account_code: string | null;
  deposit_account_name: string | null;
  currency_code: string | null;
  status: string;
  created_at: string;
  _stripped_fields?: string[];
}

export interface VirtualAccountKpis {
  total: number;
  active: number;
  inactive: number;
  providers: number;
}

export interface PayoutInstruction {
  id: number;
  entity_code: string;
  batch_id: number | null;
  provider: string;
  reference: string;
  provider_reference: string | null;
  amount: number;
  amount_naira: string;
  status: string;
  beneficiary_name?: string; // FLS
  beneficiary_account_number?: string; // FLS
  beneficiary_bank_code: string;
  narration: string;
  source_account_code: string | null;
  source_account_name: string | null;
  wht_amount: number; // kobo withheld; net = amount − wht_amount
  vendor_payment_id: number | null;
  failure_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
  _stripped_fields?: string[];
}

export interface PayoutBatchItemPayload {
  vendor: string | number;
  amount: number; // kobo
  beneficiary_name: string;
  beneficiary_account_number: string;
  beneficiary_bank_code?: string;
  wht_amount?: number; // kobo
  narration?: string;
}

export interface CreatePayoutBatchPayload {
  entity: string;
  title?: string;
  provider?: string;
  source_account?: string;
  narration?: string;
  submit?: boolean; // true → dispatch to the provider immediately after assembly
  items: PayoutBatchItemPayload[];
}

export interface InitiatePayoutPayload {
  entity: string;
  vendor: string | number; // a payout settles the vendor's payable
  amount: number; // kobo
  beneficiary_name: string;
  beneficiary_account_number: string;
  beneficiary_bank_code?: string;
  source_account?: string;
  provider?: string;
  narration?: string;
}

export interface PayoutBatchSummary {
  id: number;
  entity_code: string;
  provider: string;
  reference: string;
  title: string;
  status: string;
  total_amount: number;
  total_amount_naira: string;
  item_count: number;
  submitted_at: string | null;
  created_at: string;
  // Maker-checker approval phase. Only present once the backend serializer exposes it
  // (from metadata["approval_status"]); a DRAFT batch stays DRAFT while awaiting approval.
  // `approval_required` is true when a payments.payout_batch workflow template covers the
  // batch's scope, so direct submit is refused and it must be routed for approval instead.
  approval_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  approval_required?: boolean;
}

export interface PayoutBatch extends PayoutBatchSummary {
  narration: string;
  instructions: PayoutInstruction[];
}

export interface InitiateCollectionPayload {
  entity: string;
  amount: number; // kobo
  customer?: string | number;
  invoice?: number;
  deposit_account?: string;
  channel?: string;
  provider?: string;
  payer_email?: string;
  payer_name?: string;
  narration?: string;
}

// Settlement reconciliation - gateway records (confirmed collections / paid payouts)
// matched against imported bank statement lines. Read-only; recomputed each GET.
export interface SettlementRow {
  kind: "COLLECTION" | "PAYOUT";
  gateway_id: number;
  reference: string;
  provider: string;
  provider_reference: string;
  amount: number; // signed kobo (+ in, − out) - the gateway gross
  amount_naira: string;
  confirmed_at: string | null;
  settled: boolean;
  match_basis: "reference" | "amount" | "";
  matched_bank_line_id: number | null;
  settled_amount: number | null; // the matched bank line's signed amount (net of fees)
  fee_amount: number; // |gross| − |net| - the PSP fee
  settlement_reference: string; // the matched bank line's reference
  settlement_date: string | null; // the matched bank line's txn date
  settlement_description: string; // the matched bank line's description
}

export interface UnmatchedBankLine {
  bank_line_id: number;
  bank_account_id: number;
  txn_date: string;
  description: string;
  reference: string;
  amount: number; // signed kobo
  amount_naira: string;
}

export interface SettlementReconciliation {
  entity_code: string;
  start_date: string | null;
  end_date: string | null;
  provider: string;
  is_reconciled: boolean;
  summary: {
    settled_count: number;
    unsettled_count: number;
    gateway_total: number;
    settled_total: number;
    unsettled_total: number;
    unmatched_bank_total: number;
    unmatched_bank_count: number;
  };
  rows: SettlementRow[];
  unmatched_bank_lines: UnmatchedBankLine[];
}

// Append-only gateway action log (PaymentEvent) - the transactions log.
export interface TransactionLogEntry {
  id: number;
  entity_code: string | null;
  provider: string;
  action: string;
  action_display: string;
  reference: string;
  succeeded: boolean;
  message: string;
  metadata: Record<string, unknown>;
  actor_email: string | null;
  created_at: string;
}

// ── Header KPI summaries (computed over ALL rows, accurate while lists paginate) ──
interface Money { kobo: number; naira: string }

export interface CollectionSummary {
  total: number;
  collected: Money;
  pending: Money;
  failed: Money;
  success_rate: number | null;
  group_counts: Record<string, number>; // PAID / PENDING / FAILED / REFUNDED
}

export interface PayoutSummary {
  total: number;
  settled7d: Money;
  pending: Money;
  failed: number;
  group_counts: Record<string, number>; // PAID / PENDING / FAILED
}

export interface PayoutBatchKpis {
  total: number;
  queued: Money;
  completed7d: number;
  drafts: number;
}

// Unified money-movement feed row (collections in + payouts out).
export interface Movement {
  kind: "collection" | "payout";
  gateway_id: number;
  reference: string;
  created_at: string | null;
  direction: "in" | "out";
  party: string;
  provider: string;
  amount: number;
  amount_naira: string;
  status: string;
  narration: string;
  provider_reference: string | null;
  confirmed_at: string | null;
  linked_id: number | null;
  email: string;
  account_code: string | null;
  account_name: string | null;
  beneficiary_account: string;
}

export interface MovementsSummary {
  in7d: Money;
  out7d: Money;
  pending: number;
  failed: number;
}

/** An inbound provider webhook, as the console sees it.
 *
 * The raw payload, headers and signature are deliberately not exposed by the API -
 * they are the provider's own record and hold signature material.
 */
export interface WebhookEvent {
  id: number;
  provider: string;
  event_type: string;
  provider_reference: string;
  /** RECEIVED | PROCESSED | IGNORED | FAILED. */
  status: string;
  verified: boolean;
  /** Why it did not go through. Empty on a healthy event. */
  error: string;
  created_at: string;
  processed_at: string | null;
  collection_id: number | null;
  payout_id: number | null;
  /** COLLECTION | PAYOUT, or null when the event matched nothing local. */
  target_kind: string | null;
  target_reference: string | null;
  amount: number | null;
  amount_naira: string | null;
  customer_name: string | null;
}

export interface WebhookSummary {
  /** We tried to book it and could not. */
  failed: number;
  /** Valid signature, nothing local to match. */
  ignored: number;
  /** failed + ignored - the badge number. */
  needs_attention: number;
  status_counts: Record<string, number>;
}
