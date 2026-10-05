/**
 * Mr Okafor pays for Ada at Ikeja and Chidi at Lekki. His row on the customer
 * list is marked as a payer with the count the reader can see.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/redux/services/finance/ar-api", () => ({}));

import { payerLabel } from "./customers-tab";

describe("a payer's mark on the customer list", () => {
  it("counts the customers the account pays for", () => {
    expect(payerLabel(2)).toBe("Pays for 2");
    expect(payerLabel(1)).toBe("Pays for 1");
  });

  it("is absent for a customer who pays for nobody, and from an older server", () => {
    expect(payerLabel(0)).toBeNull();
    expect(payerLabel(undefined)).toBeNull();
  });
});
