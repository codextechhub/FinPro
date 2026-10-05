/**
 * Which branch's petty cash the page shows. Harbour Primary runs one branch, so
 * nothing about branches appears. Bright Star runs Ikeja and Lekki: Mrs Bello
 * covers both and picks; Mrs Adeyemi is Lekki's own bursar and is never asked.
 */
import { describe, expect, it } from "vitest";

import type { PettyCashFund } from "@/redux/services/finance/ops-types";
import { branchName, fundOptionLabel, inBranch, pettyCashBranchFor, pickFund } from "./petty-cash-branch";

const IKEJA = { id: 1, name: "Ikeja" };
const LEKKI = { id: 2, name: "Lekki" };
const lens = (over: Partial<Parameters<typeof pettyCashBranchFor>[0]>) => ({
  applies: true, pinnedBranch: null, branch: "all" as const, choices: [IKEJA, LEKKI], isLoading: false, ...over,
});
const fund = (id: number, branch_id: number | null, over: Partial<PettyCashFund> = {}): PettyCashFund => ({
  id, branch_id, name: `Fund ${id}`, gl_account: "1150", gl_account_id: 1, custodian_id: null, custodian_name: "",
  custodian_label: "Mrs Eze", float_amount: 0, float_amount_naira: "", current_balance: 0, current_balance_naira: "",
  shortfall: 0, currency: null, last_replenished_at: null, is_active: true, state: "ACTIVE", ...over,
});

describe("petty cash branch lens", () => {
  it("shows nothing about branches at a school with one branch", () => {
    const view = pettyCashBranchFor(lens({ applies: false, choices: [{ id: 9, name: "Main" }] }), "2");
    expect(view).toMatchObject({ applies: false, canChoose: false, selected: "all", showBranch: false });
    expect(inBranch([fund(1, 9), fund(2, null)], view)).toHaveLength(2);
    expect(fundOptionLabel(fund(1, 9), view)).toBe("Fund 1 · Mrs Eze");
  });

  it("keeps a branch-bound reader on their own branch without asking", () => {
    const view = pettyCashBranchFor(lens({ pinnedBranch: 2, choices: [LEKKI] }), null);
    expect(view).toMatchObject({ applies: true, canChoose: false, selected: 2, showBranch: false });
    expect(inBranch([fund(1, 1), fund(2, 2)], view).map((f) => f.id)).toEqual([2]);
  });

  it("lets a reader of several branches pick one from the page address, else every branch", () => {
    const all = pettyCashBranchFor(lens({}), null);
    expect(all).toMatchObject({ canChoose: true, selected: "all", showBranch: true });
    expect(fundOptionLabel(fund(1, 1), all)).toBe("Fund 1 · Mrs Eze · Ikeja");
    expect(fundOptionLabel(fund(3, null, { state: "CLOSED" }), all)).toBe("Fund 3 · Mrs Eze · No branch yet (closed)");

    const lekki = pettyCashBranchFor(lens({}), "2");
    expect(lekki).toMatchObject({ selected: 2, showBranch: false });
    expect(inBranch([fund(1, 1), fund(2, 2)], lekki).map((f) => f.id)).toEqual([2]);
    expect(pettyCashBranchFor(lens({}), "99").selected).toBe("all");
    expect(branchName(all, 2)).toBe("Lekki");
  });

  it("opens on the fund in the address, else the first running one", () => {
    const funds = [fund(1, 1, { state: "CLOSED", is_active: false }), fund(2, 1), fund(3, 1)];
    expect(pickFund(funds, "3")?.id).toBe(3);
    expect(pickFund(funds, null)?.id).toBe(2);
    expect(pickFund(funds, "x")?.id).toBe(2);
    expect(pickFund([], null)).toBeUndefined();
  });
});
