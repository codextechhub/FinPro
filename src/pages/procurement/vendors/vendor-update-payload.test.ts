import { describe, expect, it } from "vitest";

import type { Vendor } from "@/redux/services/procurement/procurement-types";
import { resolveFieldAccess } from "../../../components/finance-ui/field-access";
import {
  buildVendorUpdatePayload,
  type VendorFormValues,
} from "./vendor-update-payload";

const vendor: Vendor = {
  id: 1,
  code: "ACME",
  name: "Acme Supplies",
  category_id: 2,
  category_code: "OFFICE",
  email: "payables@acme.test",
  phone: "08000000000",
  address: "1 Market Road",
  tax_id: "TIN-1",
  bank_name: "Test Bank",
  bank_account_number: "0123456789",
  bank_account_name: "Acme Supplies",
  payable_account_id: 10,
  payable_code: "2100",
  default_expense_account_id: 11,
  default_expense_code: "5300",
  default_wht_tax_code_id: 3,
  default_wht_tax_code_value: "WHT-5",
  payment_terms: "NET_30",
  kyc_status: "VERIFIED",
  risk: "LOW",
  on_hold: false,
  is_active: true,
};

const values: VendorFormValues = {
  name: vendor.name,
  category: vendor.category_code!,
  email: vendor.email!,
  phone: vendor.phone!,
  address: vendor.address!,
  taxId: vendor.tax_id!,
  bankName: vendor.bank_name!,
  bankNumber: vendor.bank_account_number!,
  bankAccountName: vendor.bank_account_name!,
  payable: vendor.payable_code!,
  expense: vendor.default_expense_code!,
  wht: vendor.default_wht_tax_code_value!,
  terms: vendor.payment_terms!,
  kyc: vendor.kyc_status!,
  risk: vendor.risk!,
  onHold: vendor.on_hold!,
  active: vendor.is_active,
};

const VENDOR = "procurement.vendor";
const SENSITIVE = ["email", "phone", "address", "tax_id", "bank_name", "bank_account_number", "bank_account_name"];
const OPEN_FIELDS = ["category", "payment_terms", "kyc_status", "risk", "on_hold"];
/** A role that may read the vendor's contact and banking fields but change none of them. */
const readOnly = resolveFieldAccess({}, VENDOR, { ...vendor, _read_only_fields: SENSITIVE });
/** A role that may read every vendor field and change none of them. */
const locked = resolveFieldAccess({}, VENDOR, { ...vendor, _read_only_fields: [...SENSITIVE, ...OPEN_FIELDS] });
/** A role with full access: nothing restricted on the record. */
const open = resolveFieldAccess({}, VENDOR, { ...vendor, _read_only_fields: [] });

describe("buildVendorUpdatePayload", () => {
  it("sends only an ordinary user's dirty non-governance fields", () => {
    const payload = buildVendorUpdatePayload(
      vendor,
      { ...values, name: "Acme Office Supplies", risk: "HIGH", onHold: true },
      { fields: readOnly, canManage: false },
    );

    expect(payload).toEqual({ name: "Acme Office Supplies" });
    expect(payload).not.toHaveProperty("kyc_status");
    expect(payload).not.toHaveProperty("risk");
    expect(payload).not.toHaveProperty("on_hold");
  });

  it("includes only dirty governance fields for a vendor manager", () => {
    const payload = buildVendorUpdatePayload(
      vendor,
      { ...values, risk: "HIGH" },
      { fields: readOnly, canManage: true },
    );

    expect(payload).toEqual({ risk: "HIGH" });
  });

  it("never sends a dirty field the user may not change", () => {
    const hidden = buildVendorUpdatePayload(
      vendor,
      { ...values, bankNumber: "9999999999" },
      { fields: readOnly, canManage: false },
    );
    const allowed = buildVendorUpdatePayload(
      vendor,
      { ...values, bankNumber: "9999999999" },
      { fields: open, canManage: false },
    );

    expect(hidden).toEqual({});
    expect(allowed).toEqual({ bank_account_number: "9999999999" });
  });

  it("keeps ordinary lifecycle updates available without vendor-manage", () => {
    expect(buildVendorUpdatePayload(
      vendor,
      { ...values, active: false },
      { fields: readOnly, canManage: false },
    )).toEqual({ is_active: false });
  });

  it("never sends a field the user cannot see", () => {
    const { bank_account_number: _hidden, ...withoutNumber } = vendor;
    void _hidden;
    const fields = resolveFieldAccess(
      { [VENDOR]: { hidden: ["bank_account_number"] } }, VENDOR,
      { ...withoutNumber, _read_only_fields: [] },
    );
    expect(buildVendorUpdatePayload(
      withoutNumber as Vendor,
      { ...values, bankNumber: "9999999999", phone: "08011111111" },
      { fields, canManage: false },
    )).toEqual({ phone: "08011111111" });
  });

  it("sends the category under its body key, and never when the role may not change it", () => {
    const body = { ...values, category: "STATIONERY" };
    expect(buildVendorUpdatePayload(vendor, body, { fields: open, canManage: false })).toEqual({ category: "STATIONERY" });
    expect(buildVendorUpdatePayload(vendor, body, { fields: locked, canManage: false })).toEqual({});
  });

  it("sends the payment terms only to a role that may change them", () => {
    const body = { ...values, terms: "NET_60" };
    expect(buildVendorUpdatePayload(vendor, body, { fields: open, canManage: false })).toEqual({ payment_terms: "NET_60" });
    expect(buildVendorUpdatePayload(vendor, body, { fields: locked, canManage: false })).toEqual({});
  });

  it("holds each compliance value to its own switch as well as to the governance key", () => {
    const body = { ...values, kyc: "REJECTED", risk: "HIGH", onHold: true };
    const riskLocked = resolveFieldAccess({}, VENDOR, { ...vendor, _read_only_fields: ["risk"] });
    expect(buildVendorUpdatePayload(vendor, body, { fields: open, canManage: true })).toEqual({ kyc_status: "REJECTED", risk: "HIGH", on_hold: true });
    expect(buildVendorUpdatePayload(vendor, body, { fields: riskLocked, canManage: true })).toEqual({ kyc_status: "REJECTED", on_hold: true });
    expect(buildVendorUpdatePayload(vendor, body, { fields: open, canManage: false })).toEqual({});
  });

  it("builds from a vendor that arrived without the compliance and category keys", () => {
    const { category_id: _id, category_code: _code, payment_terms: _terms, kyc_status: _kyc, risk: _risk, on_hold: _hold, ...bare } = vendor;
    void [_id, _code, _terms, _kyc, _risk, _hold];
    const fields = resolveFieldAccess(
      { [VENDOR]: { hidden: ["category_id", "category_code", "payment_terms", "kyc_status", "risk", "on_hold"], read_only: ["category", "payment_terms", "kyc_status", "risk", "on_hold"] } },
      VENDOR, { ...bare, _read_only_fields: ["category", "payment_terms", "kyc_status", "risk", "on_hold"] },
    );
    expect(buildVendorUpdatePayload(
      bare as Vendor,
      { ...values, category: "OFFICE", terms: "NET_60", kyc: "VERIFIED", risk: "HIGH", onHold: true, name: "Acme Office Supplies" },
      { fields, canManage: true },
    )).toEqual({ name: "Acme Office Supplies" });
  });
});
