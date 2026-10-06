/**
 * The rules a vendor credit note's screens follow, as plain data so they can be
 * tested apart from React.
 */

import type { VendorCreditInstruction, VendorCreditNote } from "@/redux/services/procurement/procurement-types";

/** How a credit note says what it credits. */
export type CreditMode = "full" | "amount" | "lines";

/** What a person typed against one bill line: a quantity, a net amount, or both. */
export interface LineCredit {
  quantity: string;
  net: number;
}

/**
 * The request body's crediting part for `mode`, or null while the form does not
 * yet say enough. By line, a line with neither a quantity nor an amount is left
 * out, and a quantity alone is valued by the server at the bill line's price.
 */
export function creditInstruction(
  mode: CreditMode,
  amount: number,
  lines: Record<number, LineCredit>,
): VendorCreditInstruction | null {
  if (mode === "full") return { full: true };
  if (mode === "amount") return amount > 0 ? { amount } : null;
  const named = Object.entries(lines).flatMap(([id, credit]) => {
    const quantity = Number(credit.quantity);
    const hasQuantity = Number.isFinite(quantity) && quantity > 0;
    const hasNet = credit.net > 0;
    if (!hasQuantity && !hasNet) return [];
    return [{
      invoice_line: Number(id),
      ...(hasQuantity ? { quantity } : {}),
      ...(hasNet ? { net_amount: credit.net } : {}),
    }];
  });
  return named.length ? { lines: named } : null;
}

/**
 * Where a credit note stands, as the actions on it see it: a draft that may be
 * edited and submitted, one waiting for approval, one approved and ready to
 * post, a posted one (whose leftover credit may be applied, and which may be
 * voided), or one already voided.
 */
export type CreditNoteStage = "editable" | "pending" | "approved" | "posted" | "voided";

export function creditNoteStage(note: Pick<VendorCreditNote, "status" | "approval_state">): CreditNoteStage {
  if (note.status === "POSTED") return "posted";
  if (note.status !== "DRAFT") return "voided";
  if (note.approval_state === "APPROVED") return "approved";
  if (note.approval_state === "PENDING") return "pending";
  return "editable";
}

/** The header fields of a credit note edit, as the form holds them. */
export interface CreditNoteHeaderForm {
  noteDate: string;
  reason: string;
  vendorReference: string;
}

/** The header fields of a credit note PATCH. */
export interface CreditNoteHeaderChanges {
  note_date?: string;
  reason?: string;
  vendor_reference?: string;
}

/**
 * Only the header fields the form changed from `saved`. The crediting part is
 * sent beside these only when the reader picked a new way of crediting; left
 * out, the server keeps the draft's lines. The same body corrects a draft and
 * a note an approver sent back.
 */
export function creditNoteHeaderChanges(saved: Pick<VendorCreditNote, "note_date" | "reason" | "vendor_reference">, form: CreditNoteHeaderForm): CreditNoteHeaderChanges {
  const out: CreditNoteHeaderChanges = {};
  if (form.noteDate !== saved.note_date) out.note_date = form.noteDate;
  if (form.reason.trim() !== (saved.reason || "").trim()) out.reason = form.reason.trim();
  if (form.vendorReference.trim() !== (saved.vendor_reference || "").trim()) out.vendor_reference = form.vendorReference.trim();
  return out;
}
