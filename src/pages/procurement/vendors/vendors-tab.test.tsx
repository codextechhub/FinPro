/**
 * A vendor's contact and banking fields follow Field Access on
 * `procurement.vendor`. Mr. Bello, a storekeeper, may see a vendor's phone but
 * not change it, and may not see its bank details at all:
 *
 *   1. the form has no bank section and no hint that one exists;
 *   2. the phone is shown greyed and is never sent, on edit or on Add;
 *   3. a refused save shows its message under the field it names.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useCreateVendorMutation: () => [mocks.create, { isLoading: false }],
  useUpdateVendorMutation: () => [mocks.update, { isLoading: false }],
}));

vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({}));
vi.mock("../../../host", () => ({ QuickExportButton: () => null }));
vi.mock("../pickers", () => ({ CategoryPicker: () => null }));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AccountPicker: () => null,
  TaxCodePicker: () => null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VendorForm } from "./vendors-tab";
import type { Vendor } from "@/redux/services/procurement/procurement-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STOREKEEPER = {
  "procurement.vendor": {
    hidden: ["bank_account_name", "bank_account_number", "bank_code", "bank_name"],
    read_only: ["phone"],
    open_on_create: [],
  },
};

/** Ade Stationers as the storekeeper receives it: no bank keys, phone read-only. */
const ADE: Vendor = {
  id: 4, code: "ADE", name: "Ade Stationers", category_id: null, category_code: null,
  email: "sales@ade.test", phone: "08030000000", address: "2 Allen Avenue, Ikeja", tax_id: "TIN-4",
  payment_terms: "NET_30", kyc_status: "VERIFIED", risk: "LOW", on_hold: false, is_active: true,
  contacts: [], _read_only_fields: ["phone"],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = STOREKEEPER;
  mocks.create.mockReset();
  mocks.update.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const field = (name: string) => document.body.querySelector<HTMLFieldSetElement>(`fieldset[data-field=${name}]`);
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("VendorForm under Field Access", () => {
  it("leaves out the bank section and greys the phone on edit", async () => {
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor updated." }) });
    act(() => root.render(<VendorForm entity="COD" initial={ADE} canManage={false} onClose={() => undefined} />));

    expect(document.body.textContent).not.toContain("Bank details");
    expect(field("bank_account_number")).toBeNull();
    expect(field("phone")!.disabled).toBe(true);
    expect(field("email")!.disabled).toBe(false);

    act(() => type(field("email")!.querySelector("input")!, "orders@ade.test"));
    await act(async () => { button("Save Changes").click(); });

    expect(mocks.update).toHaveBeenCalledTimes(1);
    const body = mocks.update.mock.calls[0][0];
    expect(body).toMatchObject({ id: 4, email: "orders@ade.test" });
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("bank_account_number");
  });

  it("never sends a read-only or hidden field from the Add form", async () => {
    mocks.create.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Vendor created." }) });
    act(() => root.render(<VendorForm entity="COD" canManage={false} onClose={() => undefined} />));

    expect(document.body.textContent).not.toContain("Bank details");
    expect(field("phone")!.disabled).toBe(true);

    const company = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Company name"))!.querySelector("input")!;
    act(() => type(company, "Bright Office Supplies"));
    await act(async () => { button("Create Vendor").click(); });

    const body = mocks.create.mock.calls[0][0];
    expect(body).toMatchObject({ name: "Bright Office Supplies", email: "" });
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("bank_account_number");
    expect(body).not.toHaveProperty("bank_name");
  });

  it("shows a field_write_denied refusal under the field it names", async () => {
    mocks.update.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 403,
        data: {
          success: false,
          message: "You do not have permission to change: email.",
          error: { code: "field_write_denied", detail: { email: ["You do not have permission to change this field."] } },
        },
      }),
    });
    act(() => root.render(<VendorForm entity="COD" initial={ADE} canManage={false} onClose={() => undefined} />));
    act(() => type(field("email")!.querySelector("input")!, "orders@ade.test"));
    await act(async () => { button("Save Changes").click(); });

    expect(field("email")!.querySelector("[role=alert]")?.textContent).toBe("You do not have permission to change this field.");
    expect(field("phone")!.querySelector("[role=alert]")).toBeNull();
  });
});
