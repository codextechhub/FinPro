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
  /** True once the person who raised it has left the school; null when nobody is named. */
  created_by_is_exited?: boolean | null;
  /** Where its approval stands: NOT_SUBMITTED, PENDING, APPROVED or REJECTED. */
  approval_state?: string;
  /** True while an approver has handed it back to whoever sent it (a DRAFT still PENDING). */
  approval_returned?: boolean;
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
  /** The latest approval request, null before it is first sent; absent from an older server. */
  workflow_instance_id?: string | number | null;
  lines: JournalLine[];
  total_debit: number;
  total_credit: number;
  reverses_id: number | null;
  reversal_action:
    | { kind: "REVERSE_JOURNAL" }
    /**
     * The document that owns the journal and is undone on its own screen. The
     * server names more kinds than any one screen handles (customer documents,
     * supplier documents, bank documents, inter-branch and petty-cash ones), so
     * a reader of this field must treat an unknown kind as "no button".
     */
    | { kind: "VOID_DOCUMENT"; document_type: string; document_id: number; document_number: string }
    | SourceDocumentAction;
}

/**
 * A document that owns a journal but is not undone from it. Most name only the
 * document. A goods return also names itself (`document_id`) and the receipt
 * it came off, and says how it is corrected (`correction` `RECEIVE_AGAIN`:
 * goods sent back in error are received again on a new receipt), in words for
 * the reader (`correction_message`).
 */
export interface SourceDocumentAction {
  kind: "SOURCE_DOCUMENT_ACTION";
  document_type: string;
  document_number: string;
  document_id?: number;
  receipt?: { document_type: string; document_id: number; document_number: string };
  correction?: string;
  correction_message?: string;
}

export interface JournalListParams {
  entity: string;
  page?: number;
  status?: JournalStatus;
  /** "returned" keeps only journals an approver sent back to whoever sent them. */
  approval?: "returned";
  source?: JournalSource;
  date_from?: string;
  date_to?: string;
  search?: string;
  /** Journals dated in an archived fiscal year are left out unless this asks for them. */
  include_archived?: "true";
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

/** A direct entry's correction: each part optional, `lines` replacing every line. */
export interface DirectEntryChanges {
  date?: string;
  narration?: string;
  reference?: string;
  lines?: DirectEntryLine[];
}

export interface DirectEntryPayload {
  entity: string;
  /** The branch the entry is for, where the reader must name one. */
  branch?: number;
  date?: string;
  narration?: string;
  reference?: string;
  lines: DirectEntryLine[];
}
