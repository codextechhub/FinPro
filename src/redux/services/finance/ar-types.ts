// Accounts-Receivable types - mirror the vs_finance AR serializers. Money kobo.

import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

export type InvoiceStatus = "DRAFT" | "POSTED" | "REVERSED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface Invoice {
  id: number;
  document_number: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  tax_total: number;
  total: number;
  total_naira: string;
  amount_paid: number;
  amount_credited: number;
  settled_amount: number;
  balance_due: number;
  reference: string;
  narration: string;
}

export interface CreditNoteLine {
  id: number;
  line_no: number;
  description: string;
  revenue_account: string;
  quantity: string;
  unit_price: number;
  tax_code: string | null;
  net_amount: number;
  tax_amount: number;
  cost_center: string | null;
}

export interface CreditNote {
  id: number;
  document_number: string;
  kind: "CREDIT" | "DEBIT";
  customer_id: number;
  customer_code: string;
  customer_name: string;
  invoice_id: number | null;
  invoice_number: string | null;
  note_date: string;
  status: string;
  subtotal: number;
  tax_total: number;
  total: number;
  total_naira: string;
  allocated_amount: number;
  unallocated_amount: number;
  reason: string;
  reference: string;
  /**
   * Whether this document must go through approval instead of posting directly.
   *
   * Server-computed and **amount-dependent**: refunds and write-offs are gated at
   * any size, concessions and credit notes only at or above the tenant's
   * adjustment threshold. It therefore changes when the amount changes, so re-read
   * it after an edit rather than caching it against a document id.
   */
  approval_required?: boolean;
  lines: CreditNoteLine[];
}

export interface Refund {
  id: number;
  document_number: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  refund_date: string;
  method: string;
  status: string;
  amount: number;
  amount_naira: string;
  bank_account_id: number | null;
  reference: string;
  narration: string;
  /** See {@link Concession.approval_required} - same rule, same caveat. */
  approval_required?: boolean;
}

export interface RefundAvailabilityCustomer {
  customer_id: number;
  customer_code: string;
  customer_name: string;
  refundable_credit: number;
  refundable_credit_naira: string;
}

export interface WriteOffRequest {
  id: number;
  document_number: string;
  status: string;
  invoice_id: number;
  invoice_number: string;
  customer_code: string;
  customer_name: string;
  amount: number;
  amount_naira: string;
  write_off_account_id: number | null;
  write_off_date: string | null;
  narration: string;
  reason: string;
  journal_id: number | null;
  /** See {@link Concession.approval_required} - same rule, same caveat. */
  approval_required?: boolean;
}

export type InvoiceWriteOffResult = Invoice | WriteOffRequest;

export type ArAdjustmentBatchKind = "REFUND" | "WRITEOFF";
export type ArAdjustmentBatchAction = "DRAFT" | "POST" | "SUBMIT";

export interface ArAdjustmentBatchInput {
  entity: string;
  kind: ArAdjustmentBatchKind;
  action: ArAdjustmentBatchAction;
  date: string;
  bank_account?: string | number;
  write_off_account?: string | number;
  narration?: string;
  reason?: string;
  items: (
    | { customer: string | number; amount: number; reference?: string; narration?: string }
    | { invoice: string | number; amount: number; reason?: string; narration?: string }
  )[];
}

export interface ArAdjustmentBatchResult {
  kind: ArAdjustmentBatchKind;
  action: ArAdjustmentBatchAction;
  count: number;
  total_amount: number;
  items: Refund[] | WriteOffRequest[];
}

// Unified AR adjustment row (refund or write-off) from /finance/ar-adjustments/.
export interface ArAdjustment {
  key: string;
  kind: "REFUND" | "WRITEOFF";
  reference: string;
  date: string;
  customer_code: string;
  customer_name: string;
  reason: string;
  amount: number;
  amount_naira: string;
  status: string;
  refund_id: number | null;
  write_off_id?: number | null;
  /**
   * Whether this document must go through approval instead of posting directly.
   *
   * Server-computed and **amount-dependent**: refunds and write-offs are gated at
   * any size, concessions and credit notes only at or above the tenant's
   * adjustment threshold. It therefore changes when the amount changes, so re-read
   * it after an edit rather than caching it against a document id.
   */
  approval_required?: boolean;
}

export interface Concession {
  id: number;
  document_number: string;
  kind: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  invoice_id: number | null;
  invoice_number: string | null;
  concession_date: string;
  status: string;
  amount: number;
  amount_naira: string;
  allowance_account: string | null;
  reason: string;
  reference: string;
  /**
   * Whether this document must go through approval instead of posting directly.
   *
   * Server-computed and **amount-dependent**: refunds and write-offs are gated at
   * any size, concessions and credit notes only at or above the tenant's
   * adjustment threshold. It therefore changes when the amount changes, so re-read
   * it after an edit rather than caching it against a document id.
   */
  approval_required?: boolean;
}

export interface PaymentPlanInstallment {
  id: number;
  seq_no: number;
  due_date: string;
  amount: number;
  amount_settled: number;
  balance: number;
  status: string;
}

export interface PaymentPlan {
  id: number;
  document_number: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  invoice_id: number | null;
  invoice_number: string | null;
  plan_status: string;
  start_date: string;
  frequency: string;
  installment_count: number;
  total_amount: number;
  total_naira: string;
  // Credit already applied to the invoice before the plan began (opening/prior credit),
  // so settled_total = baseline_settled + what the plan's own installments have paid.
  baseline_settled: number;
  scheduled_total: number;
  settled_total: number;
  outstanding_total: number;
  notes: string;
  installments: PaymentPlanInstallment[];
}

export interface DunningStage {
  id?: number;
  level: number;
  name: string;
  min_days_overdue: number;
  channel: string;
  message: string;
}
export interface DunningPolicy {
  id: number;
  name: string;
  is_active: boolean;
  is_default: boolean;
  stages: DunningStage[];
}
export type AgingBucket = { amount: number; count: number };
export interface DunningSummary {
  due_soon: AgingBucket;
  overdue_1_30: AgingBucket;
  overdue_31_60: AgingBucket;
  overdue_60_plus: AgingBucket;
}

export interface DunningNotice {
  id: number;
  document_number: string;
  customer_code: string;
  customer_name: string;
  invoice_number: string;
  policy_name: string | null;
  level: number;
  notice_date: string;
  days_overdue: number;
  amount_due: number;
  amount_due_naira: string;
  channel: string;
  message: string;
  notice_status: string;
  sent_at: string | null;
}

export interface InvoiceListParams {
  entity: string;
  page?: number;
  page_size?: number;
  status?: InvoiceStatus;
  payment_status?: PaymentStatus;
  bucket?: string;
  search?: string;
}

type ArMoney = { kobo: number; naira: string };

// How an invoice was settled down - cash, credit notes, concessions or write-offs.
export type SettlementType = "PAYMENT" | "CREDIT_NOTE" | "CONCESSION" | "WRITE_OFF";

export interface InvoiceSettlement {
  type: SettlementType;
  date: string;
  reference: string;
  method: string | null;
  amount: ArMoney;
}

// A settlement/source journal grouped for the GL history (invoice posting + each
// settlement's own journal).
export interface InvoiceGlJournal {
  document_type: "INVOICE" | SettlementType;
  reference: string;
  date: string;
  source: string;
  lines: { account_code: string; account_name: string; debit: ArMoney; credit: ArMoney }[];
}

export interface InvoiceDetail {
  invoice: Invoice;
  summary: { subtotal: ArMoney; tax: ArMoney; total: ArMoney; paid: ArMoney; credited: ArMoney; settled: ArMoney; balance: ArMoney; due_date: string | null };
  lines: { description: string; account_code: string; account_name: string; quantity: string; unit_price: ArMoney; tax_code: string | null; tax_amount: ArMoney; line_total: ArMoney }[];
  // Cash receipts only - kept for back-compat; use `settlements` for the full picture.
  payments: { date: string; reference: string; method: string; amount: ArMoney }[];
  settlements: InvoiceSettlement[];
  // The invoice's own AR journal only - kept for back-compat; use `gl_journals`.
  gl_postings: { account_code: string; account_name: string; debit: ArMoney; credit: ArMoney }[];
  gl_journals: InvoiceGlJournal[];
  reminders: { date: string; level: number | null; channel: string; status: string }[];
  activity: { date: string; label: string }[];
}

export interface InvoiceSummary {
  kpis: {
    total_invoiced: { kobo: number; naira: string };
    total_collected: { kobo: number; naira: string };
    collection_rate: number;
    overdue_balance: { kobo: number; naira: string };
  };
  by_status: { draft: number; issued: number; partial: number; paid: number; overdue: number; total: number };
  totals: { count: number; total: { kobo: number; naira: string }; outstanding: { kobo: number; naira: string } };
  monthly: { label: string; invoiced: number; collected: number }[];
}

// Customers / payers - the AR sub-ledger party (mirrors CustomerSerializer).
export type CustomerAccountStatus = "ACTIVE" | "OVERDUE" | "CREDIT";

export interface Customer {
  id: number;
  code: string;
  name: string;
  billing_email: string;
  billing_phone: string;
  billing_address: string;
  receivable_account_code: string | null;
  receivable_account_name: string | null;
  opening_balance: number;
  opening_balance_naira: string;
  source_type: string;
  source_id: string;
  is_active: boolean;
  // Enriched on the list endpoint: net AR position (signed kobo; + owes, − credit).
  balance?: number;
  balance_naira?: string;
  account_status?: CustomerAccountStatus;
}

// Header KPI totals computed over ALL rows (so they stay accurate while the list
// paginates). { kobo, naira } mirrors the report money shape.
export interface CustomerSummary {
  total: number;
  receivable: { kobo: number; naira: string };
  on_credit: number;
  overdue: number;
  status_counts: Record<string, number>; // ACTIVE / CREDIT / OVERDUE / INACTIVE
}

/**
 * Customer receipts + allocation (Receipts & Allocation screen).
 * REFUNDED: the cash never settled an invoice, but it has since been paid back out,
 * so it is neither allocated nor still available. Reading as UNALLOCATED is how
 * a refunded receipt keeps advertising money the customer does not have.
 */
export type PaymentAllocationStatus = "ALLOCATED" | "PARTIAL" | "UNALLOCATED" | "REFUNDED";

export interface PaymentSummary {
  count: number;
  today: { kobo: number; naira: string };
  week: { kobo: number; naira: string };
  /** Credit still sitting in 2140 - net of anything already refunded back out. */
  unallocated: { kobo: number; naira: string };
  /** Receipt cash that has been paid back out as a customer refund. */
  refunded: { kobo: number; naira: string };
  status_counts: Record<string, number>; // ALLOCATED / PARTIAL / UNALLOCATED / REFUNDED
}

export interface Payment {
  id: number;
  document_number: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  payment_date: string;
  method: string;
  amount: number;
  amount_naira: string;
  allocated_amount: number;
  /** Cash that never settled an invoice. A sub-ledger fact - blind to refunds. */
  unallocated_amount: number;
  /** Of that, how much has been paid back out as a customer refund. */
  refunded_amount: number;
  /** What is actually still available to allocate or refund: unallocated − refunded. */
  credit_remaining: number;
  allocation_status: PaymentAllocationStatus;
  deposit_account_code: string | null;
  deposit_account_name: string | null;
  reference: string;
  narration: string;
  journal_id: number | null;
  status: string;
}

// An allocation row settles either an invoice or a DEBIT note (both debit AR); the
// pair of keys present distinguishes them.
export interface PaymentAllocationRow {
  invoice?: string;
  invoice_id?: number;
  debit_note?: string;
  debit_note_id?: number;
  amount: ArMoney;
}

export interface PaymentDetail {
  payment: Payment;
  allocations: PaymentAllocationRow[];
  open_invoices: { id: number; document_number: string; due_date: string | null; balance: ArMoney }[];
  open_debit_notes: { id: number; document_number: string; note_date: string | null; balance: ArMoney }[];
  gl_postings: { account_code: string; account_name: string; debit: ArMoney; credit: ArMoney }[];
}

export interface CustomerDetail {
  customer: Customer;
  summary: {
    current_balance: ArMoney; lifetime_paid: ArMoney;
    open_invoice_count: number; account_status: CustomerAccountStatus;
  };
  open_invoices: { document_number: string; invoice_date: string; due_date: string | null; total: ArMoney; balance: ArMoney; status: string }[];
  // Open DEBIT notes are supplementary AR charges, outstanding like an invoice.
  open_debit_notes: { document_number: string; note_date: string | null; total: ArMoney; balance: ArMoney; status: string }[];
  transactions: {
    date: string;
    type: "INVOICE" | "DEBIT_NOTE" | "CREDIT_NOTE" | "PAYMENT" | "REFUND" | "ADJUSTMENT";
    reference: string;
    amount: ArMoney;
    status: string;
  }[];
  statement: { date: string | null; description: string; debit: ArMoney; credit: ArMoney; balance: ArMoney }[];
}

// Fee structures - billing catalogue rolled up into invoices.
export interface FeeItem {
  id: number;
  line_no: number;
  code: string;
  description: string;
  revenue_account_code: string;
  amount: number;
  amount_naira: string;
  tax_code_value: string | null;
  is_optional: boolean;
}

export type FeeAppliesTo = "CUSTOMER" | "VENDOR" | "STAFF" | "GENERAL";

export interface FeeStructureUsage {
  invoices_generated: number;
  last_generated_at: string | null;
}

export interface FeeStructure {
  id: number;
  code: string;
  name: string;
  applies_to: FeeAppliesTo;
  applies_to_display: string;
  description: string;
  is_active: boolean;
  items: FeeItem[];
  total: number;
  total_naira: string;
  tax_total: number;
  tax_total_naira: string;
  total_with_tax: number;
  total_with_tax_naira: string;
  created_at?: string;
  created_by_name?: string | null;
  usage?: FeeStructureUsage | null;
}

/**
 * A submit response: the document, plus whether anybody can actually approve it.
 *
 * Every "submit for approval" endpoint in the product returns this shape. Typed
 * as a bare `ApiEnvelope<Doc>` it silently discards the `approval` block, and
 * with it the only warning that a submission has parked.
 */
export type SubmittedDocument<T> = T & { approval?: ApprovalParkState };

/**
 * One attempt to email a customer document (invoice, receipt or statement).
 *
 * History is per document and includes the automatic copy sent when the document
 * posted, so a reader sees everything that reached the customer, not only what
 * somebody pressed a button for.
 */
export interface DocumentDelivery {
  id: number;
  document_type: "INVOICE" | "RECEIPT" | "STATEMENT";
  document_type_display: string;
  document_id: string;
  document_number: string;
  period_start: string | null;
  period_end: string | null;
  source: "AUTOMATIC" | "MANUAL" | "RETRY";
  source_display: string;
  status: "PENDING" | "SENT" | "FAILED";
  requested_by_name: string;
  recipients: string[];
  recipient_count: number;
  bcc: string[];
  note: string;
  queued_at: string | null;
  sent_at: string | null;
  failure_reason: string;
  can_retry: boolean;
  created_at: string;
}

/** What a send would do, read before anything leaves the building. */
export interface DocumentEmailPreview {
  recipients: string[];
  bcc: string[];
  subject: string;
  can_send: boolean;
  /** Why sending is unavailable, ready to show as-is (blank when it is available). */
  blocked_reason: string;
  deliveries: DocumentDelivery[];
}
