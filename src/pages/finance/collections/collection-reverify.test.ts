/**
 * Re-verify is offered wherever the provider's answer can still change the
 * collection: pending ones, and failed or abandoned ones the provider accepted.
 */

import { describe, expect, it } from "vitest";

import { canReverify } from "./collection-reverify";

describe("canReverify", () => {
  it("offers it on a pending or processing collection", () => {
    expect(canReverify({ status: "PENDING", provider_reference: null })).toBe(true);
    expect(canReverify({ status: "PROCESSING", provider_reference: "ps_1" })).toBe(true);
  });

  it("offers it on a failed or abandoned collection the provider accepted", () => {
    expect(canReverify({ status: "FAILED", provider_reference: "ps_1" })).toBe(true);
    expect(canReverify({ status: "ABANDONED", provider_reference: "ps_2" })).toBe(true);
  });

  it("does not offer it where the provider never accepted the collection", () => {
    expect(canReverify({ status: "ABANDONED", provider_reference: null })).toBe(false);
    expect(canReverify({ status: "FAILED", provider_reference: "" })).toBe(false);
  });

  it("does not offer it once the collection is booked", () => {
    expect(canReverify({ status: "SUCCEEDED", provider_reference: "ps_1" })).toBe(false);
    expect(canReverify({ status: "REFUNDED", provider_reference: "ps_1" })).toBe(false);
  });
});
