/**
 * The petty cash return rules, told as Ikeja's front-desk float: a N100,000
 * float held by its custodian, cut to N60,000 or closed outright.
 */
import { describe, expect, it } from "vitest";

import type { PettyCashFund, PettyCashReturn, PettyCashVoucher } from "@/redux/services/finance/ops-types";
import {
  closeBlockers, closeFigures, closeProblem, differenceSentence, floatBeforeClosure, fundEditProblem,
  reduceFigures, reduceProblem, registerTone, returnVoidable, voidBlocker,
} from "./petty-cash-returns";

const NAIRA = 100;
const FUND: PettyCashFund = {
  id: 1, branch_id: 1, name: "Front desk", gl_account: "1150", gl_account_id: 9, custodian_id: null,
  custodian_name: "Mrs Eze", custodian_label: "Mrs Eze", float_amount: 100_000 * NAIRA,
  float_amount_naira: "", current_balance: 100_000 * NAIRA, current_balance_naira: "", shortfall: 0,
  currency: "NGN", last_replenished_at: null, is_active: true, state: "ACTIVE", closed_on: null, closed_by_id: null,
};

const ret = (over: Partial<PettyCashReturn>): PettyCashReturn => ({
  id: 10, document_number: "PCR-0010", status: "POSTED", kind: "REDUCE", kind_label: "Reduce the float",
  branch_id: 1, fund_id: 1, fund_name: "Front desk", bank_account_id: 3, bank_account_name: "Ikeja GTBank",
  return_date: "2026-10-01", counted_amount: 100_000 * NAIRA, book_balance: 100_000 * NAIRA, difference: 0,
  shortage: 0, overage: 0, difference_reason: "", amount: 40_000 * NAIRA, amount_naira: "", cash_left: 60_000 * NAIRA,
  previous_float_amount: 100_000 * NAIRA, new_float_amount: 60_000 * NAIRA, counted_by_id: null, narration: "",
  reference: "", journal_id: 5, created_by_id: 7, ...over,
});

describe("reducing a float", () => {
  it("banks everything above the new float when the count agrees with the books", () => {
    const figures = reduceFigures({ counted: 100_000 * NAIRA, book: 100_000 * NAIRA, newFloat: 60_000 * NAIRA });
    expect(figures).toEqual({ difference: 0, shortage: 0, overage: 0, banked: 40_000 * NAIRA, tinKeeps: 60_000 * NAIRA });
    expect(differenceSentence(figures)).toBeNull();
    expect(reduceProblem({ figures, newFloat: 60_000 * NAIRA, currentFloat: FUND.float_amount, hasBank: true, reason: "" })).toBeNull();
  });

  it("sends a short count to Cash over and short, and needs a reason for it", () => {
    const figures = reduceFigures({ counted: 98_500 * NAIRA, book: 100_000 * NAIRA, newFloat: 60_000 * NAIRA });
    expect(figures.banked).toBe(38_500 * NAIRA);
    expect(figures.shortage).toBe(1_500 * NAIRA);
    expect(differenceSentence(figures)).toBe("₦1,500.00 short. It goes to Cash over and short.");
    const args = { figures, newFloat: 60_000 * NAIRA, currentFloat: FUND.float_amount, hasBank: true };
    expect(reduceProblem({ ...args, reason: " " })).toBe("The count differs from the books. Say why.");
    expect(reduceProblem({ ...args, reason: "coins missing" })).toBeNull();
  });

  it("refuses what only a closure or a plain edit may do, in the server's words", () => {
    const base = { currentFloat: FUND.float_amount, hasBank: true, reason: "" };
    expect(reduceProblem({ ...base, newFloat: 0, figures: reduceFigures({ counted: 100, book: 100, newFloat: 0 }) }))
      .toBe("A float cut to nothing is a closure. Use Close fund instead.");
    expect(reduceProblem({ ...base, newFloat: FUND.float_amount, figures: reduceFigures({ counted: 100, book: 100, newFloat: FUND.float_amount }) }))
      .toContain("must be lower than the current float of ₦100,000.00");
    expect(reduceProblem({ ...base, newFloat: 60_000 * NAIRA, figures: reduceFigures({ counted: 50_000 * NAIRA, book: 50_000 * NAIRA, newFloat: 60_000 * NAIRA }) }))
      .toContain("Nothing to bank");
    expect(reduceProblem({ ...base, hasBank: false, newFloat: 60_000 * NAIRA, figures: reduceFigures({ counted: 100_000 * NAIRA, book: 100_000 * NAIRA, newFloat: 60_000 * NAIRA }) }))
      .toBe("Choose the bank account the cash goes into.");
  });
});

describe("closing a fund", () => {
  const voucher = (status: string, n: string): PettyCashVoucher => ({
    id: Number(n.slice(-1)), document_number: n, fund_id: 1, voucher_date: "2026-10-01", payee: "", spent_by_id: null,
    narration: "", reference: "", status, subtotal: 0, tax_total: 0, total: 0, total_naira: "", journal_id: null, expense_account: null,
  });

  it("is held up by a voucher not yet posted and by a return still waiting", () => {
    const blockers = closeBlockers(1, [voucher("DRAFT", "PCV-1"), voucher("POSTED", "PCV-2")], [ret({ status: "PENDING_APPROVAL", document_number: "PCR-0011" })]);
    expect(blockers).toEqual([
      "Vouchers not yet posted: PCV-1. Post or cancel them first.",
      "Return PCR-0011 of this fund is still waiting on approval. Settle it before counting the tin again.",
    ]);
    expect(closeProblem({ blockers, figures: closeFigures({ counted: 0, book: 0 }), hasBank: false, reason: "" })).toBe(blockers[0]);
  });

  it("banks everything counted, and needs a bank only when there is cash", () => {
    expect(closeBlockers(1, [voucher("CANCELLED", "PCV-3")], [])).toEqual([]);
    const figures = closeFigures({ counted: 20_000 * NAIRA, book: 20_000 * NAIRA });
    expect(figures.banked).toBe(20_000 * NAIRA);
    expect(figures.tinKeeps).toBe(0);
    expect(closeProblem({ blockers: [], figures, hasBank: false, reason: "" })).toBe("Choose the bank account the cash goes into.");
    expect(closeProblem({ blockers: [], figures: closeFigures({ counted: 0, book: 0 }), hasBank: false, reason: "" })).toBeNull();
  });
});

describe("voiding a return", () => {
  it("offers Void on a posted return and Cancel on a draft, nothing on the rest", () => {
    expect(returnVoidable(ret({ status: "POSTED" }))).toBe(true);
    expect(returnVoidable(ret({ status: "DRAFT" }))).toBe(true);
    expect(returnVoidable(ret({ status: "REVERSED" }))).toBe(false);
    expect(returnVoidable(ret({ status: "PENDING_APPROVAL" }))).toBe(false);
  });

  it("does not cancel a draft whose approval request is open, sent back included", () => {
    expect(returnVoidable(ret({ status: "DRAFT", approval_state: "PENDING", approval_returned: true }))).toBe(false);
    expect(returnVoidable(ret({ status: "DRAFT", approval_state: "REJECTED", approval_returned: false }))).toBe(true);
  });

  it("names the refusal the screen can already see", () => {
    const first = ret({ id: 10 });
    const later = ret({ id: 12, document_number: "PCR-0012" });
    const fund = { ...FUND, float_amount: 60_000 * NAIRA };
    expect(voidBlocker(first, { returns: [later, first], fund })).toBe("Return PCR-0012 of this fund came after PCR-0010. Void it first.");
    expect(voidBlocker(later, { returns: [later, first], fund })).toBeNull();
    expect(voidBlocker(first, { returns: [first], fund: { ...FUND, float_amount: 70_000 * NAIRA } }))
      .toBe("The float has changed since PCR-0010. Put it back to ₦60,000.00 first.");
    const closure = ret({ kind: "CLOSE", new_float_amount: 0 });
    expect(voidBlocker(closure, { returns: [closure], fund: { ...FUND, float_amount: 0, state: "ACTIVE" } }))
      .toBe("The fund has been reopened since PCR-0010 closed it.");
    expect(voidBlocker(closure, { returns: [closure], fund: { ...FUND, float_amount: 0, state: "CLOSED", is_active: false } })).toBeNull();
  });
});

describe("the fund register and fund edits", () => {
  it("tones the categories a return writes", () => {
    expect(registerTone("Returned to bank", 0)).toBe("bank");
    expect(registerTone("Count short", 0)).toBe("short");
    expect(registerTone("Count over", 150)).toBe("over");
    expect(registerTone("Top-up", 150)).toBe("in");
    expect(registerTone("Stationery", 0)).toBe("out");
  });

  it("refuses an edit that only a return or a reopen may make, pointing at it", () => {
    expect(fundEditProblem({ fund: FUND, onHand: FUND.current_balance, floatAmount: 60_000 * NAIRA, isActive: true }))
      .toMatchObject({ action: "reduce" });
    expect(fundEditProblem({ fund: FUND, onHand: FUND.current_balance, floatAmount: FUND.float_amount, isActive: false }))
      .toMatchObject({ action: "close" });
    const closed = { ...FUND, state: "CLOSED" as const, is_active: false, float_amount: 0, current_balance: 0 };
    expect(fundEditProblem({ fund: closed, onHand: 0, floatAmount: 50_000 * NAIRA, isActive: false }))
      .toMatchObject({ action: "reopen" });
    expect(fundEditProblem({ fund: FUND, onHand: 40_000 * NAIRA, floatAmount: 60_000 * NAIRA, isActive: true })).toBeNull();
    expect(fundEditProblem({ fund: closed, onHand: 0, floatAmount: 0, isActive: false })).toBeNull();
  });

  it("starts a reopened fund on the float its last closure ended", () => {
    const closure = ret({ id: 20, kind: "CLOSE", previous_float_amount: 80_000 * NAIRA, new_float_amount: 0 });
    expect(floatBeforeClosure(1, [ret({}), closure])).toBe(80_000 * NAIRA);
    expect(floatBeforeClosure(2, [closure])).toBe(0);
  });
});
