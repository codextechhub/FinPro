// General Ledger types - mirror vs_finance JournalEntry/JournalLine serializers
// + the Direct Entry write serializer. All money is integer kobo.

import type { JournalLineView } from "@/components/finance-ui/journal-table";

export type JournalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "REVERSED" | "CANCELLED";
export type JournalSource =
  | "MANUAL" | "SALES" | "PURCHASE" | "BANK" | "PAYROLL" | "CLOSING" | "OPENING" | "FX" | "SYSTEM";

/** JournalEntryListSerializer. */
export interface JournalListItem {
  id: number;
  document_number: string;
  date: string;
  period: string | null;
  source: JournalSource;
  status: JournalStatus;
  narration: string;
  reference: string;
  posted_at: string | null;
  total_debit: number;
  created_by: string;
  created_by_id: number | null;
}

export interface JournalSummary {
  total: number;
  by_status: Partial<Record<JournalStatus, number>>;
  posted_total: { kobo: number; naira: string };
  reversed_total: { kobo: number; naira: string };
}

/** JournalLineSerializer (debit/credit are kobo). */
export interface JournalLine extends JournalLineView {
  id: number;
  line_no: number;
  account_id: number;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  debit_naira: string;
  credit_naira: string;
  description: string | null;
  cost_center: string | null;
  dimensions: Record<string, string>; // analytical axis → value, e.g. { FUND: "GRANT-A" }
}

/** JournalEntryDetailSerializer. */
export interface JournalDetail extends JournalListItem {
  lines: JournalLine[];
  total_debit: number;
  total_credit: number;
  reverses_id: number | null;
  reversal_action:
    | { kind: "REVERSE_JOURNAL" }
    | { kind: "VOID_DOCUMENT"; document_type: "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "REFUND" | "CONCESSION"; document_id: number; document_number: string }
    | { kind: "SOURCE_DOCUMENT_ACTION"; document_type: string; document_number: string };
}

export interface JournalListParams {
  entity: string;
  page?: number;
  status?: JournalStatus;
  source?: JournalSource;
  date_from?: string;
  date_to?: string;
  search?: string;
}

/** One Direct Entry line: an account code with a one-sided kobo amount, and an
 *  optional cost-centre code carried onto the GL line (P&L lines only; the contra
 *  leg is usually left unallocated). */
export interface DirectEntryLine {
  account: string;
  debit: number;
  credit: number;
  cost_center?: string;
  dimensions?: Record<string, string>; // analytical axis → value (each an allowed value)
}

export interface DirectEntryPayload {
  entity: string;
  date?: string;
  narration?: string;
  reference?: string;
  lines: DirectEntryLine[];
}
