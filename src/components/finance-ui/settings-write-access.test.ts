/**
 * A settings screen binds every branch, so saving one needs the update key and
 * a reader who covers the whole school. Mrs Adeyemi, the bursar for Lekki only,
 * holds the key and still reads the panel without a Save; Mrs Bello, who covers
 * the whole school, saves.
 */
import { describe, expect, it } from "vitest";

import { WHOLE_TENANT_SETTINGS_NOTE, settingsWriteAccess } from "./settings-write-access";

describe("who may save a settings screen", () => {
  it("lets a whole-school holder of the key save", () => {
    expect(settingsWriteAccess(true, true)).toEqual({ canUpdate: true, readOnlyNote: null });
  });

  it("keeps a branch-only holder of the key read-only, and says why", () => {
    expect(settingsWriteAccess(true, false)).toEqual({ canUpdate: false, readOnlyNote: WHOLE_TENANT_SETTINGS_NOTE });
    expect(WHOLE_TENANT_SETTINGS_NOTE).toContain("Only a school-wide administrator can change these settings");
  });

  it("keeps a reader without the key read-only", () => {
    expect(settingsWriteAccess(false, true)).toEqual({ canUpdate: false, readOnlyNote: "You have read-only access." });
    expect(settingsWriteAccess(false, false).canUpdate).toBe(false);
  });
});
