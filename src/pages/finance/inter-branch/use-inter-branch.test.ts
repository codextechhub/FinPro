/**
 * The Between Branches reader: every branch of the school, the reader's own,
 * and the keys they hold.
 */

import { describe, expect, it } from "vitest";

import { P } from "../../../permissions";
import { interBranchReader } from "./use-inter-branch";

const rows = [{ id: "1", name: "Ikeja" }, { id: 2, name: "Lekki" }, { id: 3, name: "Yaba" }];

describe("the inter-branch reader", () => {
  it("knows every branch but works in only their own", () => {
    const reader = interBranchReader({
      applies: true, isLoading: false, rows,
      reach: { wholeSchool: false, branchIds: [2], covers: (ids) => ids.length > 0 && ids.every((id) => id === 2) },
      can: (code) => code === P.FIN_VIEW_INTERBRANCH || code === P.FIN_CONFIRM_INTERBRANCH,
    });
    expect(reader.branches.map((b) => b.name)).toEqual(["Ikeja", "Lekki", "Yaba"]);
    expect(reader.mine).toEqual([{ id: 2, name: "Lekki" }]);
    expect(reader.keys).toEqual({ view: true, request: false, transfer: false, confirm: true, recharge: false, reverse: false });
    expect(reader.nameOf(1)).toBe("Ikeja");
    expect(reader.nameOf(9)).toBe("Branch 9");
  });

  it("gives a whole-school reader every branch as their own", () => {
    const reader = interBranchReader({
      applies: true, isLoading: false, rows,
      reach: { wholeSchool: true, branchIds: null, covers: () => true }, can: () => true,
    });
    expect(reader.mine).toHaveLength(3);
  });
});
