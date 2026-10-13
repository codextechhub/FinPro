import { P } from "../../permissions";
import type { PermissionCode } from "@/permissions";
import type { FinanceSettingsSection, SetupSection } from "./console-sections";

type PermissionCheck = (code: PermissionCode) => boolean;

const SETUP_READ_PERMISSIONS: Record<SetupSection, readonly PermissionCode[]> = {
  entities: [P.FIN_VIEW_ENTITIES],
  accounts: [P.FIN_VIEW_ACCOUNTS],
  periods: [P.FIN_VIEW_PERIODS],
  currencies: [P.FIN_VIEW_CURRENCIES, P.FIN_VIEW_FX_RATES],
  "tax-codes": [P.FIN_VIEW_TAX_CODES],
  "cost-centers": [P.FIN_VIEW_COST_CENTERS],
  dimensions: [P.FIN_VIEW_DIMENSIONS],
  "tax-tables": [P.FIN_CREATE_STATUTORY, P.FIN_UPDATE_STATUTORY],
};

export function visibleSetupSections(
  mounted: readonly SetupSection[],
  can: PermissionCheck,
): SetupSection[] {
  return mounted.filter((section) => SETUP_READ_PERMISSIONS[section].some(can));
}

/**
 * Finance Settings sections containing something the reader may actually use.
 *
 * A mounted route answers whether the host offers a feature. This second gate
 * answers whether the current reader may see any setting inside it. The fees
 * section stays host-owned because its panel and permission belong to the host.
 */
export function visibleFinanceSettingsSections({
  mounted,
  mountedSetup,
  can,
  hostAllows = () => true,
}: {
  mounted: readonly FinanceSettingsSection[];
  mountedSetup: readonly SetupSection[];
  can: PermissionCheck;
  hostAllows?: (section: FinanceSettingsSection) => boolean;
}): FinanceSettingsSection[] {
  const canReadFinanceSettings = can(P.FIN_VIEW_SETTINGS);
  const canReadPaymentSettings = can(P.PAY_VIEW_PAYMENT_SETTINGS);
  const canReadReferenceData = visibleSetupSections(mountedSetup, can).length > 0;

  const visible = mounted.filter((section) => {
    if (!hostAllows(section)) return false;
    switch (section) {
      case "overview":
        return false;
      case "entities":
        return can(P.FIN_CREATE_ENTITY);
      case "banking-cash":
        return canReadFinanceSettings || canReadPaymentSettings;
      case "reference-data":
        return canReadReferenceData;
      case "approvals":
        return can(P.VIEW_WORKFLOW_TEMPLATES);
      case "fees":
        return true;
      default:
        return canReadFinanceSettings;
    }
  });

  return visible.length > 0 && mounted.includes("overview")
    ? ["overview", ...visible]
    : visible;
}
