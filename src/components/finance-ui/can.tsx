/**
 * <Can> / useCan() - the Finance & Procurement consoles' permission gate.
 *
 * These are thin aliases over the app's EXISTING mechanism (PermissionGate +
 * usePermissions); they add no parallel permissions system. They exist only so
 * finance/procurement code reads in the spec's vocabulary. The gating key for a
 * control is always the rbac_permission on the backend view it calls, expressed
 * as a P.* constant.
 */

import PermissionGate from "@/components/custom/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";

/** Permission gate: `<Can permission={P.FINANCE_POST_DIRECT_ENTRY}>…</Can>`. */
export const Can = PermissionGate;

/** Imperative checks for gating logic that can't be expressed as JSX. */
export function useCan() {
  const { hasPermission, hasAnyPermission, hasAllPermissions, hasModuleAccess } = usePermissions();
  return {
    can: hasPermission,
    canAny: hasAnyPermission,
    canAll: hasAllPermissions,
    canModule: hasModuleAccess,
  };
}
