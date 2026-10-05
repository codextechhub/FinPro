/**
 * A custody change waits for the next month start; choosing the mode in force
 * cancels a waiting change; a move to direct needs every branch set up.
 */

import { describe, expect, it } from "vitest";

import { branchesNotReady, custodyChange, firstOfNextMonth, wholeDaysIn } from "./custody-model";

describe("firstOfNextMonth", () => {
  it("is the first of the following month, across a year end", () => {
    expect(firstOfNextMonth("2026-10-05")).toBe("2026-11-01");
    expect(firstOfNextMonth("2026-12-31")).toBe("2027-01-01");
    expect(firstOfNextMonth("2026-01-01")).toBe("2026-02-01");
  });
});

describe("custodyChange", () => {
  const held = { stored_mode: "HELD" as const, pending_mode: null, pending_from: null };

  it("schedules a new mode for the next month start", () => {
    expect(custodyChange(held, "DIRECT", "2026-10-05")).toEqual({ kind: "schedule", to: "DIRECT", from: "2026-11-01" });
  });

  it("does nothing when the mode in force is chosen and nothing waits", () => {
    expect(custodyChange(held, "HELD", "2026-10-05")).toEqual({ kind: "none" });
  });

  it("cancels a waiting change when the mode in force is chosen", () => {
    const waiting = { stored_mode: "HELD" as const, pending_mode: "DIRECT" as const, pending_from: "2026-11-01" };
    expect(custodyChange(waiting, "HELD", "2026-10-20")).toEqual({ kind: "cancel", pending: "DIRECT" });
  });

  it("keeps the date of a change already waiting", () => {
    const waiting = { stored_mode: "HELD" as const, pending_mode: "DIRECT" as const, pending_from: "2026-11-01" };
    expect(custodyChange(waiting, "DIRECT", "2026-11-03")).toEqual({ kind: "keep", from: "2026-11-01" });
  });
});

describe("branchesNotReady", () => {
  it("names each branch without a collection account set up with the provider", () => {
    const account = (ready: boolean) => ({ id: 1, name: "Main", bank_name: "Zenith", subaccount_ready: ready, subaccount_provider: ready ? "PAYSTACK" : null });
    expect(branchesNotReady([
      { branch: 1, branch_name: "Ikeja", collection_account: account(true), held_balance: 0 },
      { branch: 2, branch_name: "Lekki", collection_account: account(false), held_balance: 20_000_000 },
      { branch: 3, branch_name: "Abuja", collection_account: null, held_balance: 0 },
    ])).toEqual(["Lekki", "Abuja"]);
  });
});

describe("wholeDaysIn", () => {
  it("accepts whole days within the bounds only", () => {
    expect(wholeDaysIn("3", 1, 7)).toBe(3);
    expect(wholeDaysIn("0", 1, 7)).toBeNull();
    expect(wholeDaysIn("8", 1, 7)).toBeNull();
    expect(wholeDaysIn("2.5", 1, 7)).toBeNull();
    expect(wholeDaysIn("", 1, 7)).toBeNull();
  });
});
