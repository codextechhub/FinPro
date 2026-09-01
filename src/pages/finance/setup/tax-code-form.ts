import type { TaxCode } from "@/redux/services/finance/setup-types";

export interface TaxCodeFormValues {
  code: string;
  name: string;
  percentage: string;
  recoverable: boolean;
  collectedAccount: string;
  paidAccount: string;
  active: boolean;
}

export const taxCodeFormValues = (taxCode: TaxCode | null): TaxCodeFormValues => ({
  code: taxCode?.code ?? "",
  name: taxCode?.name ?? "",
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
  rate_bps: Math.round(Number(values.percentage) * 100),
  is_recoverable: values.recoverable,
  collected_account: values.collectedAccount || undefined,
  paid_account: values.paidAccount || undefined,
  is_active: values.active,
});
