/**
 * Correcting a direct entry: the form a saved journal opens with, and the body
 * of the correction.
 *
 * Only what changed is sent. The lines go whole when any of them changed,
 * because the server replaces every line from the body; left out, they stay as
 * they are. The branch and the kind of entry are what it was raised as and are
 * never sent.
 */

import type { DirectEntryChanges, DirectEntryLine, JournalDetail } from "@/redux/services/finance/gl-types";

/** One line on the form: an account code, an amount on one side, and its tags. */
export interface DirectEntryRow {
  account: string;
  amountKobo: number;
  side: "debit" | "credit";
  costCenter: string;
  dimensions: Record<string, string>;
}

/** The form's header fields. */
export interface DirectEntryForm {
  date: string;
  narration: string;
  reference: string;
  rows: DirectEntryRow[];
}

/** The lines worth sending: an account and an amount each. */
export function directEntryLines(rows: readonly DirectEntryRow[]): DirectEntryLine[] {
  return rows.filter((r) => r.amountKobo > 0 && r.account.trim()).map((r) => {
    const dimensions = Object.fromEntries(Object.entries(r.dimensions).filter(([, v]) => v));
    return {
      account: r.account.trim(),
      debit: r.side === "debit" ? r.amountKobo : 0,
      credit: r.side === "credit" ? r.amountKobo : 0,
      ...(r.costCenter ? { cost_center: r.costCenter } : {}),
      ...(Object.keys(dimensions).length ? { dimensions } : {}),
    };
  });
}

/** The form a saved journal opens with. */
export function directEntryForm(j: JournalDetail): DirectEntryForm {
  return {
    date: j.date ?? "",
    narration: j.narration ?? "",
    reference: j.reference ?? "",
    rows: j.lines.map((l) => ({
      account: l.account_code,
      amountKobo: l.debit || l.credit,
      side: l.debit ? "debit" : "credit",
      costCenter: l.cost_center ?? "",
      dimensions: { ...(l.dimensions ?? {}) },
    })),
  };
}

/** Only what the form changed from the saved journal. */
export function directEntryChanges(saved: JournalDetail, form: DirectEntryForm): DirectEntryChanges {
  const was = directEntryForm(saved);
  const out: DirectEntryChanges = {};
  if (form.date !== was.date) out.date = form.date;
  if (form.narration.trim() !== was.narration.trim()) out.narration = form.narration.trim();
  if (form.reference.trim() !== was.reference.trim()) out.reference = form.reference.trim();
  const lines = directEntryLines(form.rows);
  if (JSON.stringify(lines) !== JSON.stringify(directEntryLines(was.rows))) out.lines = lines;
  return out;
}
