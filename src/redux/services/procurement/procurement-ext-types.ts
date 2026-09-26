/**
 * Procurement analytics report shapes (§7.5). Money fields are the backend's
 * `{kobo, naira}` pair (same as the vs_finance reports) - read `.kobo`.
 *
 * Branch-scoped reports: when the caller is bound to a branch the backend answers
 * under that branch and adds `unassigned_excluded_count` - how many documents of the
 * report's population sit at entity level (no branch, typically raised before the
 * column existed) and are therefore outside the caller's figures. It is a COUNT, never
 * an amount, because an amount would disclose another scope's spend. The key is ABSENT
 * (not null) for an unbound caller and for a tenant with no branches, so `undefined`
 * means "these figures are the whole story" - hence the optional field, not `| null`.
 */

import type { DashboardWindow, ReportMoney } from "../finance/reports-types";

export type ProcurementApprovalAction = "APPROVED" | "REJECTED" | "RETURNED";

export interface ProcurementApprovalRow {
  id: string;
  document_type: string;
  document_type_label: string;
  document_id: number;
  reference: string;
  title: string;
  requester: string;
  amount: number;
  currency: string;
  submitted_at: string | null;
  awaiting_since: string | null;
  stage: string;
  status: string;
  on_behalf_of: string | null;
}

export interface ProcurementApprovalStageAction {
  id: string;
  action: ProcurementApprovalAction;
  actor: string;
  on_behalf_of: string | null;
  comment: string;
  acted_at: string;
  attempt: number;
  is_reversal: boolean;
  reversed_at: string | null;
}

export interface ProcurementApprovalStage {
  id: string;
  label: string;
  status: string;
  on_rejection: "TERMINAL" | "RETURN_TO_REQUESTER";
  advance_rule: "ANY" | "QUORUM" | "UNANIMOUS";
  quorum_count: number | null;
  eligible_count: number;
  activated_at: string | null;
  resolved_at: string | null;
  skip_reason: string;
  attempt: number;
  actions: ProcurementApprovalStageAction[];
}

export interface ProcurementApprovalDetail extends ProcurementApprovalRow {
  document_status: string;
  approval_state: string;
  next_stage: { label: string | null; is_final: boolean } | null;
  stages: ProcurementApprovalStage[];
  activity: {
    id: string;
    event_type: string;
    actor: string | null;
    message: string;
    occurred_at: string;
  }[];
}

/** One stage of the purchase-to-payment pipeline: how many, how much, and its flagged few. */
export interface ProcurementPipelineStage {
  count: number;
  amount: ReportMoney;
  /** Stage-specific: not yet approved, closing soon, part received, over 30 days, late, vendors paid. */
  flag: number;
  flag_days?: number;
}

/**
 * The Procurement overview as one reader may see it.
 *
 * The endpoint opens to anyone working in procurement and computes each block
 * only for a reader who holds the key behind it, so a block may be `null` and a
 * pipeline stage may be missing. The approval queue is the reader's own and
 * always present. `narrowed` says the figures cover only the reader's branches.
 * `window` is the span spend, categories, top vendors and paid read, by date.
 */
export interface ProcurementDashboard {
  entity: string;
  currency: string;
  books: "school" | "general";
  reader_first_name: string | null;
  as_of: string;
  month_start: string;
  narrowed: boolean;
  window: DashboardWindow;
  windows: { key: string; label: string; name: string }[];
  kpis: {
    spend: { value: ReportMoney; prior_value: ReportMoney | null; delta_pct: number | null } | null;
    open_purchase_orders: { count: number; partial_count: number; amount: ReportMoney } | null;
    pending_approvals: { count: number; amount: ReportMoney; slow_count: number; type_count: number };
    overdue_invoices: { count: number; amount: ReportMoney; oldest_days: number | null } | null;
    active_vendors: { count: number; on_hold_count: number; first_time_count: number } | null;
  };
  pipeline: Partial<Record<
    "requisitions" | "rfqs" | "orders" | "received_not_billed" | "bills" | "paid", ProcurementPipelineStage
  >>;
  /** Twelve months from the fiscal year's start, in kobo; `current` is today's month, if in the year. */
  committed_vs_spent: { labels: string[]; current: number | null; committed: number[]; spent: number[] } | null;
  spend_by_category: {
    total: ReportMoney;
    items: { key: string; label: string; amount: ReportMoney }[];
  } | null;
  top_vendors: { key: string; name: string; amount: ReportMoney; bills: number }[] | null;
  /** Only the controls with something in them. */
  exceptions: {
    key: "match_failed" | "price_variance" | "vendor_on_hold" | "unbilled_receipts";
    count: number;
    amount: ReportMoney;
    detail?: string;
    days?: number;
  }[] | null;
  bills_due: { items: { key: "current" | "1-30" | "31-60" | "over-60"; amount: ReportMoney }[] } | null;
  /** `ordered` is null for a reader who sees only some branches. */
  contracts_ending: {
    id: number;
    title: string;
    vendor: string;
    end_date: string;
    days: number;
    value: ReportMoney;
    ordered: ReportMoney | null;
  }[] | null;
  recent_activity: {
    id: number;
    action: string;
    label: string;
    summary: string;
    reference: string;
    actor: string;
    occurred_at: string;
  }[] | null;
  approvals_awaiting_user: {
    workflow_id: string;
    document_type: string;
    document_id: number;
    reference: string;
    title: string;
    requester: string;
    amount: ReportMoney;
    stage: string;
    awaiting_since: string | null;
    on_behalf_of: string | null;
  }[];
}

export interface ApAgingRow {
  vendor_id: number;
  code: string;
  name: string;
  payment_terms: string;   // vendor's net terms enum (e.g. "NET_30"); "" when unset
  buckets: Record<string, ReportMoney>;
  outstanding: ReportMoney;
  /** Paid ahead of a bill: sits in the vendor-advance asset, not in AP. */
  unallocated_credit: ReportMoney;
  net: ReportMoney;
}
export interface ApAging {
  entity: string;
  as_of: string;
  buckets: string[];
  rows: ApAgingRow[];
  bucket_totals: Record<string, ReportMoney>;
  /** What we owe: the figure the AP control account reconciles to. */
  total_outstanding: ReportMoney;
  /** Paid ahead of a bill: held in the vendor-advance asset, not netted off AP. */
  total_unallocated_credit: ReportMoney;
  /** outstanding - advances: the vendor's overall position, not a payable. */
  total_net: ReportMoney;
  /** Entity-level bills left out of a branch-bound caller's figures; absent when unbound. */
  unassigned_excluded_count?: number;
}

export interface ApReconciliation {
  entity: string;
  subledger_total: ReportMoney;
  control_total: ReportMoney;
  difference: ReportMoney;
  is_reconciled: boolean;
}

export interface GrirBalance {
  entity: string;
  grir_balance: ReportMoney;
  is_clear: boolean;
}

// GR/IR aging - per-GRN open positions (received-not-invoiced when open_value>0,
// invoiced-not-received when <0). Rows with open_value==0 are excluded server-side.
export interface GrirAgingRow {
  grn_id: number;
  reference: string;
  vendor_code: string;
  vendor_name: string;
  received_date: string;
  days: number;
  bucket: string;
  received_value: ReportMoney;
  invoiced_value: ReportMoney;
  open_value: ReportMoney;
}
export interface GrirAging {
  entity: string;
  as_of: string;
  buckets: string[];
  rows: GrirAgingRow[];
  bucket_totals: Record<string, ReportMoney>;
  total_open: ReportMoney;
  // Both come from the general ledger, which carries no branch, so a branch-bound
  // caller is sent null rather than a GL total compared against a branch-only receipt
  // walk - that comparison would report a fake discrepancy on every read. NULL IS NOT
  // ZERO: never feed these through `kobo()`, which would turn a withheld figure into a
  // reconciled 0. The entity-wide control stays on the GR/IR balance endpoint.
  control_balance: ReportMoney | null;
  difference: ReportMoney | null;
  /** Entity-level goods receipts left out of a branch-bound caller's figures; absent when unbound. */
  unassigned_excluded_count?: number;
}

// AP cash-requirements forecast - open bills bucketed by days-until-due.
export interface ApCashRequirementsRow {
  vendor_id: number;
  code: string;
  name: string;
  buckets: Record<string, ReportMoney>;
  total: ReportMoney;
}
export interface ApCashRequirements {
  entity: string;
  as_of: string;
  buckets: string[];
  rows: ApCashRequirementsRow[];
  bucket_totals: Record<string, ReportMoney>;
  total_due: ReportMoney;
}

// Spend group row - the backend always emits key/label/net/tax/gross/invoice_count.
export interface SpendRow {
  key: string;
  label: string;
  net: ReportMoney;
  tax: ReportMoney;
  gross: ReportMoney;
  invoice_count: number;
}
export interface SpendPeriod {
  period: string;   // "YYYY-MM"
  label: string;    // "Mon YYYY"
  gross: ReportMoney;
  invoice_count: number;
}
export interface SpendAnalysis {
  entity: string;
  start_date: string | null;
  end_date: string | null;
  by_vendor: SpendRow[];
  by_category: SpendRow[];
  by_period: SpendPeriod[];
  total_net: ReportMoney;
  total_tax: ReportMoney;
  total_gross: ReportMoney;
  invoice_count: number;
  /** Entity-level bills left out of a branch-bound caller's figures; absent when unbound. */
  unassigned_excluded_count?: number;
}

// Latest recorded scorecard summary carried on each performance row (or null).
export interface LatestAssessment {
  quality_acceptance: number;
  invoice_accuracy: number;
  responsiveness: number;
  overall_score: number;
  grade: "A" | "B" | "C";
  assessment_date: string;
}
export interface VendorPerformanceRow {
  vendor_id: number;
  code: string;
  name: string;
  category: string;   // vendor's category name (table subtitle); "" when uncategorised
  po_count: number;
  total_ordered: ReportMoney;
  receipt_count: number;
  on_time_receipts: number;
  late_receipts: number;
  // null when the vendor has no rated receipts (no PO expected-date to judge against).
  on_time_rate: number | null;
  invoice_count: number;
  total_billed: ReportMoney;
  payment_count: number;
  total_paid: ReportMoney;
  // null when the vendor has no settling payments in the window.
  avg_payment_days: number | null;
  // Most-recent point-in-time assessment for this vendor, or null when never assessed.
  latest_assessment: LatestAssessment | null;
}
export interface VendorPerformance {
  entity: string;
  start_date: string | null;
  end_date: string | null;
  rows: VendorPerformanceRow[];
  // The excluded population here is the bill population - billing is the report's
  // headline and its row sort key - so the count reads as bills, like AP aging's.
  /** Entity-level bills left out of a branch-bound caller's figures; absent when unbound. */
  unassigned_excluded_count?: number;
}

// Full vendor assessment record (list item + create response).
export interface VendorAssessment {
  id: number;
  vendor_id: number;
  vendor_code: string;
  vendor_name: string;
  assessment_date: string;
  assessor: string | null;
  on_time_delivery: number;
  quality_acceptance: number;
  invoice_accuracy: number;
  responsiveness: number;
  overall_score: number;
  grade: "A" | "B" | "C";
  notes: string;
}
export interface VendorAssessmentInput {
  entity: string;
  vendor: string;
  on_time_delivery: number;
  quality_acceptance: number;
  invoice_accuracy: number;
  responsiveness: number;
  assessment_date?: string;
  notes?: string;
}

// AP-aging drawer: one vendor's aging buckets + open bills.
export interface ApVendorOpenBill {
  invoice_id: number;
  document_number: string;
  invoice_date: string;
  due_date: string | null;
  days_overdue: number;
  bucket: string;
  balance_due: ReportMoney;
  payment_status: string;
}
export interface ApVendorDetail {
  entity: string;
  as_of: string;
  buckets: string[];
  vendor: { id: number; code: string; name: string };
  bucket_amounts: Record<string, ReportMoney>;
  outstanding: ReportMoney;
  /** Paid ahead of a bill: sits in the vendor-advance asset, not in AP. */
  unallocated_credit: ReportMoney;
  net: ReportMoney;
  invoices: ApVendorOpenBill[];
}

// GR/IR at the PO-line grain - ordered vs received vs invoiced per PO line, with a
// derived status. Quantities are decimal strings (exact); values are `{kobo, naira}`.
export interface GrirPoLineRow {
  po_line_id: number;
  po_line_ref: string;   // "<PO document_number>-<line_no>"
  item: string;
  vendor_code: string;
  vendor_name: string;
  ordered_qty: string;
  received_qty: string;
  invoiced_qty: string;
  received_value: ReportMoney;
  invoiced_value: ReportMoney;
  grir_balance: ReportMoney;
  status: string;   // "Cleared" | "Received > Invoiced" | "Invoiced > Received"
}
export interface GrirPoLines {
  entity: string;
  as_of: string;
  rows: GrirPoLineRow[];
}

// GR/IR PO-line drawer: reconciliation + the line's linked POSTED GRNs and invoices.
export interface GrirPoLineDetail {
  entity: string;
  po_line_id: number;
  po_line_ref: string;
  item: string;
  vendor_code: string;
  vendor_name: string;
  po_number: string;
  ordered_qty: string;
  received_qty: string;
  invoiced_qty: string;
  received_value: ReportMoney;
  invoiced_value: ReportMoney;
  grir_balance: ReportMoney;
  status: string;
  unit_price: ReportMoney;
  grns: { id: number; reference: string; received_date: string; accepted_qty: string; value: ReportMoney }[];
  invoices: { id: number; document_number: string; invoice_date: string; quantity: string; net: ReportMoney }[];
}

// GR/IR drawer: one GRN's reconciliation + linked documents.
export interface GrirGrnDetail {
  entity: string;
  grn_id: number;
  reference: string;
  vendor_code: string;
  vendor_name: string;
  received_date: string;
  days: number;
  bucket: string;
  po_number: string | null;
  received_value: ReportMoney;
  invoiced_value: ReportMoney;
  open_value: ReportMoney;
  invoices: { id: number; document_number: string; invoice_date: string; net: ReportMoney }[];
}

export interface SettlementReconciliation {
  unmatched_bank_total?: number;
  unmatched_bank_count?: number;
  [k: string]: unknown;
}
