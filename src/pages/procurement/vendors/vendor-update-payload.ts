import type { FieldAccess } from "../../../components/finance-ui/field-access";
import type { Vendor } from "@/redux/services/procurement/procurement-types";

export interface VendorFormValues {
  name: string;
  category: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  bankName: string;
  bankNumber: string;
  bankAccountName: string;
  payable: string;
  expense: string;
  wht: string;
  terms: string;
  kyc: string;
  risk: string;
  onHold: boolean;
  active: boolean;
}

export interface VendorEditAccess {
  /** Field Access on `procurement.vendor`, resolved against the vendor being edited. */
  fields: FieldAccess;
  canManage: boolean;
}

export type VendorUpdatePayload = {
  name?: string;
  category?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  payable_account?: string;
  default_expense_account?: string;
  default_wht_tax_code?: string;
  payment_terms?: string;
  kyc_status?: string;
  risk?: string;
  on_hold?: boolean;
  is_active?: boolean;
};

const addChanged = <K extends keyof VendorUpdatePayload>(
  payload: VendorUpdatePayload,
  key: K,
  value: VendorUpdatePayload[K],
  baseline: VendorUpdatePayload[K],
) => {
  if (value !== baseline) payload[key] = value;
};

/**
 * Build the smallest authorized PATCH body for an existing vendor.
 *
 * Only changed values are sent. A contact or banking field goes in only when
 * the user may write it, so a field shown greyed is never sent even if its
 * local state somehow differs; the governance fields need `canManage`.
 */
export function buildVendorUpdatePayload(
  initial: Vendor,
  values: VendorFormValues,
  access: VendorEditAccess,
): VendorUpdatePayload {
  const payload: VendorUpdatePayload = {};

  addChanged(payload, "name", values.name.trim(), initial.name);
  addChanged(payload, "category", values.category, initial.category_code ?? "");
  addChanged(payload, "payable_account", values.payable, initial.payable_code ?? "");
  addChanged(payload, "default_expense_account", values.expense, initial.default_expense_code ?? "");
  addChanged(payload, "default_wht_tax_code", values.wht, initial.default_wht_tax_code_value ?? "");
  addChanged(payload, "payment_terms", values.terms, initial.payment_terms);
  addChanged(payload, "is_active", values.active, initial.is_active);

  const guarded: VendorUpdatePayload = {};
  addChanged(guarded, "email", values.email, initial.email ?? "");
  addChanged(guarded, "phone", values.phone, initial.phone ?? "");
  addChanged(guarded, "address", values.address, initial.address ?? "");
  addChanged(guarded, "tax_id", values.taxId, initial.tax_id ?? "");
  addChanged(guarded, "bank_name", values.bankName, initial.bank_name ?? "");
  addChanged(guarded, "bank_account_number", values.bankNumber, initial.bank_account_number ?? "");
  addChanged(guarded, "bank_account_name", values.bankAccountName, initial.bank_account_name ?? "");
  Object.assign(payload, access.fields.writableOnly(guarded, { creating: false }));

  if (access.canManage) {
    addChanged(payload, "kyc_status", values.kyc, initial.kyc_status);
    addChanged(payload, "risk", values.risk, initial.risk);
    addChanged(payload, "on_hold", values.onHold, initial.on_hold);
  }

  return payload;
}
