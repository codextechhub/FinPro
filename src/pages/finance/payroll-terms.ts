/**
 * The roster's pay terms: today's, and the next dated change.
 *
 * The roster row shows the terms in force on the reader's today, never the
 * latest version. Aisha is on N300,000 with a raise to N320,000 from January
 * 2027: the row reads N300,000 until January, `terms_effective_from` says when
 * today's terms began, and `next_terms` carries the raise and its date. The
 * next change's figures follow the same Field Access read switches as the
 * row's own: a reader who may not see Aisha's gross learns that her pay
 * changes in January, never what it changes to. A next change that moves the
 * person to another branch says so where the school has several branches.
 */

import type { EmployeeSalary } from "@/redux/services/finance/ops-types";

type Words = {
  money: (kobo: number) => string;
  day: (iso: string) => string;
  /** The school runs several branches, so a move between them is worth naming. */
  multiBranch: boolean;
};

const FIGURE_WORDS = [["gross_amount", "gross"], ["paye_amount", "PAYE"], ["pension_amount", "pension"]] as const;

/**
 * "From 1 Jan 2027: N320,000.00 gross", with the move named when the change
 * takes the person to another branch; null when no change is dated ahead.
 * `figures` picks which of the next terms' visible figures to name (the
 * roster names gross only, the record all three).
 */
export function nextTermsLine(
  salary: Pick<EmployeeSalary, "next_terms" | "branch_id">,
  { money, day, multiBranch }: Words,
  figures: readonly ("gross_amount" | "paye_amount" | "pension_amount")[] = ["gross_amount"],
): string | null {
  const next = salary.next_terms;
  if (!next) return null;
  const amounts = FIGURE_WORDS
    .filter(([name]) => figures.includes(name) && typeof next[name] === "number")
    .map(([name, word]) => `${money(next[name] as number)} ${word}`);
  const moves = multiBranch && next.branch_id != null && next.branch_id !== salary.branch_id && next.branch_name;
  const parts = [...amounts, ...(moves ? [`at ${next.branch_name}`] : [])];
  return parts.length
    ? `From ${day(next.effective_from)}: ${parts.join(", ")}`
    : `New pay terms from ${day(next.effective_from)}`;
}

/**
 * When the terms shown took effect: "Since 1 Sep 2026", or "Starts on 3 Nov
 * 2026" for a hire who has not started yet. Null for a row with no history.
 */
export function termsSinceLine(
  salary: Pick<EmployeeSalary, "terms_effective_from">,
  { day, today }: { day: (iso: string) => string; today: string },
): string | null {
  const from = salary.terms_effective_from;
  if (!from || from <= "1900-01-01") return null;
  return from > today ? `Starts on ${day(from)}` : `Since ${day(from)}`;
}
