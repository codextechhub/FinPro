import type { TaxCode } from "@/redux/services/finance/setup-types";

export type TaxCodeUsage = "any" | "sales" | "purchase";

/** Whether a tax code has the active GL mapping required by the document side. */
export function taxCodeSupportsUsage(
  tax: Pick<TaxCode, "is_active" | "rate_bps" | "is_recoverable" | "collected_account" | "paid_account">,
  usage: TaxCodeUsage,
) {
  if (usage === "any") return true;
  if (!tax.is_active) return false;
  if (tax.rate_bps === 0) return true;
  if (usage === "sales") return !!tax.collected_account;
  return tax.is_recoverable && !!tax.paid_account;
}
