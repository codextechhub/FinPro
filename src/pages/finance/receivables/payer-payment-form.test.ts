/**
 * The payer payment form's rules.
 *
 * Mr Okafor (PAY-OKAFOR) pays N500,000 for Ada (CUS-ADA) and Emeka (CUS-EMEKA).
 * The form sends the school's split unless the bursar picks another or types
 * the amounts, and a preview stops matching the form the moment a field changes.
 */
import { describe, expect, it } from "vitest";
import {
  amountsFromPlan, emptyPayerPaymentForm, inputKey, manualTotals, needsManualAmounts, payerPaymentInput,
} from "./payer-payment-form";
import type { PayerPlanShare } from "@/redux/services/finance/fees-types";

const CODES = ["PAY-OKAFOR", "CUS-ADA", "CUS-EMEKA"];
const filled = { ...emptyPayerPaymentForm(), payer: "PAY-OKAFOR", bankAccount: "7", amount: 500_000_00, date: "2026-10-01" };

describe("payer payment form", () => {
  it("sends nothing until payer, bank, amount and date are given", () => {
    expect(payerPaymentInput("BSS", emptyPayerPaymentForm(), CODES)).toBeNull();
    expect(payerPaymentInput("BSS", { ...filled, date: "" }, CODES)).toBeNull();
  });

  it("leaves the split to the school unless one is chosen", () => {
    expect(payerPaymentInput("BSS", filled, CODES)).toEqual({
      entity: "BSS", payer: "PAY-OKAFOR", bank_account: 7, amount: 500_000_00,
      payment_date: "2026-10-01", method: "BANK_TRANSFER",
    });
    expect(payerPaymentInput("BSS", { ...filled, split: "PROPORTIONAL" }, CODES)).toMatchObject({ split: "PROPORTIONAL" });
  });

  it("sends typed amounts as shares, leaving out a customer given nothing", () => {
    const state = { ...filled, manual: true, amounts: { "CUS-ADA": 300_000_00, "CUS-EMEKA": 200_000_00, "PAY-OKAFOR": 0 } };
    const input = payerPaymentInput("BSS", state, CODES);
    expect(input?.shares).toEqual([
      { customer: "CUS-ADA", amount: 300_000_00 },
      { customer: "CUS-EMEKA", amount: 200_000_00 },
    ]);
    expect(input).not.toHaveProperty("split");
  });

  it("allows typed amounts below the payment and refuses them above it", () => {
    const under = { ...filled, manual: true, amounts: { "CUS-ADA": 400_000_00 } };
    expect(manualTotals(under, CODES)).toEqual({ entered: 400_000_00, left: 100_000_00, fits: true });
    expect(payerPaymentInput("BSS", under, CODES)).not.toBeNull();
    const over = { ...filled, manual: true, amounts: { "CUS-ADA": 400_000_00, "CUS-EMEKA": 300_000_00 } };
    expect(manualTotals(over, CODES).fits).toBe(false);
    expect(payerPaymentInput("BSS", over, CODES)).toBeNull();
  });

  it("asks for amounts when the split in force is as entered", () => {
    expect(needsManualAmounts("", "AS_ENTERED")).toBe(true);
    expect(needsManualAmounts("OLDEST_FIRST", "AS_ENTERED")).toBe(false);
    expect(needsManualAmounts("", "OLDEST_FIRST")).toBe(false);
  });

  it("makes a preview stale when any field changes", () => {
    const before = inputKey(payerPaymentInput("BSS", filled, CODES));
    expect(inputKey(payerPaymentInput("BSS", { ...filled, amount: 450_000_00 }, CODES))).not.toBe(before);
    expect(inputKey(payerPaymentInput("BSS", { ...filled }, CODES))).toBe(before);
    expect(inputKey(null)).toBe("");
  });

  it("seeds typed amounts from a preview, adding a customer's shares at two branches", () => {
    const share = (code: string, branch: number, amount: number): PayerPlanShare => ({
      customer: { id: 1, code, name: code }, branch_id: branch, branch_name: "", kind: "RECEIPT", amount, credit: 0,
    });
    expect(amountsFromPlan([share("CUS-ADA", 1, 100), share("CUS-ADA", 2, 50), share("CUS-EMEKA", 2, 70)]))
      .toEqual({ "CUS-ADA": 150, "CUS-EMEKA": 70 });
  });
});
