/**
 * The words the payables and purchasing lists use for each state, shared by a
 * list's status tabs, its row pills and its drawer.
 *
 * A tab and a pill that name a state their own way read as two states: the
 * "Under Review" tab listing bills that wear "Pending Approval", or the
 * "Partially Received" tab listing orders that wear "Partial". Each tab's
 * label here is the word its rows' pills show, which the tests hold.
 *
 * A vendor bill or credit note undone by Void reads "Voided"; a vendor
 * payment undone by Reverse keeps the pill's own "Reversed".
 */

import {
  APPROVAL_STATE_WORDS, DOCUMENT_STATUS_WORDS, PAYMENT_PROGRESS_WORDS, statusWord,
} from "@/components/finance-ui/status-words";

/** A vendor bill's states: its lifecycle, then the list's headline overlay (display_status). */
export const VENDOR_INVOICE_WORDS: Readonly<Record<string, string>> = {
  ...DOCUMENT_STATUS_WORDS,
  ...PAYMENT_PROGRESS_WORDS,
  REJECTED: APPROVAL_STATE_WORDS.REJECTED,
  OVERDUE: "Overdue",
  DISPUTED: "Disputed",
};

/** The vendor bill list's status tabs as [label, status]. */
export const VENDOR_INVOICE_TABS: readonly (readonly [string, string])[] = [
  ["All", ""],
  ...(["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED", "OVERDUE", "DISPUTED", "PARTIAL", "PAID"] as const)
    .map((code) => [VENDOR_INVOICE_WORDS[code], code] as const),
];

/** The vendor credit note list's status tabs. */
export const VENDOR_CREDIT_NOTE_TABS: readonly { value: string; label: string }[] = [
  { value: "", label: "All" },
  ...(["DRAFT", "POSTED", "REVERSED"] as const).map((code) => ({ value: code, label: DOCUMENT_STATUS_WORDS[code] })),
];

/**
 * A purchase order's states (display_status). It keeps "Pending Approval",
 * the word its tab, its approval queue and the school's guides already share;
 * a part-received order reads "Partly received" on its tab and its rows.
 */
export const PURCHASE_ORDER_WORDS: Readonly<Record<string, string>> = {
  PARTIAL: "Partly received",
};

/** The purchase order list's status tabs. */
export const PURCHASE_ORDER_TABS: readonly { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIAL", label: PURCHASE_ORDER_WORDS.PARTIAL },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "DRAFT", label: "Draft" },
];

/** A vendor bill's word for `status`, or undefined for the pill's own label. */
export const vendorInvoiceWord = (status: string | null | undefined) => statusWord(status, VENDOR_INVOICE_WORDS);

/** A vendor credit note's word for `status`. */
export const vendorCreditNoteWord = (status: string | null | undefined) => statusWord(status, DOCUMENT_STATUS_WORDS);

/** A purchase order's word for `status`. */
export const purchaseOrderWord = (status: string | null | undefined) => statusWord(status, PURCHASE_ORDER_WORDS);

/** A procurement document's approval overlay (approval_state). */
export const approvalStateWord = (state: string | null | undefined) => statusWord(state, APPROVAL_STATE_WORDS);
