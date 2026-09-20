import type { CostCenter } from "@/redux/services/finance/setup-types";

export interface CostCenterFormValues {
  code: string;
  name: string;
  parent: string;
  active: boolean;
}

export const costCenterFormValues = (
  costCenter: CostCenter | null,
): CostCenterFormValues => ({
  code: costCenter?.code ?? "",
  name: costCenter?.name ?? "",
  parent: costCenter?.parent_code ?? "",
  active: costCenter?.is_active ?? true,
});

export const costCenterUpsertPayload = (
  entity: string,
  values: CostCenterFormValues,
) => ({
  entity,
  code: values.code.trim().toUpperCase(),
  name: values.name.trim(),
  parent: values.parent || undefined,
  is_active: values.active,
});
