/**
 * Splitting the chart: the accounts Mrs Adeyemi uses stay in the tree, the
 * ones the software keeps fold away, and a header never loses its place.
 */
import { describe, expect, it } from "vitest";
import type { Account } from "@/redux/services/finance/setup-types";
import { buildAccountTree } from "./account-group";
import { hasManagedSplit, partitionChart, pruneTree } from "./chart-split";

const KEPT = { keeper: "the receivables ledger", moved_by: "an invoice", hand_journals: false };
const account = (id: number, code: string, over: Partial<Account> = {}): Account => ({
  id, code, name: `Account ${code}`, account_type: "ASSET", normal_balance: "DEBIT", is_contra: false,
  is_postable: true, is_active: true, parent_id: null, parent_code: null, subtype: "",
  balance: { kobo: 100, naira: "1.00" }, managed_by: null, ...over,
});

describe("hasManagedSplit", () => {
  it("is true when any row carries the key, even as null", () => {
    expect(hasManagedSplit([account(1, "1100")])).toBe(true);
  });

  it("is false when the server leaves the key off every row", () => {
    const { managed_by: _hidden, ...bare } = account(1, "1100");
    expect(hasManagedSplit([bare])).toBe(false);
    expect(hasManagedSplit([])).toBe(false);
  });
});

describe("partitionChart", () => {
  it("keeps a system header with the everyday account beneath it", () => {
    const rows = [
      account(1, "1000", { is_postable: false, managed_by: KEPT }),
      account(2, "1100", { parent_id: 1 }),
      account(3, "1200", { parent_id: 1, managed_by: KEPT }),
    ];
    const { everyday, system } = partitionChart(rows);
    expect([...everyday].sort()).toEqual([1, 2]);
    expect([...system]).toEqual([3]);
  });

  it("gives a system header with only system accounts to the system", () => {
    const rows = [
      account(1, "1000", { is_postable: false, managed_by: KEPT }),
      account(3, "1200", { parent_id: 1, managed_by: KEPT }),
    ];
    expect(partitionChart(rows).everyday.size).toBe(0);
    expect(partitionChart(rows).system.size).toBe(2);
  });
});

describe("pruneTree", () => {
  it("lifts a kept account out from under an account that is not kept, and keeps rolled balances", () => {
    const rows = [
      account(1, "1000", { is_postable: false }),
      account(2, "1100", { parent_id: 1 }),
      account(3, "1200", { parent_id: 1, managed_by: KEPT }),
    ];
    const tree = buildAccountTree(rows);
    const main = pruneTree(tree, new Set([1, 2]));
    expect(main.map((n) => n.id)).toEqual([1]);
    expect(main[0].children.map((n) => n.id)).toEqual([2]);
    expect(main[0].rolled).toBe(300);
    expect(pruneTree(tree, new Set([3])).map((n) => n.id)).toEqual([3]);
  });
});
