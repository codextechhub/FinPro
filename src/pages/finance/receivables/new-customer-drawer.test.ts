/**
 * Who is asked which branch a new customer belongs to.
 *
 * Corona runs Ikeja, Lekki and Yaba. Mrs Okafor covers Ikeja and Lekki: she
 * must file the Adeyemi family under one of hers, since the server asks her
 * which. Mr Eze covers the whole school: he may file them under a branch or
 * leave them shared. Mrs Bello, posted to Ikeja alone, and anyone at a school
 * with one branch are not asked.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
}));

import { customerBranchChoice } from "./new-customer-drawer";

const IKEJA = { id: 10, name: "Ikeja Branch" };
const LEKKI = { id: 20, name: "Lekki Branch" };
const YABA = { id: 30, name: "Yaba Branch" };
const lens = (over: Record<string, unknown>) => ({
  applies: true, pinnedBranch: null, branch: "all" as const, choices: [IKEJA, LEKKI, YABA], isLoading: false, ...over,
});

describe("customerBranchChoice", () => {
  it("makes a reader covering two branches name one of hers", () => {
    const c = customerBranchChoice(lens({ choices: [IKEJA, LEKKI] }), false);
    expect(c).toMatchObject({ ask: true, required: true, initial: "" });
    expect(c.choices.map((b) => b.name)).toEqual(["Ikeja Branch", "Lekki Branch"]);
  });

  it("lets a whole-school reader leave the customer shared, starting on his working branch", () => {
    expect(customerBranchChoice(lens({ branch: 20 }), true)).toMatchObject({ ask: true, required: false, initial: "20" });
  });

  it("asks nobody pinned to one branch, nor anyone at a one-branch school", () => {
    expect(customerBranchChoice(lens({ pinnedBranch: 10, choices: [IKEJA] }), false).ask).toBe(false);
    expect(customerBranchChoice(lens({ applies: false, choices: [IKEJA] }), true).ask).toBe(false);
  });
});
