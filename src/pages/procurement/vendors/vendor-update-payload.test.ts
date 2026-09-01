import { describe, expect, it } from "vitest";

import type { Vendor } from "@/redux/services/procurement/procurement-types";
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
  terms: vendor.payment_terms,
  kyc: vendor.kyc_status,
  risk: vendor.risk,
  onHold: vendor.on_hold,
  active: vendor.is_active,
};

describe("buildVendorUpdatePayload", () => {
  it("sends only an ordinary user's dirty non-governance fields", () => {
    const payload = buildVendorUpdatePayload(
      vendor,
      { ...values, name: "Acme Office Supplies", risk: "HIGH", onHold: true },
      { canSensitive: false, canManage: false },
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
      { canSensitive: false, canManage: true },
    );

    expect(payload).toEqual({ risk: "HIGH" });
  });

  it("does not leak dirty sensitive fields without sensitive access", () => {
    const hidden = buildVendorUpdatePayload(
      vendor,
      { ...values, bankNumber: "9999999999" },
      { canSensitive: false, canManage: false },
    );
    const allowed = buildVendorUpdatePayload(
      vendor,
      { ...values, bankNumber: "9999999999" },
      { canSensitive: true, canManage: false },
    );

    expect(hidden).toEqual({});
    expect(allowed).toEqual({ bank_account_number: "9999999999" });
  });

  it("keeps ordinary lifecycle updates available without vendor-manage", () => {
    expect(buildVendorUpdatePayload(
      vendor,
      { ...values, active: false },
      { canSensitive: false, canManage: false },
    )).toEqual({ is_active: false });
  });
});
