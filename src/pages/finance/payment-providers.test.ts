import { describe, expect, it } from "vitest";

import { providerChoices, providerInfo } from "./payment-providers";

describe("payment providers", () => {
  it("offers only real gateways outside a development build", () => {
    expect(providerChoices(false).map(([code]) => code)).toEqual(["PAYSTACK"]);
  });

  it("offers the test gateway in a development build", () => {
    expect(providerChoices(true).map(([code]) => code)).toEqual(["PAYSTACK", "FAKE"]);
  });

  it("still names a row that already uses the test gateway", () => {
    expect(providerInfo("FAKE").label).toBe("Fake (test)");
  });

  it("shows an unknown code as stored and a blank one as a dash", () => {
    expect(providerInfo("FLUTTERWAVE").label).toBe("FLUTTERWAVE");
    expect(providerInfo("").label).toBe("-");
  });
});
