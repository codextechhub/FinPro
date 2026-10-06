/**
 * Correcting a credit or debit note: what the form may change, and the body it
 * sends.
 *
 * A note stays on its customer, its invoice, its kind and its branch; a
 * correction changes its date, reason and reference, and, for a note of one
 * line (as the Issue note form raises them), that line's account, amount and
 * cost centre. Only what changed is sent. A changed line goes as the note's
 * whole line list, since the server replaces every line from it and prices
 * them again; a note of several lines keeps its lines.
 */

import type { CreditNote } from "@/redux/services/finance/ar-types";

/** The form's fields. `account` is a revenue account code; `costCenter` "" for none. */
export interface CreditNoteCorrection {
  date: string;
  reason: string;
  reference: string;
  account: string;
  amount: number;
  costCenter: string;
}

/** The PATCH body's fields. */
export interface CreditNoteChanges {
  note_date?: string;
  reason?: string;
  reference?: string;
  lines?: Record<string, unknown>[];
}

/** Whether the note's line can be corrected here: it has exactly one. */
export const singleLine = (note: CreditNote) => note.lines.length === 1;

/** The form a saved note opens with. */
export function creditNoteCorrection(note: CreditNote): CreditNoteCorrection {
  const line = singleLine(note) ? note.lines[0] : null;
  return {
    date: note.note_date ?? "",
    reason: note.reason ?? "",
    reference: note.reference ?? "",
    account: line?.revenue_account ?? "",
    amount: line ? Math.round(Number(line.quantity) * line.unit_price) : note.subtotal,
    costCenter: line?.cost_center ?? "",
  };
}

/** Only what the form changed from the saved note. */
export function creditNoteChanges(note: CreditNote, form: CreditNoteCorrection): CreditNoteChanges {
  const was = creditNoteCorrection(note);
  const out: CreditNoteChanges = {};
  if (form.date !== was.date) out.note_date = form.date;
  if (form.reason.trim() !== was.reason.trim()) out.reason = form.reason.trim();
  if (form.reference.trim() !== was.reference.trim()) out.reference = form.reference.trim();
  const line = singleLine(note) ? note.lines[0] : null;
  if (line && (form.account !== was.account || form.amount !== was.amount || form.costCenter !== was.costCenter)) {
    out.lines = [{
      revenue_account: form.account,
      description: line.description,
      quantity: 1,
      unit_price: form.amount,
      ...(line.tax_code ? { tax_code: line.tax_code } : {}),
      ...(form.costCenter ? { cost_center: form.costCenter } : {}),
    }];
  }
  return out;
}

/** Why the form cannot be saved yet, or null. The line is checked only where it is corrected here. */
export function creditNoteCorrectionProblem(form: CreditNoteCorrection, lineEditable: boolean): string | null {
  if (!form.date) return "Choose the date.";
  if (!form.reason.trim()) return "Say why.";
  if (lineEditable && !form.account) return "Choose the account.";
  if (lineEditable && form.amount <= 0) return "Enter an amount above zero.";
  return null;
}
