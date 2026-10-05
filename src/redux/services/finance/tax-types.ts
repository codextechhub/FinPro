/**
 * A tax return as the server reads it whole: its branch shares, the late items
 * it declares and the payments made against it. Mirrors
 * `vs_finance.serializers.TaxFilingSerializer`. A branch-bound reader is sent
 * only their own branches' shares, payments and late items, with every total
 * recomputed from them.
 */

import type { TaxFiling } from "./ops-types";

/** One branch's part of a return. `branch_pending` marks lines with no branch yet. */
export interface TaxFilingShare {
  id: number;
  branch_id: number | null;
  branch_name: string | null;
  branch_pending: boolean;
  /** "Ikeja", "No branch yet", or "All" for a return filed as a whole. */
  label: string;
  gross_liability: number;
  recoverable_amount: number;
  brought_forward_credit: number;
  adjustment_amount: number;
  amount_due: number;
  amount_paid: number;
  balance_due: number;
  carried_forward_credit: number;
  payment_status: string;
  line_count: number;
  filing_journal_id: number | null;
}

/** One payment of a share, and whether it was reversed. */
export interface TaxRemittance {
  id: number;
  share_id: number | null;
  branch_id: number | null;
  branch_name: string | null;
  bank_account_id: number;
  bank_account_name: string;
  pay_date: string;
  amount: number;
  journal_id: number | null;
  is_reversed: boolean;
  reversed_at: string | null;
  reversal_journal_id: number | null;
  reversal_reason: string;
}

/** Figures for one month's late lines, overall or for one branch. */
export interface TaxLateFigures {
  gross: number;
  recoverable: number;
  net: number;
  line_count: number;
}

/**
 * Source lines dated in an earlier month that this return declares because
 * they were recorded after that month's return. `label` reads "from
 * September"; `branches` is keyed by branch id as a string ("" for no branch).
 */
export interface TaxLateItem extends TaxLateFigures {
  month: string;
  label: string;
  branches: Record<string, TaxLateFigures>;
}

export interface TaxFilingDetail extends TaxFiling {
  brought_forward_credit: number;
  carried_forward_credit: number;
  declared_line_count: number;
  late_line_count: number;
  late_items: TaxLateItem[];
  branch_breakdown: TaxFilingShare[];
  remittances: TaxRemittance[];
  filing_journal_id: number | null;
}
