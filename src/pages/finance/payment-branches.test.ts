/**
 * A payments row names its branch by id; the column turns it into the branch's
 * name. A row raised before records carried a branch says so rather than
 * claiming to belong to every branch.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../host", () => ({ useBranches: () => ({ data: [], isLoading: false, isError: false }), hostBranchLens: undefined }));

import { branchNameOf } from "./payment-branches";

const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: "2", name: "Lekki" }];

describe("branchNameOf", () => {
  it("names the branch whatever type its id arrives as", () => {
    expect(branchNameOf(BRANCHES, 1)).toBe("Ikeja");
    expect(branchNameOf(BRANCHES, 2)).toBe("Lekki");
  });

  it("says a row has no branch yet instead of calling it school-wide", () => {
    expect(branchNameOf(BRANCHES, null)).toBe("No branch yet");
    expect(branchNameOf(BRANCHES, undefined)).toBe("No branch yet");
  });

  it("falls back to the number for a branch the list does not hold", () => {
    expect(branchNameOf(BRANCHES, 9)).toBe("Branch 9");
  });
});
