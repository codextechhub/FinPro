/**
 * How a line is treated for VAT, in the words a bursar and a parent read.
 *
 * The treatment lives on the tax code: only a standard-rated code charges tax,
 * at its rate; zero-rated and exempt codes charge nothing and the server holds
 * their rate at zero. A fee item saved with no tax code is given the school's
 * exempt VAT code, so every fee line states its treatment, and a line from a
 * server that names no code at all is read as exempt too.
 */

import type { TaxCode, TaxTreatment } from "@/redux/services/finance/setup-types";

export const TAX_TREATMENTS: [TaxTreatment, string][] = [
  ["STANDARD", "Standard rated"],
  ["ZERO_RATED", "Zero rated"],
  ["EXEMPT", "Exempt"],
];

/** The plain label for a treatment, with the rate for a standard-rated code. */
export function treatmentLabel(treatment: TaxTreatment | undefined, rateBps = 0): string {
  if (treatment === "ZERO_RATED") return "Zero rated";
  if (treatment === "EXEMPT") return "Exempt";
  if (treatment === "STANDARD") return `Standard ${Number((rateBps / 100).toFixed(2))}%`;
  return rateBps > 0 ? `${Number((rateBps / 100).toFixed(2))}%` : "Exempt";
}

/**
 * The treatment of a line carrying tax code `code`, read from the school's codes.
 *
 * No code reads as exempt. A code the list does not know (an older server, or a
 * code retired since) is named as it is rather than guessed at.
 */
export function lineTreatment(code: string | null | undefined, codes: TaxCode[]): string {
  if (!code) return "Exempt";
  const tax = codes.find((c) => c.code === code);
  if (!tax) return code;
  return treatmentLabel(tax.treatment, tax.rate_bps);
}
