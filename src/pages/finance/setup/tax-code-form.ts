import type { TaxCode, TaxTreatment } from "@/redux/services/finance/setup-types";

/**
 * The tax code form's values and the body it sends.
 *
 * The treatment is always sent. The server's upsert sets the treatment it is
 * given and reads a missing one as standard rated, so an edit that left it out
 * would turn the school's exempt VAT code into a standard one. A zero-rated or
 * exempt code charges nothing, so its rate is sent as zero whatever was typed.
 */
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
