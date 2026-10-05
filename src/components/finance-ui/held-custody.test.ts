/**
 * Reading a school's custody mode for a menu: Bright Star (HELD) and Greenfield
 * (DIRECT), and a reader who cannot see the setting at all.
 */
import { describe, expect, it } from "vitest";
import { custodyReading } from "./held-custody";

describe("custody reading", () => {
  it("is the mode in force when the reader may read it", () => {
    expect(custodyReading(true, "HELD")).toBe("HELD");
    expect(custodyReading(true, "DIRECT")).toBe("DIRECT");
  });

  it("is unknown while the read is in flight or the reader may not read it", () => {
    expect(custodyReading(true, undefined)).toBe("UNKNOWN");
    expect(custodyReading(false, "HELD")).toBe("UNKNOWN");
  });
});
