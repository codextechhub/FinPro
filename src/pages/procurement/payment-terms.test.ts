import { describe, expect, it } from "vitest";

import { PAYMENT_TERMS, paymentTermsLabel } from "./payment-terms";

describe("payment terms", () => {
  it("offers exactly the codes the backend accepts", () => {
    expect(PAYMENT_TERMS.map(([code]) => code)).toEqual([
      "NET_0", "NET_7", "NET_14", "NET_30", "NET_60", "NET_90",
    ]);
  });

  it("reads a stored code in the backend's words", () => {
    expect(paymentTermsLabel("NET_0")).toBe("Due on receipt");
    expect(paymentTermsLabel("NET_30")).toBe("Net 30 days");
  });

  it("shows an unknown code as stored and nothing for a blank one", () => {
    expect(paymentTermsLabel("IMMEDIATE")).toBe("IMMEDIATE");
    expect(paymentTermsLabel("")).toBe("");
    expect(paymentTermsLabel(null)).toBe("");
  });
});
