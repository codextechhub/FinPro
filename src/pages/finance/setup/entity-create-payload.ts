import type { CreateEntityPayload } from "@/redux/services/finance/entity-types";

export interface EntityCreateDraft {
  code: string;
  numberCode: string;
  name: string;
  baseCurrency: string;
  fiscalYear: string;
  startMonth: string;
  startDay: string;
  periodFrequency: "MONTHLY" | "QUARTERLY";
}

export function buildEntityCreatePayload(draft: EntityCreateDraft): CreateEntityPayload {
  return {
    code: draft.code.trim().toUpperCase(),
    number_code: draft.numberCode.trim().toUpperCase() || undefined,
    name: draft.name.trim(),
    base_currency: draft.baseCurrency || undefined,
    fiscal_year: draft.fiscalYear ? Number(draft.fiscalYear) : undefined,
    fiscal_start_month: draft.startMonth ? Number(draft.startMonth) : undefined,
    fiscal_start_day: draft.startDay ? Number(draft.startDay) : undefined,
    fiscal_period_frequency: draft.periodFrequency,
  };
}
