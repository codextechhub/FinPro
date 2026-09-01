import { describe, expect, it } from "vitest";
import { taxCodeSupportsUsage } from "./tax-code-usage";

const tax = {
  is_active: true,
  rate_bps: 750,
  is_recoverable: true,
  collected_account: "2200",
  paid_account: "1250",
};

describe("taxCodeSupportsUsage", () => {
  it("requires an output account for a positive-rate sales tax", () => {
    expect(taxCodeSupportsUsage({ ...tax, collected_account: null }, "sales")).toBe(false);
    expect(taxCodeSupportsUsage(tax, "sales")).toBe(true);
  });

  it("requires an active recoverable input-tax mapping for purchases", () => {
    expect(taxCodeSupportsUsage({ ...tax, paid_account: null }, "purchase")).toBe(false);
    expect(taxCodeSupportsUsage({ ...tax, is_recoverable: false }, "purchase")).toBe(false);
    expect(taxCodeSupportsUsage({ ...tax, is_active: false }, "purchase")).toBe(false);
    expect(taxCodeSupportsUsage(tax, "purchase")).toBe(true);
  });

  it("allows an active zero-rate code without a posting account", () => {
    const zeroRated = {
      ...tax,
      rate_bps: 0,
      collected_account: null,
      paid_account: null,
    };
    expect(taxCodeSupportsUsage(zeroRated, "sales")).toBe(true);
    expect(taxCodeSupportsUsage(zeroRated, "purchase")).toBe(true);
  });
});
