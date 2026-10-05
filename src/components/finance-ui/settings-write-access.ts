/**
 * Who may change a settings screen, measured the way the server measures it.
 *
 * A finance or procurement setting has no branch: a banking default, a
 * matching tolerance or a calendar rule binds every branch that posts to the
 * books. Holding the update key is therefore not enough. The server also wants
 * a caller who covers the whole school, and refuses anyone else with "Only a
 * school-wide administrator can change ...".
 *
 * Mrs Adeyemi is the bursar for Lekki only and holds the finance settings
 * update key. Offered a Save button, she changes a banking default, clicks Save
 * and is refused. Asked here first, the panel is read-only for her and says why,
 * so nothing is offered that cannot be done. At a school with one branch a
 * bursar pinned to that branch covers the whole school, as the server counts
 * it, and may save.
 */

import { usePermissions } from "@/hooks/use-permissions";
import { useReaderReach } from "../../host";
import type { PermissionCode } from "../../permissions";

/** Why a settings panel is read-only for a reader who holds its update key. */
export const WHOLE_TENANT_SETTINGS_NOTE =
  "Only a school-wide administrator can change these settings, because they apply to every branch. You can read them.";

export interface SettingsWriteAccess {
  /** The reader may save: they hold the key and cover the whole school. */
  canUpdate: boolean;
  /** The sentence beside a read-only panel, or null when nothing needs saying. */
  readOnlyNote: string | null;
}

/** The pure rule, for tests. */
export function settingsWriteAccess(holdsKey: boolean, wholeTenant: boolean): SettingsWriteAccess {
  if (!holdsKey) return { canUpdate: false, readOnlyNote: "You have read-only access." };
  if (!wholeTenant) return { canUpdate: false, readOnlyNote: WHOLE_TENANT_SETTINGS_NOTE };
  return { canUpdate: true, readOnlyNote: null };
}

/** The signed-in reader's access to a settings screen gated on `updateCode`. */
export function useSettingsWriteAccess(updateCode: PermissionCode): SettingsWriteAccess {
  const { hasPermission } = usePermissions();
  const { wholeSchool } = useReaderReach();
  return settingsWriteAccess(hasPermission(updateCode), wholeSchool);
}
