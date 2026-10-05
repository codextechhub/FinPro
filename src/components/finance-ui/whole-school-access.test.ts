/**
 * The whole-school rule, and the sweep that keeps every screen asking it.
 *
 * The sweep reads the whole package: a screen that gates a key from
 * `WHOLE_SCHOOL_KEYS` with a plain `can(...)` or `<Can permission={...}>`
 * offers Lekki's bursar a button the server refuses her, and fails here by file
 * and line before anyone clicks it.
 */
import { describe, expect, it } from "vitest";

import { FINANCE_PERMISSION_REGISTRY, P } from "../../permissions";
import { BACKEND_KEY_CATALOGUE } from "../../backend-key-catalogue";
import {
  PARTLY_WHOLE_SCHOOL_KEYS, WHOLE_SCHOOL_KEYS, WHOLE_TENANT_SETTINGS_NOTE,
  settingsWriteAccess, ungatedWholeSchoolUses, wholeSchoolMay,
} from "./whole-school-access";

const sources = import.meta.glob<string>(
  ["../../**/*.{ts,tsx}", "!../../**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

describe("whole-school actions", () => {
  it("are offered only to a key holder who covers the whole school", () => {
    expect(wholeSchoolMay(true, true)).toBe(true);
    expect(wholeSchoolMay(true, false)).toBe(false);
    expect(wholeSchoolMay(false, true)).toBe(false);
  });

  it("name codes that stand for the backend key they claim", () => {
    for (const { code, key } of WHOLE_SCHOOL_KEYS) {
      expect(FINANCE_PERMISSION_REGISTRY[code], key).toBe(key);
    }
  });

  it("name keys the backend serves", () => {
    const keys = new Set<string>(BACKEND_KEY_CATALOGUE);
    for (const { key } of [...WHOLE_SCHOOL_KEYS, ...PARTLY_WHOLE_SCHOOL_KEYS]) {
      expect(keys.has(key), key).toBe(true);
    }
  });

  it("list each key once, and never as both kinds", () => {
    const whole = WHOLE_SCHOOL_KEYS.map((k) => k.key);
    const partly = PARTLY_WHOLE_SCHOOL_KEYS.map((k) => k.key);
    expect(new Set(whole).size).toBe(whole.length);
    expect(new Set(partly).size).toBe(partly.length);
    expect(whole.filter((k) => partly.includes(k))).toEqual([]);
  });

  it("are read through the gate on every screen in the package", () => {
    expect(Object.keys(sources)).toContain("../../index.ts");
    expect(ungatedWholeSchoolUses(sources)).toEqual([]);
  });

  it("report a screen that gates one with a plain permission check", () => {
    const screen = [
      "const { canWholeSchool } = useWholeSchoolAccess();",
      "const ok = canWholeSchool(P.FIN_CREATE_COST_CENTER);",
      "<Can permission={P.FIN_CREATE_COST_CENTER}><Button /></Can>",
      "const branchOwn = can(P.FIN_POST_DIRECT_ENTRY);",
    ].join("\n");
    expect(ungatedWholeSchoolUses({ "pages/a.tsx": screen })).toEqual(["pages/a.tsx:3 P.FIN_CREATE_COST_CENTER"]);
  });

  it("leave the permission tables themselves alone", () => {
    expect(ungatedWholeSchoolUses({ "src/permissions.ts": `x: P.${keyName(P.FIN_CREATE_ACCOUNT)}` })).toEqual([]);
  });
});

describe("settings write access", () => {
  it("is read-only with a reason for a key holder who covers one branch", () => {
    expect(settingsWriteAccess(true, true)).toEqual({ canUpdate: true, readOnlyNote: null });
    expect(settingsWriteAccess(true, false)).toEqual({ canUpdate: false, readOnlyNote: WHOLE_TENANT_SETTINGS_NOTE });
    expect(settingsWriteAccess(false, true)).toEqual({ canUpdate: false, readOnlyNote: "You have read-only access." });
    expect(settingsWriteAccess(false, false).canUpdate).toBe(false);
    expect(WHOLE_TENANT_SETTINGS_NOTE).toContain("Only a school-wide administrator can change these settings");
  });
});

function keyName(code: string): string {
  return Object.entries(P).find(([, c]) => c === code)?.[0] ?? "";
}
