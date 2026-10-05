import { describe, expect, it } from "vitest";

import type { TaxFilingShare } from "@/redux/services/finance/ops-types";
import { shareIsPayable, taxShareView } from "./tax-shares";

const share = (over: Partial<TaxFilingShare>): TaxFilingShare => ({
  id: 1, branch_id: 1, branch_name: "Ikeja", branch_pending: false, label: "Ikeja",
  gross_liability: 0, recoverable_amount: 0, brought_forward_credit: 0, adjustment_amount: 0,
  amount_due: 8_000_000, amount_paid: 0, balance_due: 8_000_000, carried_forward_credit: 0,
  payment_status: "UNPAID", line_count: 3, filing_journal_id: null, ...over,
});

const IKEJA = share({});
const LEKKI = share({ id: 2, branch_id: 2, branch_name: "Lekki", label: "Lekki", amount_due: 4_000_000, balance_due: 4_000_000 });

describe("taxShareView", () => {
  it("shows each branch's share at a school with several, paid row by row", () => {
    const view = taxShareView({ branch_breakdown: [IKEJA, LEKKI] }, true);
    expect(view.show).toBe(true);
    expect(view.open).toHaveLength(2);
    expect(view.single).toBeNull();
  });

  it("pays the one open share from the single button once the other is paid", () => {
    const paidIkeja = { ...IKEJA, amount_paid: 8_000_000, balance_due: 0, payment_status: "PAID" };
    expect(taxShareView({ branch_breakdown: [paidIkeja, LEKKI] }, true).single).toEqual(LEKKI);
  });

  it("hides the shares at a one-branch school", () => {
    const view = taxShareView({ branch_breakdown: [IKEJA] }, false);
    expect(view.show).toBe(false);
    expect(view.single).toEqual(IKEJA);
  });

  it("copes with a server that sends no breakdown", () => {
    expect(taxShareView({}, true)).toEqual({ show: false, shares: [], open: [], single: null });
  });
});

describe("shareIsPayable", () => {
  it("needs a balance and a real branch", () => {
    expect(shareIsPayable(IKEJA)).toBe(true);
    expect(shareIsPayable({ ...IKEJA, balance_due: 0 })).toBe(false);
    expect(shareIsPayable({ ...IKEJA, branch_id: null, branch_pending: true })).toBe(false);
  });
});
