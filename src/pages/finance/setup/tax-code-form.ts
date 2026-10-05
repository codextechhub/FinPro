/**
 * The tax code form's values and the upsert it sends.
 *
 * A code's VAT treatment travels on every save. The server reads a missing
 * treatment as Standard, so a form that left it out turned VAT-EXEMPT into a
 * standard code the first time somebody renamed it. Only a standard code
 * carries a rate: an exempt or zero-rated code charges no tax, so its rate is
 * sent as 0 and the server refuses anything else. The treatments and their
 * labels are `utils/tax-treatment.ts`, shared with the fee and invoice lines.
 */

import type { TaxCode, TaxTreatment } from "@/redux/services/finance/setup-types";

export interface TaxCodeFormValues {
  code: string;
  name: string;
  treatment: TaxTreatment;
  percentage: string;
  recoverable: boolean;
  collectedAccount: string;
  paidAccount: string;
  active: boolean;
}

export const taxCodeFormValues = (taxCode: TaxCode | null): TaxCodeFormValues => ({
  code: taxCode?.code ?? "",
  name: taxCode?.name ?? "",
  treatment: taxCode?.treatment ?? "STANDARD",
  percentage: taxCode ? String(taxCode.rate_bps / 100) : "",
  recoverable: taxCode?.is_recoverable ?? true,
  collectedAccount: taxCode?.collected_account ?? "",
  paidAccount: taxCode?.paid_account ?? "",
  active: taxCode?.is_active ?? true,
});

/** Why a code that is not standard shows no rate: "An exempt code ..." or "A zero-rated code ...". */
export function zeroRateHint(treatment: TaxTreatment): string {
  return treatment === "EXEMPT"
    ? "An exempt code charges no tax, so its rate is 0."
    : "A zero-rated code charges no tax, so its rate is 0.";
}

/** Whether the values may be sent: a rate only on a standard code. */
export function taxCodeFormValid(values: TaxCodeFormValues): boolean {
  if (!values.code.trim() || !values.name.trim()) return false;
  if (values.treatment !== "STANDARD") return true;
  return values.percentage !== "" && Number(values.percentage) >= 0;
}

export const taxCodeUpsertPayload = (entity: string, values: TaxCodeFormValues) => ({
  entity,
  code: values.code.trim().toUpperCase(),
  name: values.name.trim(),
  treatment: values.treatment,
  rate_bps: values.treatment === "STANDARD" ? Math.round(Number(values.percentage) * 100) : 0,
  is_recoverable: values.recoverable,
  collected_account: values.collectedAccount || undefined,
  paid_account: values.paidAccount || undefined,
  is_active: values.active,
});
