/**
 * Reading a school's custody mode for a menu: Bright Star (HELD) and Greenfield
 * (DIRECT), and readers holding the settings key, the payouts key, or neither.
 */
import { describe, expect, it } from "vitest";
import { custodyReading, mayReadCustody } from "./held-custody";
import { visibleConsoleNav, type ConsoleNavGate } from "./console-nav";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";
import { financeNav } from "../../pages/finance/finance-nav";
import type { CustodyMode } from "@/redux/services/payments/payments-types";

/** A reader holding exactly these backend keys. */
function holder(...keys: string[]) {
  const held = new Set(keys);
  const can = (code: PermissionCode) => held.has(FINANCE_PERMISSION_REGISTRY[code]);
  const gate: ConsoleNavGate = {
    hasAnyPermission: (...codes: PermissionCode[]) => codes.some(can),
    hasModuleAccess: (...prefixes: string[]) => keys.some((key) => prefixes.some((p) => key.startsWith(p))),
  };
  return { can, gate };
}

/** The payout screens the finance menu offers this reader at a school in `mode`. */
function payoutScreens(keys: string[], mode: CustodyMode) {
  const { can, gate } = holder(...keys);
  const may = mayReadCustody(can);
  // The server answers only a reader who may read; anyone else never gets a mode.
  const custody = custodyReading(may, may ? mode : undefined);
  return visibleConsoleNav(financeNav, { ...gate, custody })
    .flatMap((g) => g.items.map((i) => i.title))
    .filter((title) => title === "Payouts" || title === "Batches");
}

describe("custody reading", () => {
  it("is the mode in force when the reader may read it", () => {
    expect(custodyReading(true, "HELD")).toBe("HELD");
    expect(custodyReading(true, "DIRECT")).toBe("DIRECT");
  });

  it("is unknown while the read is in flight or the reader may not read it", () => {
    expect(custodyReading(true, undefined)).toBe("UNKNOWN");
    expect(custodyReading(false, "HELD")).toBe("UNKNOWN");
  });

  it("may be read with the payment settings key or the payouts key", () => {
    expect(mayReadCustody(holder("payments.settings.view").can)).toBe(true);
    expect(mayReadCustody(holder("payments.payout.view").can)).toBe(true);
    expect(mayReadCustody(holder("payments.report.view").can)).toBe(false);
  });
});

describe("payout screens in the menu by custody", () => {
  const payoutOnly = ["payments.payout.view", "payments.report.view"];
  const settingsAndPayouts = ["payments.settings.view", "payments.payout.view", "payments.report.view"];

  it("offers a payout-only bursar Payouts and Batches at a HELD school", () => {
    // Mr Okafor at Bright Star pays suppliers but does not manage payment settings.
    expect(payoutScreens(payoutOnly, "HELD")).toEqual(["Payouts", "Batches"]);
  });

  it("leaves them out for the same bursar at a DIRECT school", () => {
    expect(payoutScreens(payoutOnly, "DIRECT")).toEqual([]);
  });

  it("is unchanged for a holder of the payment settings key", () => {
    expect(payoutScreens(settingsAndPayouts, "HELD")).toEqual(["Payouts", "Batches"]);
    expect(payoutScreens(settingsAndPayouts, "DIRECT")).toEqual([]);
  });

  it("offers nothing to a reader with neither key", () => {
    expect(payoutScreens(["payments.report.view"], "HELD")).toEqual([]);
  });
});
