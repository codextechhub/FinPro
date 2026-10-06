/**
 * Mr Eze sends back Mrs Bello's payment to Ade Stationers asking her to pay
 * from the Ikeja Branch's operating account. She changes the account alone:
 * the allocations go as always, with the new account and nothing else. The ₦4,500
 * of WHT she typed by hand stays as she typed it without being sent again.
 */
import { describe, expect, it } from "vitest";

import type { VendorPayment } from "@/redux/services/procurement/procurement-types";
import { vendorPaymentChanges, type VendorPaymentFormValues } from "./vendor-payment-edit";

const SAVED = {
  id: 21, document_number: "VP-0021", status: "DRAFT", approval_state: "PENDING", approval_returned: true,
  vendor_code: "V-001", payment_date: "2026-10-04", method: "BANK_TRANSFER", bank_account_id: 2,
  reference: "", narration: "Stationery", wht_tax_code_value: "WHT5", wht_amount: 450_000, wht_source: "ENTERED",
} as VendorPayment;
const ALLOCATIONS = [{ vendor_invoice: 14, amount: 9_000_000 }];
const form = (over: Partial<VendorPaymentFormValues> = {}): VendorPaymentFormValues => ({
  vendor: "V-001", paymentDate: "2026-10-04", method: "BANK_TRANSFER", bank: "2", reference: "", narration: "Stationery",
  whtCode: "WHT5", whtToSend: 450_000, allocations: ALLOCATIONS, ...over,
});

describe("vendorPaymentChanges", () => {
  it("sends only the allocations when nothing else changed", () => {
    expect(vendorPaymentChanges(SAVED, form())).toEqual({ allocations: ALLOCATIONS });
  });

  it("sends the new bank account with the allocations", () => {
    expect(vendorPaymentChanges(SAVED, form({ bank: "5" }))).toEqual({ allocations: ALLOCATIONS, bank_account: 5 });
  });

  it("sends a retyped WHT figure, and a cleared WHT code as null", () => {
    expect(vendorPaymentChanges(SAVED, form({ whtToSend: 0, whtCode: "" })))
      .toEqual({ allocations: ALLOCATIONS, wht_amount: 0, wht_tax_code: null });
  });

  it("leaves a computed WHT figure for the server to work out again", () => {
    const computed = { ...SAVED, wht_source: "COMPUTED" } as VendorPayment;
    expect(vendorPaymentChanges(computed, form({ whtToSend: undefined }))).toEqual({ allocations: ALLOCATIONS });
  });
});
