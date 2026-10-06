/**
 * Withholding tax on a supplier payment, worked out the way the server works it out.
 *
 * The server owns the figure (`vs_procurement.payables.resolve_wht`). A payment
 * that sends no `wht_amount` has it computed from the WHT code: the code's rate
 * on the VAT-exclusive part of what is settled, because WHT is due on the value
 * of the supply and not on the VAT charged on it. A payment that sends one keeps
 * it exactly as typed and is marked as entered by hand.
 *
 * So a form shows this preview and sends nothing until the person types over it.
 * Mrs Bello pays a ₦1,075,000 bill (₦1,000,000 plus ₦75,000 VAT) to a supplier on
 * WHT 5%: the form shows ₦50,000 and the server computes the same ₦50,000. If she
 * types ₦45,000 for an exemption certificate, that figure is sent and kept.
 *
 * Each bill contributes its VAT pro rata to the amount allocated from it
 * (`tax_total * amount / total`, half up), and the rate is applied half up to a
 * whole kobo, as every other tax line is. A gateway payout line names a vendor
 * and no bill, so nothing identifies VAT and the base is the whole gross.
 */

/** One bill's share of a settlement: its total, its VAT and the amount allocated from it. */
export interface WhtSettledBill {
  total: number;
  tax_total?: number | null;
  amount: number;
}

/** Round a non-negative kobo figure half up, as the server's ROUND_HALF_UP does. */
const halfUp = (value: number) => Math.floor(value + 0.5);

/** The VAT inside `amount` kobo allocated from a bill. */
function vatShare(bill: WhtSettledBill): number {
  const total = Math.trunc(bill.total || 0);
  const tax = Math.trunc(bill.tax_total || 0);
  if (total <= 0 || !tax) return 0;
  return halfUp((tax * Math.trunc(bill.amount || 0)) / total);
}

/**
 * The WHT the server will compute for a settlement of `gross` kobo at `rateBps`
 * (basis points: 500 is 5%). Zero with no rate; never more than `gross`.
 */
export function computedWht({ gross, rateBps, bills = [] }: {
  gross: number;
  rateBps: number | null | undefined;
  bills?: WhtSettledBill[];
}): number {
  const g = Math.max(0, Math.trunc(gross || 0));
  const rate = Math.trunc(rateBps || 0);
  if (!g || rate <= 0) return 0;
  const vat = bills.reduce((sum, bill) => sum + vatShare(bill), 0);
  const base = Math.max(0, g - vat);
  return Math.min(halfUp((base * rate) / 10000), g);
}

/** How a payment's WHT figure was arrived at, in the words the detail shows. */
export function whtSourceLabel(source: string | null | undefined): string | null {
  if (source === "COMPUTED") return "Worked out from the withholding tax code";
  if (source === "ENTERED") return "Entered by hand";
  return null;
}

/**
 * The withholding tax liability as a posting preview names it, the paired
 * form an accountant reads: the term, then the plain words. Every preview
 * that books withholding tax (a vendor payment, new or posted, and a payout
 * batch) uses this one label, the same one the server gives the account.
 */
export const WHT_PAYABLE_LABEL = "WHT payable (withholding tax)";

/** What a bursar reads beside the amount kept back from a vendor payment. */
export const WHT_KEPT_BACK_LABEL = "Withholding tax kept back";
