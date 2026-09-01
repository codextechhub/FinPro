import { describe, expect, it } from "vitest";
import type { Account } from "@/redux/services/finance/setup-types";
import {
  accountGroupContribution,
  buildAccountTree,
  descendantPostingAccounts,
} from "./account-group";

const account = (overrides: Partial<Account>): Account => ({
  id: 1,
  code: "1000",
  name: "Assets",
  account_type: "ASSET",
  normal_balance: "DEBIT",
  is_contra: false,
  is_postable: false,
  is_active: true,
  parent_id: null,
  parent_code: null,
  subtype: "",
  ...overrides,
});

describe("account group helpers", () => {
  it("returns every nested posting descendant without unrelated accounts", () => {
    const accounts = [
      account({ id: 1 }),
      account({ id: 2, code: "1100", parent_id: 1, is_postable: false }),
      account({ id: 3, code: "1110", parent_id: 2, is_postable: true }),
      account({ id: 4, code: "1200", parent_id: 1, is_postable: true }),
      account({ id: 5, code: "2100", parent_id: null, is_postable: true }),
    ];

    expect(descendantPostingAccounts(accounts, 1).map(({ id }) => id)).toEqual([3, 4]);
  });

  it("subtracts contra balances from the group contribution", () => {
    const contra = account({
      normal_balance: "CREDIT",
      is_contra: true,
      is_postable: true,
      balance: { kobo: 2500, naira: "25.00" },
    });

    expect(accountGroupContribution(contra, "DEBIT")).toBe(-2500);
  });

  it("nets contra descendants from parent tree balances", () => {
    const accounts = [
      account({
        id: 1,
        code: "4000",
        name: "Income",
        account_type: "INCOME",
        normal_balance: "CREDIT",
        is_postable: false,
        balance: { kobo: 0, naira: "0.00" },
      }),
      account({
        id: 2,
        code: "4100",
        name: "Operating Revenue",
        account_type: "INCOME",
        normal_balance: "CREDIT",
        parent_id: 1,
        balance: { kobo: 2_912_000_000, naira: "29,120,000.00" },
      }),
      account({
        id: 3,
        code: "4900",
        name: "Sales Returns & Allowances",
        account_type: "INCOME",
        normal_balance: "DEBIT",
        is_contra: true,
        parent_id: 1,
        balance: { kobo: 2_500_000, naira: "25,000.00" },
      }),
    ];

    const [income] = buildAccountTree(accounts);

    expect(income.rolled).toBe(2_909_500_000);
  });
});
