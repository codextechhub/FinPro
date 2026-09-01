import { describe, expect, it } from "vitest";

import { refundAmountIsWithinAvailableCredit } from "./refund-validation";

describe("refundAmountIsWithinAvailableCredit", () => {
  it("accepts a partial or exact refund and rejects zero or an over-refund", () => {
    expect(refundAmountIsWithinAvailableCredit(1, 50_000)).toBe(true);
    expect(refundAmountIsWithinAvailableCredit(50_000, 50_000)).toBe(true);
    expect(refundAmountIsWithinAvailableCredit(0, 50_000)).toBe(false);
    expect(refundAmountIsWithinAvailableCredit(50_001, 50_000)).toBe(false);
  });
});
