// vs_payments gateway types - collections (cash-in), virtual accounts, payouts
// (cash-out) and batches. Bank and beneficiary fields carry Field Access
// switches: a field the caller cannot read is absent, so each is optional, and a
// detail response lists the present ones they cannot change in
// `_read_only_fields`. Read them through `useFieldAccess`.

export type CollectionStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "ABANDONED" | "REFUNDED";

export interface Collection {
  id: number;
  entity_code: string;
  /** The branch the money belongs to (its invoice's); null on a row still waiting for one. */
  branch?: number | null;
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
  /** The branch whose collection account the deposits settle into. */
  branch?: number | null;
  provider: string;
  customer_code: string | null;
  customer_name: string | null;
  account_number?: string; // Field Access: payments.virtual_account
  bank_name: string;
  account_name?: string; // Field Access: payments.virtual_account
  provider_reference: string | null;
  deposit_account_code: string | null;
  deposit_account_name: string | null;
  currency_code: string | null;
  status: string;
  created_at: string;
  _read_only_fields?: string[];
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
  /** The branch of the bank account the payout is paid from. */
  branch?: number | null;
  batch_id: number | null;
  provider: string;
  reference: string;
  provider_reference: string | null;
  amount: number;
  amount_naira: string;
  status: string;
  beneficiary_name?: string; // Field Access: payments.payout
  beneficiary_account_number?: string; // Field Access: payments.payout
  beneficiary_bank_code?: string; // Field Access: payments.payout
  narration: string;
  source_account_code: string | null;
  source_account_name: string | null;
  wht_amount: number; // kobo withheld; net = amount − wht_amount
  vendor_payment_id: number | null;
  failure_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
  _read_only_fields?: string[];
}

/** One batch line. The beneficiary is copied from the vendor's verified record;
 *  the beneficiary fields are compatibility inputs that are only compared with
 *  it, and a caller sends them only where Field Access lets them write. */
export interface PayoutBatchItemPayload {
  vendor: string | number;
  amount: number; // kobo
  beneficiary_name?: string;
  beneficiary_account_number?: string;
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
  beneficiary_name?: string;
  beneficiary_account_number?: string;
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
  amount: number; // signed kobo (+ in, − out) - a payout at what it sent, net of WHT
  amount_naira: string;
  confirmed_at: string | null;
  settled: boolean;
  match_basis: "reference" | "amount" | "settlement" | "platform_settlement" | "";
  matched_bank_line_id: number | null;
  settled_amount: number | null; // the matched bank line's signed amount (net of fees)
  fee_amount: number; // |amount| − |settled_amount| - the PSP fee
  settlement_reference: string; // the matched bank line's reference
  settlement_date: string | null; // the matched bank line's txn date
  settlement_description: string; // the matched bank line's description
  /** Amount-only match: a person should confirm it. */
  needs_review?: boolean;
  /** Booked to gateway clearing: it settles through a booked settlement, not a line of its own. */
  via_clearing?: boolean;
  /** The branch the money belongs to, or a payout leaves from; absent from an older server. */
  branch_id?: number | null;
  branch_name?: string | null;
  /** The provider's own fee for this payment, where it reported one. */
  reported_fee?: number | null;
}

/** A bank inflow the server thinks carries these waiting payments. Nothing is booked
 *  until a person confirms it through `POST /payments/settlements/`. */
export interface SuggestedSettlement {
  bank_line_id: number;
  bank_account_id: number;
  txn_date: string;
  branch: number | null;
  /** "reference": the line names one payment; "day": one branch's payments of one day. */
  basis: "reference" | "day";
  confirmed_on: string | null;
  collection_ids: number[];
  gross: number;
  fee: number;
  net: number;
}

export interface BookSettlementPayload {
  entity: string;
  statement_line: number;
  collections: number[];
  posting_date?: string;
}

/** The journal a booked settlement posted: Dr bank (net), Dr bank charges (fee), Cr gateway clearing (gross). */
export interface BookedSettlement {
  journal_id: number;
  journal_number: string;
  date: string;
  statement_line: number;
  collections: number[];
  gross: number;
  fee: number;
  net: number;
}

export interface UnmatchedBankLine {
  bank_line_id: number;
  bank_account_id: number;
  txn_date: string;
  description: string;
  reference: string;
  amount: number; // signed kobo
  amount_naira: string;
  /** The branch of the bank account the line is on; absent from an older server. */
  branch_id?: number | null;
  branch_name?: string | null;
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
  suggested_settlements?: SuggestedSettlement[];
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

// Unified money-movement feed row (collections in + payouts out). On a payout
// row `party` and `beneficiary_account` are the beneficiary name and account
// number, absent when Field Access on payments.payout hides them. `amount` is
// the money that moved: on a payout, the line less the WHT withheld.
export interface Movement {
  /** "settlement": held money paid into a branch's bank, a transfer rather than spending. */
  kind: "collection" | "payout" | "settlement";
  gateway_id: number;
  reference: string;
  created_at: string | null;
  direction: MovementDirection;
  party?: string;
  provider: string;
  amount: number; // kobo that moved (a payout's line net of WHT)
  amount_naira: string;
  gross_amount: number; // kobo: a payout's line before WHT; a collection's amount
  wht_amount: number; // kobo withheld on a payout; 0 on a collection
  status: string;
  narration: string;
  provider_reference: string | null;
  confirmed_at: string | null;
  linked_id: number | null;
  email: string;
  account_code: string | null;
  account_name: string | null;
  beneficiary_account?: string;
}

/** "transfer" moves the school's own money (a held settlement) and is never money spent. */
export type MovementDirection = "in" | "out" | "transfer";

export interface MovementsSummary {
  in7d: Money;
  out7d: Money;
  /** Settlements of held money in the last 7 days; absent on an older server. */
  transfers7d?: Money;
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

// ── Custody: who holds the online money between the payer and the bank ──────

/** HELD: the platform holds it and pays each branch on schedule. DIRECT: each
 *  branch's provider subaccount settles straight into its collection account. */
export type CustodyMode = "HELD" | "DIRECT";

export interface CustodySettings {
  /** The mode in force today. */
  mode: CustodyMode;
  stored_mode: CustodyMode;
  effective_from: string | null;
  /** A change waiting for its month start (a move to direct also waits until nothing is held). */
  pending_mode: CustodyMode | null;
  pending_from: string | null;
  /** Why a pending change has not happened yet, in the server's words. */
  pending_note: string | null;
  settlement_interval_days: number;
  clearing_stale_days: number;
  updated_at: string | null;
}

/** A branch's collection account as the custody screen lists it (no account number). */
export interface CustodyCollectionAccount {
  id: number;
  name: string;
  bank_name: string;
  subaccount_ready: boolean;
  subaccount_provider: string | null;
  /** The provider's handle for the subaccount; null until one is set up. Absent from an older server. */
  subaccount_code?: string | null;
}

export interface CustodyBranch {
  branch: number;
  branch_name: string;
  collection_account: CustodyCollectionAccount | null;
  /** Kobo the platform holds for this branch now. */
  held_balance: number;
}

/**
 * The custody settings as the server answers them. A holder of
 * `payments.settings.view` gets every field; a holder of `payments.payout.view`
 * alone gets the short answer, `{ settings: { mode } }`, with no other setting
 * and no branches. Read a full answer through `isFullCustodyPayload`.
 */
export interface CustodyPayload {
  settings: Pick<CustodySettings, "mode"> & Partial<CustodySettings>;
  /** The branches in the reader's reach; absent from the short answer. */
  branches?: CustodyBranch[];
}

/** The whole answer, which the Online payments panel needs. */
export interface FullCustodyPayload {
  settings: CustodySettings;
  branches: CustodyBranch[];
}

export interface UpdateCustodyPayload {
  entity: string;
  mode?: CustodyMode;
  settlement_interval_days?: number;
  clearing_stale_days?: number;
}

export interface SaveSubaccountPayload {
  entity: string;
  bank_account: number;
  /** The bank's code at the provider, digits only (058 for GTBank). */
  settlement_bank_code: string;
  business_name?: string;
  provider?: string;
}

export interface SavedSubaccount extends CustodyCollectionAccount {
  branch: number | null;
}

// ── Held settlements: the platform paying a branch the money it held ─────────

export type HeldSettlementStatus = "PENDING" | "PAID" | "FAILED";

export interface HeldSettlement {
  id: number;
  branch: number;
  branch_name: string;
  status: HeldSettlementStatus;
  run_on: string;
  /** The last settlement before a move to direct payment. */
  final: boolean;
  /** Payments covered. */
  gross: number;
  /** The provider's fees on those payments. */
  fees: number;
  /** The provider's fee for the transfer itself, borne by the branch. */
  transfer_fee: number;
  /** What is sent to the bank. */
  amount: number;
  bank_account: { id: number; name: string };
  batch: {
    id: number;
    reference: string;
    status: string;
    approval_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  } | null;
  journal_id: number | null;
  paid_at: string | null;
  failure_reason: string | null;
}

/** The platform's view of a held settlement: which school it pays. */
export interface PlatformHeldSettlement extends HeldSettlement {
  tenant: string;
  tenant_name: string;
  entity: string;
}

/** One day's check of the platform's books against its provider balance. */
export interface HeldReconciliation {
  id: number;
  checked_on: string;
  provider: string;
  currency: string;
  /** What the provider reported; null when it could not be read. */
  provider_balance: number | null;
  /** What the books say the provider should hold. */
  books_balance: number;
  /** The provider balance account in the platform's books. */
  provider_account: number;
  /** Every branch's held balance added up. */
  held_total: number;
  /** The platform's own online takings not yet settled, less fees. */
  own_in_transit: number;
  /** The provider sweeps the balance to the platform's bank, so sweeps were allowed for. */
  balance_swept: boolean;
  /** Sweeps taken off the books' figure. */
  swept_total: number;
  /** The platform's own takings matched to a bank line after sweeping began, added back. */
  own_swept_settled: number;
  /** Provider less books; null when the provider could not be read. */
  difference: number | null;
  tolerance: number;
  agrees: boolean;
  error: string | null;
  incident_code: string | null;
}

/** How the platform's own merchant account behaves at the provider. */
export interface ProviderSettings {
  balance_swept: boolean;
  /** "platform": a value was stored; "default": nobody has set it. */
  source: "platform" | "default";
  updated_at: string | null;
  tolerance_kobo: number;
  sweeps: { count: number; total: number; latest_settled_at: string | null };
}

/** One provider settlement of the platform balance that the daily check counted. */
export interface ProviderSweep {
  id: number;
  provider: string;
  settlement_id: string;
  currency: string;
  amount: number;
  settled_at: string | null;
  recorded_on: string;
}
