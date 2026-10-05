/** A supplier payment's method reads as words, never as the stored code. */
import { describe, expect, it } from "vitest";
import { PAYMENT_METHODS, paymentMethodLabel } from "./payment-method";

describe("paymentMethodLabel", () => {
  it("names every method the form offers", () => {
    expect(PAYMENT_METHODS.map(paymentMethodLabel)).toEqual(["Bank transfer", "Cheque", "Cash", "Card"]);
  });

  it("puts a code it does not know in sentence case, and a missing one as a dash", () => {
    expect(paymentMethodLabel("DIRECT_DEBIT")).toBe("Direct debit");
    expect(paymentMethodLabel(null)).toBe("-");
  });
});
