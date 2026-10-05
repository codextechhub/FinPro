/**
 * How much of a written-off debt a later receipt may recover.
 *
 * Chidi's N40,000 was written off; N10,000 has been recovered already. A
 * receipt holding N50,000 of credit may recover the N30,000 still written off,
 * one holding N20,000 only that much.
 */
import { describe, expect, it } from "vitest";
import { recoverable } from "./write-off-recover-modal";

describe("write-off recovery", () => {
  it("caps the recovery at what is left written off and at the receipt's credit", () => {
    expect(recoverable(40_000_00, 10_000_00, 50_000_00)).toEqual({ left: 30_000_00, most: 30_000_00 });
    expect(recoverable(40_000_00, 10_000_00, 20_000_00)).toEqual({ left: 30_000_00, most: 20_000_00 });
  });

  it("offers nothing once the debt is fully recovered", () => {
    expect(recoverable(40_000_00, 40_000_00, 50_000_00)).toEqual({ left: 0, most: 0 });
  });
});
