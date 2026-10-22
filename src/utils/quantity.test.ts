/**
 * Quantities print without database scale, and a quantity the server did not
 * send prints as "-" rather than 0, so "not applicable" never reads as "none".
 */
import { describe, expect, it } from "vitest";

import { formatQuantity } from "./quantity";

describe("formatQuantity", () => {
  it("drops the fixed database scale", () => {
    expect(formatQuantity("8.0000")).toBe("8");
    expect(formatQuantity("2.5000")).toBe("2.5");
    expect(formatQuantity("1250.0000")).toBe("1,250");
    expect(formatQuantity(3)).toBe("3");
  });

  it("prints a real zero as 0", () => {
    expect(formatQuantity("0.0000")).toBe("0");
    expect(formatQuantity(0)).toBe("0");
  });

  it("prints a missing quantity as a dash, never as 0", () => {
    expect(formatQuantity(null)).toBe("-");
    expect(formatQuantity(undefined)).toBe("-");
    expect(formatQuantity("")).toBe("-");
    expect(formatQuantity(Number.NaN)).toBe("-");
  });

  it("passes a value that is not a number through unchanged", () => {
    expect(formatQuantity("n/a")).toBe("n/a");
  });
});
