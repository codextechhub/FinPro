/**
 * Voiding Ikeja's internet recharge changes the books of Ikeja and of every
 * branch that owes a share; a branch that only kept its own share is not one.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/redux/services/finance/interbranch-api", () => ({}));

import { rechargeBranches } from "./recharges-tab";

describe("the branches a recharge's void changes", () => {
  it("are the paying branch and each owing branch", () => {
    expect(rechargeBranches({
      id: 1, document_number: "RC-0001", status: "POSTED", branch_id: 1, branch_name: "Ikeja", rule_id: null,
      expense_account_id: 5, expense_account_code: "5400", amount: 60_000_000, recharge_date: "2026-01-31",
      basis: "COUNTS", narration: "Internet", reference: "",
      lines: [
        { branch_id: 1, branch_name: "Ikeja", weight: 1, amount: 30_000_000, transfer_id: null },
        { branch_id: 2, branch_name: "Lekki", weight: 1, amount: 30_000_000, transfer_id: 41 },
        { branch_id: 3, branch_name: "Yaba", weight: 0, amount: 0, transfer_id: null },
      ],
    })).toEqual([1, 2]);
  });
});
