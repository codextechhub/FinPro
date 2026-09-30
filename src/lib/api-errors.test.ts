import { describe, expect, it } from "vitest";
import { isForbidden } from "./api-errors";

/**
 * A refusal is the one failure a screen answers differently: it names what the
 * reader's role cannot do instead of offering a retry that would be refused
 * again.
 */
describe("isForbidden", () => {
  it("recognises a refusal", () => {
    expect(isForbidden({ status: 403, data: {} })).toBe(true);
  });

  it("does not mistake another failure for a refusal", () => {
    expect(isForbidden({ status: 404 })).toBe(false);
    expect(isForbidden({ status: "FETCH_ERROR" })).toBe(false);
  });

  it("does not read a missing error as a refusal", () => {
    expect(isForbidden(undefined)).toBe(false);
    expect(isForbidden(null)).toBe(false);
  });
});
