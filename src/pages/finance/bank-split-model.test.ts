/**
 * Bright Star splits its shared GTBank account (ledger 1110, book balance
 * N5,000,000) between Ikeja and Lekki. The form refuses what the server would.
 */

import { describe, expect, it } from "vitest";

import { DIFFERENCE_TREATMENTS, splitProblems, splitTotals, type SplitRow } from "./bank-split-model";

const row = (over: Partial<SplitRow>): SplitRow => ({
  branch: "1", opening_balance: 0, bank_account_name: "GTBank - Ikeja", ledger_account_code: "1111",
  ledger_account_name: "GTBank Ikeja", is_primary: false, is_primary_collection: false, ...over,
});

const good = [
  row({ opening_balance: 300_000_000, is_primary: true }),
  row({ branch: "2", opening_balance: 200_000_000, bank_account_name: "GTBank - Lekki", ledger_account_code: "1112", ledger_account_name: "GTBank Lekki" }),
];

describe("a shared bank account split", () => {
  it("offers a debt between branches first, as the usual choice", () => {
    expect(DIFFERENCE_TREATMENTS.map((t) => t.value)).toEqual(["DEBT", "PERMANENT_MOVE"]);
  });

  it("adds the shares against the book balance, overdrafts included", () => {
    expect(splitTotals(500_000_000, good)).toEqual({ agreed: 500_000_000, remaining: 0, balanced: true });
    expect(splitTotals(100_000_000, [row({ opening_balance: 150_000_000 }), row({ opening_balance: -50_000_000 })]).balanced).toBe(true);
  });

  it("accepts a complete split", () => {
    expect(splitProblems({ rows: good, bookBalance: 500_000_000, ledgerPrefix: "1", agreementReference: "Minute 14", splitDate: "2026-09-30" })).toEqual([]);
  });

  it("names everything the server would refuse", () => {
    const problems = splitProblems({
      rows: [row({ is_primary: true, ledger_account_code: "511" }), row({ is_primary: true, ledger_account_code: "511" })],
      bookBalance: 500_000_000, ledgerPrefix: "1", agreementReference: " ", splitDate: "",
    });
    expect(problems).toEqual([
      "Give the split date.",
      "Give the reference of the bursars' agreement on these shares.",
      "Name each branch once.",
      "Each new bank account needs its own name.",
      "Each new ledger account needs its own name.",
      "Every new ledger code is four digits.",
      "Each new ledger code is different.",
      "Only one new account can be the main account.",
      "The shares must add up exactly to the account's book balance.",
    ]);
  });

  it("keeps the new ledgers the same kind of account as the shared one", () => {
    const rows = [good[0], { ...good[1], ledger_account_code: "2112" }];
    expect(splitProblems({ rows, bookBalance: 500_000_000, ledgerPrefix: "1", agreementReference: "M", splitDate: "2026-09-30" }))
      .toEqual(["Every new ledger code starts with 1, like the shared account's own."]);
  });

  it("needs at least two branches", () => {
    expect(splitProblems({ rows: [good[0]], bookBalance: 300_000_000, ledgerPrefix: "1", agreementReference: "M", splitDate: "2026-09-30" }))
      .toEqual(["Split into at least two branches."]);
  });
});
