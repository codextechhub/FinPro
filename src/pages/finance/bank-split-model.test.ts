/**
 * Bright Star splits its shared GTBank account (ledger 1110, book balance
 * N5,000,000) between Ikeja and Lekki. The form refuses what the server would.
 */

import { describe, expect, it } from "vitest";

import { DIFFERENCE_TREATMENTS, branchDifferences, differenceNote, splitProblems, splitTotals, type SplitRow } from "./bank-split-model";

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

describe("each branch's difference from its share", () => {
  const preview = { branches: [
    { branch_id: 1, branch_name: "Ikeja", book_balance: 600_000_000 },
    { branch_id: 2, branch_name: "Lekki", book_balance: -100_000_000 },
    { branch_id: 3, branch_name: "Ajah", book_balance: 0 },
  ] };

  it("is the branch's book balance less its share, and the whole balance where it takes none", () => {
    const lines = branchDifferences(preview, [
      { branch: "1", opening_balance: 500_000_000 }, { branch: "2", opening_balance: 0 },
    ]);
    expect(lines.map((l) => [l.branch_name, l.share, l.difference])).toEqual([
      ["Ikeja", 500_000_000, 100_000_000], ["Lekki", 0, -100_000_000], ["Ajah", null, 0],
    ]);
  });

  it("says the branch under its share owes the branch over its share, as the split books it", () => {
    const lines = branchDifferences(preview, [
      { branch: "1", opening_balance: 500_000_000 }, { branch: "2", opening_balance: 0 },
    ]);
    expect(differenceNote(lines, "DEBT")).toBe(
      "A branch under its share owes the branches over theirs; the split books each debt as a transfer between branches.",
    );
    expect(differenceNote(lines, "PERMANENT_MOVE")).toBe("Each difference moves through retained earnings, so nothing is owed between branches.");
    expect(differenceNote([{ difference: 0 }], "DEBT")).toBe("Every branch's entries match its share, so nothing is owed between branches.");
  });

  it("explains a debt the same way round on the treatment choice", () => {
    const debt = DIFFERENCE_TREATMENTS.find((t) => t.value === "DEBT")?.help ?? "";
    expect(debt).toContain("A branch whose entries came to less than its share takes cash another branch brought in, so it owes that branch");
  });

  it("blocks the split while money sits in journals no branch holds", () => {
    const problems = splitProblems({
      rows: good, bookBalance: 500_000_000, ledgerPrefix: "1", agreementReference: "Minute 14", splitDate: "2026-09-30",
      unbranched: 2_500_000, formatAmount: (k) => `N${k / 100}`,
    });
    expect(problems).toEqual(["N25000 on this account is in journals no branch holds yet. Give each of those journals its branch before splitting."]);
  });
});
