/**
 * Online refunds: when they are offered, what a state reads and which payment may be returned.
 *
 * Bright Star School holds its online money, so Mrs Bello can return Tunde's
 * N180,000 school-fees payment through Paystack. Greenfield's payments settle
 * straight into each branch's bank, so its bursar never sees the option.
 */
import { describe, expect, it } from "vitest";

import type { Collection, ProviderRefund } from "@/redux/services/payments/payments-types";
import {
  currentProviderRefund,
  needsPayment,
  offersPayFromBank,
  offersTryAgain,
  onlineRefundOffered,
  paymentAmountError,
  paymentChoiceReady,
  providerRefundsByRefund,
  providerRefundWord,
  returnablePayments,
} from "./provider-refund-model";

const link = (over: Partial<ProviderRefund>): ProviderRefund => ({
  id: 1, refund_id: 12, refund_number: "RF-0012", refund_status: "DRAFT", branch: 2, provider: "PAYSTACK",
  status: "LINKED", amount: 10_000_000, amount_naira: "100,000.00", sent_at: null, processed_at: null, created_at: "2026-10-12T09:00:00Z",
  ...over,
});
const payment = (over: Partial<Collection>): Collection => ({
  id: 5, entity_code: "BSS", branch: 2, provider: "PAYSTACK", channel: "CHECKOUT", reference: "COL-5", provider_reference: "ps_5",
  amount: 18_000_000, amount_naira: "180,000.00", status: "SUCCEEDED", customer_code: "C-001", customer_name: "Adeyemi",
  deposit_account_code: null, deposit_account_name: null, invoice_id: null, payer_email: "", payer_name: "",
  narration: "", checkout_url: null, payment_id: 9, confirmed_at: "2026-10-01T10:00:00Z", created_at: "2026-10-01T09:00:00Z",
  ...over,
});

describe("when an online refund is offered", () => {
  it("only at a school that holds its online money, for someone who may tie a payment", () => {
    expect(onlineRefundOffered({ custody: "HELD", mayCreate: true, paymentWritable: true })).toBe(true);
    expect(onlineRefundOffered({ custody: "DIRECT", mayCreate: true, paymentWritable: true })).toBe(false);
    expect(onlineRefundOffered({ custody: "UNKNOWN", mayCreate: true, paymentWritable: true })).toBe(false);
    expect(onlineRefundOffered({ custody: "HELD", mayCreate: false, paymentWritable: true })).toBe(false);
    expect(onlineRefundOffered({ custody: "HELD", mayCreate: true, paymentWritable: false })).toBe(false);
  });
});

describe("the words for a refund's state", () => {
  it("names the provider and reads processing, returned and failed plainly", () => {
    expect(providerRefundWord("PROCESSING", "Paystack")).toMatchObject({ label: "Processing" });
    expect(providerRefundWord("PROCESSED", "Paystack")).toMatchObject({ label: "Returned" });
    expect(providerRefundWord("FAILED", "Paystack").detail).toContain("Paystack could not return the money");
    expect(providerRefundWord("LINKED", "Paystack").detail).toContain("when the refund is posted");
    expect(providerRefundWord(undefined, "Paystack").label).toBe("Online refund");
  });
});

describe("a refund's current tie", () => {
  it("is the newest one that was not dropped", () => {
    const rows = [link({ id: 3, status: "CANCELLED" }), link({ id: 2, status: "FAILED" }), link({ id: 1, status: "CANCELLED" })];
    expect(currentProviderRefund(rows)?.id).toBe(2);
    expect(currentProviderRefund([link({ status: "CANCELLED" })])).toBeNull();
    expect(currentProviderRefund(undefined)).toBeNull();
  });

  it("is found for each refund in a page", () => {
    const map = providerRefundsByRefund([
      link({ id: 4, refund_id: 12, status: "PROCESSING" }),
      link({ id: 3, refund_id: 12, status: "FAILED" }),
      link({ id: 2, refund_id: 13, status: "CANCELLED" }),
      link({ id: 1, refund_id: 14, status: "PROCESSED" }),
    ]);
    expect(map.get(12)?.id).toBe(4);
    expect(map.has(13)).toBe(false);
    expect(map.get(14)?.id).toBe(1);
  });
});

describe("the actions on a failed refund", () => {
  it("offers Try again and Pay from bank on a failed draft raised as online", () => {
    const failed = link({ status: "FAILED" });
    expect(offersTryAgain(failed, "ONLINE")).toBe(true);
    expect(offersPayFromBank(failed, "ONLINE")).toBe(true);
  });

  it("offers neither once it is paid from the bank, and neither while the provider has it", () => {
    expect(offersTryAgain(link({ status: "FAILED" }), "BANK_TRANSFER")).toBe(false);
    expect(offersPayFromBank(link({ status: "FAILED" }), "BANK_TRANSFER")).toBe(false);
    expect(offersPayFromBank(link({ status: "PROCESSING", refund_status: "APPROVED" }), "ONLINE")).toBe(false);
    expect(offersPayFromBank(link({ status: "PROCESSED", refund_status: "POSTED" }), "ONLINE")).toBe(false);
  });

  it("offers only Pay from bank on a refund tied but not yet sent", () => {
    const tied = link({ status: "LINKED" });
    expect(offersTryAgain(tied, "ONLINE")).toBe(false);
    expect(offersPayFromBank(tied, "ONLINE")).toBe(true);
  });
});

describe("a draft online refund that still needs its payment", () => {
  it("has no tie yet, or a failed one", () => {
    expect(needsPayment(null, "ONLINE", "DRAFT")).toBe(true);
    expect(needsPayment(link({ status: "FAILED" }), "ONLINE", "DRAFT")).toBe(true);
    expect(needsPayment(link({ status: "LINKED" }), "ONLINE", "DRAFT")).toBe(false);
    expect(needsPayment(null, "BANK_TRANSFER", "DRAFT")).toBe(false);
    expect(needsPayment(null, "ONLINE", "POSTED")).toBe(false);
  });
});

describe("the payments a refund may return", () => {
  const rows = [
    payment({ id: 1 }),
    payment({ id: 2, customer_code: "C-002" }),
    payment({ id: 3, status: "FAILED" }),
    payment({ id: 4, branch: 1 }),
    payment({ id: 6, branch: null }),
  ];

  it("are the customer's confirmed payments at the refund's branch", () => {
    expect(returnablePayments(rows, { customerCode: "C-001", branch: 2 }).map((p) => p.id)).toEqual([1, 6]);
  });

  it("are every branch's when the refund has none", () => {
    expect(returnablePayments(rows, { customerCode: "C-001", branch: undefined }).map((p) => p.id)).toEqual([1, 4, 6]);
  });

  it("refuse an amount above the payment", () => {
    expect(paymentAmountError(18_000_001, payment({}))).not.toBeNull();
    expect(paymentAmountError(18_000_000, payment({}))).toBeNull();
    expect(paymentAmountError(100, null)).toBeNull();
  });
});

describe("the form's completeness", () => {
  it("wants a payment for an online refund and a bank account for the rest", () => {
    expect(paymentChoiceReady({ online: true, collection: "5", payment: null }, "")).toBe(true);
    expect(paymentChoiceReady({ online: true, collection: "  ", payment: null }, "9")).toBe(false);
    expect(paymentChoiceReady({ online: false, collection: "", payment: null }, "9")).toBe(true);
    expect(paymentChoiceReady({ online: false, collection: "", payment: null }, "")).toBe(false);
  });
});
