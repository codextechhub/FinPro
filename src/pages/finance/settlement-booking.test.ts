/**
 * A settlement is booked only when the bank line's shortfall is explained by
 * the provider's fees and the line does not predate a payment it settles.
 *
 * Bright Star's Ikeja account receives N985,000 for N1,000,000 of payments
 * whose reported fees come to N15,000: it books. The same line against fees of
 * N10,000 is refused, as is a line dated before a payment was received.
 */

import { describe, expect, it } from "vitest";

import { paymentsForLine, settlementFigures, settlementProblem, waitingPayments } from "./settlement-booking";

const ZONE = "Africa/Lagos";
const line = { amount: 98_500_000, txn_date: "2026-10-07" };
const pay = (reference: string, amount: number, reported_fee: number | null, confirmed_at = "2026-10-06T10:00:00Z") =>
  ({ reference, amount, reported_fee, confirmed_at });

describe("settlementFigures", () => {
  it("books the line as net, the payments as gross and the difference as the fee", () => {
    expect(settlementFigures(line, [pay("A", 60_000_000, null), pay("B", 40_000_000, null)]))
      .toEqual({ gross: 100_000_000, net: 98_500_000, fee: 1_500_000 });
  });
});

describe("settlementProblem", () => {
  it("accepts a line whose shortfall the reported fees explain", () => {
    expect(settlementProblem(line, [pay("A", 60_000_000, 900_000), pay("B", 40_000_000, 600_000)], ZONE)).toBeNull();
  });

  it("accepts a line when the provider did not report every fee", () => {
    expect(settlementProblem(line, [pay("A", 60_000_000, 900_000), pay("B", 40_000_000, null)], ZONE)).toBeNull();
  });

  it("refuses fees that do not explain the shortfall", () => {
    expect(settlementProblem(line, [pay("A", 60_000_000, 600_000), pay("B", 40_000_000, 400_000)], ZONE))
      .toMatch(/provider's fees on them come to/);
  });

  it("refuses a line that brings more than the payments picked", () => {
    expect(settlementProblem(line, [pay("A", 60_000_000, null)], ZONE)).toMatch(/more than the payments picked/);
  });

  it("refuses a line dated before a payment it settles, read in the school's own day", () => {
    // 23:30 in Lagos on 7 October is 22:30 UTC: still the 7th, so a line of the 7th is fine.
    expect(settlementProblem(line, [pay("A", 98_500_000, 0, "2026-10-07T22:30:00Z")], ZONE)).toBeNull();
    expect(settlementProblem(line, [pay("A", 98_500_000, 0, "2026-10-08T09:00:00Z")], ZONE))
      .toBe("The line is dated before payment A was received.");
  });

  it("measures against the posting date when one is set", () => {
    const late = [pay("A", 98_500_000, 0, "2026-10-08T09:00:00Z")];
    expect(settlementProblem(line, late, ZONE, "2026-10-09")).toBeNull();
    expect(settlementProblem(line, late, ZONE, "2026-10-07")).toMatch(/would be booked before payment A/);
  });

  it("refuses an outflow and an empty pick", () => {
    expect(settlementProblem({ amount: -5_000, txn_date: "2026-10-07" }, [pay("A", 5_000, null)], ZONE)).toMatch(/arriving in the bank/);
    expect(settlementProblem(line, [], ZONE)).toMatch(/Pick the payments/);
  });
});

describe("waitingPayments", () => {
  it("keeps unsettled collections that wait in clearing", () => {
    const base = { gateway_id: 1, reference: "R", provider: "PAYSTACK", provider_reference: "", amount: 1, amount_naira: "", confirmed_at: null, match_basis: "" as const, matched_bank_line_id: null, settled_amount: null, fee_amount: 0, settlement_reference: "", settlement_date: null, settlement_description: "" };
    const rows = [
      { ...base, gateway_id: 1, kind: "COLLECTION" as const, settled: false, via_clearing: true },
      { ...base, gateway_id: 2, kind: "COLLECTION" as const, settled: true, via_clearing: true },
      { ...base, gateway_id: 3, kind: "PAYOUT" as const, settled: false },
      { ...base, gateway_id: 4, kind: "COLLECTION" as const, settled: false, via_clearing: false },
    ];
    expect(waitingPayments(rows).map((r) => r.gateway_id)).toEqual([1]);
  });
});

describe("paymentsForLine", () => {
  const ikejaPay = { gateway_id: 1, branch_id: 1 };
  const lekkiPay = { gateway_id: 2, branch_id: 2 };

  it("offers a line only its own branch's payments", () => {
    expect(paymentsForLine({ branch_id: 1 }, [ikejaPay, lekkiPay]).map((p) => p.gateway_id)).toEqual([1]);
  });

  it("leaves the list whole where the line or a payment names no branch", () => {
    expect(paymentsForLine({ branch_id: null }, [ikejaPay, lekkiPay])).toHaveLength(2);
    expect(paymentsForLine({}, [ikejaPay, lekkiPay])).toHaveLength(2);
    expect(paymentsForLine({ branch_id: 1 }, [{ gateway_id: 3, branch_id: undefined }]).map((p) => p.gateway_id)).toEqual([3]);
  });
});
