import { describe, expect, it } from "vitest";

import { computedWht, whtSourceLabel } from "./withholding-tax";

describe("computedWht", () => {
  it("takes the rate on the bill net of its VAT", () => {
    // N1,075,000 bill: N1,000,000 plus N75,000 VAT, at 5%.
    expect(computedWht({
      gross: 107_500_000,
      rateBps: 500,
      bills: [{ total: 107_500_000, tax_total: 7_500_000, amount: 107_500_000 }],
    })).toBe(5_000_000);
  });

  it("takes only the paid part's share of the VAT on a part payment", () => {
    // Half the bill settled: half the VAT comes off the base.
    expect(computedWht({
      gross: 53_750_000,
      rateBps: 500,
      bills: [{ total: 107_500_000, tax_total: 7_500_000, amount: 53_750_000 }],
    })).toBe(2_500_000);
  });

  it("uses the whole gross when no bill names any VAT, as a payout line does", () => {
    expect(computedWht({ gross: 100_000_000, rateBps: 500 })).toBe(5_000_000);
  });

  it("is zero without a rate", () => {
    expect(computedWht({ gross: 100_000_000, rateBps: 0 })).toBe(0);
    expect(computedWht({ gross: 100_000_000, rateBps: null })).toBe(0);
  });

  it("rounds half up to a whole kobo", () => {
    // 5% of 10 kobo is 0.5 kobo, which rounds up to 1.
    expect(computedWht({ gross: 10, rateBps: 500 })).toBe(1);
    expect(computedWht({ gross: 9, rateBps: 500 })).toBe(0);
  });
});

describe("whtSourceLabel", () => {
  it("names a computed and a typed figure, and nothing for an unknown one", () => {
    expect(whtSourceLabel("COMPUTED")).toBe("Worked out from the WHT code");
    expect(whtSourceLabel("ENTERED")).toBe("Entered by hand");
    expect(whtSourceLabel(undefined)).toBeNull();
    expect(whtSourceLabel("")).toBeNull();
  });
});
