import type { CostCenter } from "@/redux/services/finance/setup-types";

/**
 * Cost centres offered for a new allocation.
 *
 * Inactive centres stay visible only when a saved document already references
 * one. That preserves the existing value during an edit without allowing a
 * fresh allocation to select a centre that has been taken out of use.
 */
export const selectableCostCenters = (
  centres: CostCenter[],
  currentCode: string,
): CostCenter[] => centres.filter(
  (centre) => centre.is_active || centre.code === currentCode,
);
