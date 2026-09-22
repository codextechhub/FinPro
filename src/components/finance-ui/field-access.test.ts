/**
 * Field Access decides what every finance, procurement and payments screen shows
 * and sends. These cases pin the rules a screen cannot get wrong:
 *
 *   1. an absent resource or an absent name means full access;
 *   2. on an existing record the record wins over the map, both for what is
 *      visible (a field present in the payload is readable, which is how a
 *      person's own details stay open to them) and for what may change;
 *   3. on an Add form the map decides, and an `open_on_create` name is visible,
 *      editable and sent even where the map also hides it or greys it;
 *   4. a hidden or read-only field is never sent;
 *   5. a 403 `field_write_denied` becomes one message per field, and any other
 *      error is not mistaken for it.
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fieldAccess: {} as Record<string, unknown> }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

import {
  fieldWriteErrors, resolveFieldAccess, useFieldAccess, type FieldAccess, type FieldAccessMap,
} from "./field-access";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VENDOR = "procurement.vendor";
const MAP: FieldAccessMap = {
  [VENDOR]: {
    hidden: ["bank_account_number"],
    read_only: ["phone", "tax_id"],
    open_on_create: ["tax_id"],
  },
};

describe("resolveFieldAccess against the map", () => {
  it("treats an absent resource as full access", () => {
    const access = resolveFieldAccess(MAP, "finance.bankaccount");
    expect(access.isHidden("account_number")).toBe(false);
    expect(access.isReadOnly("account_number")).toBe(false);
  });

  it("treats an absent map as full access", () => {
    const access = resolveFieldAccess(undefined, VENDOR);
    expect(access.isHidden("bank_account_number")).toBe(false);
    expect(access.isReadOnly("phone")).toBe(false);
  });

  it("treats a name the resource does not list as full access", () => {
    const access = resolveFieldAccess(MAP, VENDOR);
    expect(access.isHidden("email")).toBe(false);
    expect(access.isReadOnly("email")).toBe(false);
  });

  it("hides a hidden name, and a hidden name is never writable", () => {
    const access = resolveFieldAccess(MAP, VENDOR);
    expect(access.isHidden("bank_account_number")).toBe(true);
    expect(access.isReadOnly("bank_account_number")).toBe(true);
    expect(access.isReadOnly("bank_account_number", { creating: true })).toBe(true);
  });

  it("keeps an open_on_create name editable on an Add form only", () => {
    const access = resolveFieldAccess(MAP, VENDOR);
    expect(access.isReadOnly("tax_id", { creating: true })).toBe(false);
    expect(access.isReadOnly("tax_id", { creating: false })).toBe(true);
    expect(access.isReadOnly("phone", { creating: true })).toBe(true);
  });

  it("counts a call without a record as an Add form", () => {
    expect(resolveFieldAccess(MAP, VENDOR).isReadOnly("tax_id")).toBe(false);
  });

  it("reports a section visible while any one of its fields is", () => {
    const access = resolveFieldAccess(MAP, VENDOR);
    expect(access.anyVisible("bank_account_number", "bank_name")).toBe(true);
    expect(access.anyVisible("bank_account_number")).toBe(false);
  });
});

describe("resolveFieldAccess against a record", () => {
  it("lets the record's _read_only_fields win over the map", () => {
    // The map greys phone; this record, the user's own, leaves it open.
    const access = resolveFieldAccess(MAP, VENDOR, { phone: "0803", email: "a@b.c", _read_only_fields: ["email"] });
    expect(access.isReadOnly("phone")).toBe(false);
    expect(access.isReadOnly("email")).toBe(true);
  });

  it("shows a field the record carries even where the map hides it", () => {
    const access = resolveFieldAccess(MAP, VENDOR, { bank_account_number: "0123456789", _read_only_fields: [] });
    expect(access.isHidden("bank_account_number")).toBe(false);
    expect(access.isReadOnly("bank_account_number")).toBe(false);
  });

  it("keeps a field hidden when the record lacks it and the map hides it", () => {
    const access = resolveFieldAccess(MAP, VENDOR, { name: "Ade Stationers", _read_only_fields: [] });
    expect(access.isHidden("bank_account_number")).toBe(true);
    expect(access.isReadOnly("bank_account_number")).toBe(true);
  });

  it("falls back to the map for a list row, which carries no _read_only_fields", () => {
    const access = resolveFieldAccess(MAP, VENDOR, { phone: "0803" });
    expect(access.isReadOnly("phone")).toBe(true);
    expect(access.isReadOnly("email")).toBe(false);
  });

  it("does not open an open_on_create name on an existing record", () => {
    const access = resolveFieldAccess(MAP, VENDOR, { tax_id: "TIN-1" });
    expect(access.isReadOnly("tax_id")).toBe(true);
  });
});

describe("open_on_create on an Add form and on an existing record", () => {
  // A role that may give a new staff member an email and a start date, but may
  // not read the email afterwards or change the start date.
  const STAFF = "staff.staff";
  const STAFF_MAP: FieldAccessMap = {
    [STAFF]: {
      hidden: ["email", "salary"],
      read_only: ["hire_date", "phone"],
      open_on_create: ["email", "hire_date"],
    },
  };

  it("offers and sends a hidden, open-on-create field while creating", () => {
    const access = resolveFieldAccess(STAFF_MAP, STAFF);
    expect(access.isHidden("email", { creating: true })).toBe(false);
    expect(access.isReadOnly("email", { creating: true })).toBe(false);
    expect(access.writableOnly({ email: "tunde@brightstar.ng", salary: 1 }, { creating: true }))
      .toEqual({ email: "tunde@brightstar.ng" });
  });

  it("keeps a hidden, open-on-create field hidden on an existing record", () => {
    const access = resolveFieldAccess(STAFF_MAP, STAFF, { first_name: "Tunde", _read_only_fields: [] });
    expect(access.isHidden("email")).toBe(true);
    expect(access.isHidden("email", { creating: false })).toBe(true);
    expect(access.isReadOnly("email")).toBe(true);
    expect(access.writableOnly({ email: "x@y.z", first_name: "Tunde" })).toEqual({ first_name: "Tunde" });
  });

  it("keeps a hidden, open-on-create column hidden when no Add form is asked for", () => {
    const access = resolveFieldAccess(STAFF_MAP, STAFF);
    expect(access.isHidden("email")).toBe(true);
    expect(access.writableOnly({ email: "x@y.z" })).toEqual({});
  });

  it("makes a read-only, open-on-create field editable on create and greyed on edit", () => {
    const creating = resolveFieldAccess(STAFF_MAP, STAFF);
    expect(creating.isHidden("hire_date", { creating: true })).toBe(false);
    expect(creating.isReadOnly("hire_date", { creating: true })).toBe(false);
    expect(creating.writableOnly({ hire_date: "2026-09-01" }, { creating: true })).toEqual({ hire_date: "2026-09-01" });

    const editing = resolveFieldAccess(STAFF_MAP, STAFF, { hire_date: "2026-09-01" });
    expect(editing.isHidden("hire_date")).toBe(false);
    expect(editing.isReadOnly("hire_date")).toBe(true);
    expect(editing.writableOnly({ hire_date: "2026-10-01" })).toEqual({});
  });

  it("lets the record's _read_only_fields win over open_on_create on an existing record", () => {
    const access = resolveFieldAccess(STAFF_MAP, STAFF, { hire_date: "2026-09-01", _read_only_fields: ["hire_date"] });
    expect(access.isReadOnly("hire_date")).toBe(true);
  });

  it("shows a section whose only offered field is hidden and open on create, only when creating", () => {
    const blank = resolveFieldAccess(STAFF_MAP, STAFF);
    expect(blank.anyVisible("email", "salary", { creating: true })).toBe(true);
    expect(blank.anyVisible("email", "salary", { creating: false })).toBe(false);
    expect(blank.anyVisible("email", "salary")).toBe(false);
    const existing = resolveFieldAccess(STAFF_MAP, STAFF, { first_name: "Tunde", _read_only_fields: [] });
    expect(existing.anyVisible("email", "salary")).toBe(false);
  });

  it("leaves a section with no open-on-create field as it was", () => {
    const access = resolveFieldAccess(STAFF_MAP, STAFF);
    expect(access.anyVisible("salary", { creating: true })).toBe(false);
    expect(access.anyVisible("salary", "phone", { creating: true })).toBe(true);
    expect(access.anyVisible("salary", "phone")).toBe(true);
  });

  it("leaves a field that is not open on create as it was", () => {
    const access = resolveFieldAccess(STAFF_MAP, STAFF);
    expect(access.isHidden("salary", { creating: true })).toBe(true);
    expect(access.isReadOnly("salary", { creating: true })).toBe(true);
    expect(access.isHidden("phone", { creating: true })).toBe(false);
    expect(access.isReadOnly("phone", { creating: true })).toBe(true);
    expect(access.isHidden("first_name", { creating: true })).toBe(false);
    expect(access.isReadOnly("first_name", { creating: true })).toBe(false);
    expect(access.writableOnly({ salary: 1, phone: "0803", first_name: "Tunde" }, { creating: true }))
      .toEqual({ first_name: "Tunde" });
  });
});

describe("writableOnly", () => {
  it("drops hidden and read-only names and keeps everything else", () => {
    const access = resolveFieldAccess(MAP, VENDOR, { phone: "0803", email: "a@b.c" });
    expect(access.writableOnly({ name: "Ade", phone: "0804", email: "x@y.z", bank_account_number: "1" }))
      .toEqual({ name: "Ade", email: "x@y.z" });
  });

  it("keeps an open_on_create name while creating", () => {
    const access = resolveFieldAccess(MAP, VENDOR);
    expect(access.writableOnly({ tax_id: "TIN-9", phone: "0803" }, { creating: true })).toEqual({ tax_id: "TIN-9" });
  });
});

describe("fieldWriteErrors", () => {
  const refusal = {
    status: 403,
    data: {
      success: false,
      message: "You do not have permission to change: account_number.",
      error: {
        code: "field_write_denied",
        detail: { account_number: ["You do not have permission to change this field."] },
      },
    },
  };

  it("reads one message per refused field", () => {
    expect(fieldWriteErrors(refusal)).toEqual({
      account_number: "You do not have permission to change this field.",
    });
  });

  it("ignores a 403 with another code", () => {
    expect(fieldWriteErrors({ ...refusal, data: { ...refusal.data, error: { code: "PERMISSION_DENIED" } } })).toBeNull();
  });

  it("ignores a validation error, whatever its detail", () => {
    expect(fieldWriteErrors({ status: 400, data: refusal.data })).toBeNull();
    expect(fieldWriteErrors(undefined)).toBeNull();
  });
});

describe("useFieldAccess", () => {
  it("reads the map the host serves beside its permissions", () => {
    mocks.fieldAccess = { [VENDOR]: { hidden: ["phone"] } };
    let seen: FieldAccess | null = null;
    function Probe() {
      seen = useFieldAccess(VENDOR);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe)));
    expect(seen!.isHidden("phone")).toBe(true);
    expect(seen!.isHidden("email")).toBe(false);
    act(() => root.unmount());
  });

  it("treats a host that serves no map as full access", () => {
    mocks.fieldAccess = undefined as unknown as Record<string, unknown>;
    let seen: FieldAccess | null = null;
    function Probe() {
      seen = useFieldAccess(VENDOR);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe)));
    expect(seen!.isHidden("phone")).toBe(false);
    act(() => root.unmount());
  });
});
