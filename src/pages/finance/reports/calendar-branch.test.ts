/**
 * Whose fiscal calendar the close workbench reads, and which branch each action
 * sends.
 *
 * Harbour Primary runs one branch: nothing is asked and nothing is sent, and the
 * server takes that branch. Bright Star runs Ikeja and Lekki. Mr Bello, its
 * bursar, picks a branch in the page address or reads All branches, where every
 * action asks him which branch; Mrs Adeyemi, posted to Ikeja alone, always reads
 * and acts on Ikeja.
 */
import { describe, expect, it } from "vitest";

import type { ReaderBranchLens } from "@/components/finance-ui/raising-branch";
import { actionBranch, actionBranchReady, calendarBranchFor } from "./calendar-branch";

const IKEJA = { id: 1, name: "Ikeja" };
const LEKKI = { id: 2, name: "Lekki" };

const lens = (patch: Partial<ReaderBranchLens>): ReaderBranchLens => ({
  applies: true,
  pinnedBranch: null,
  branch: "all",
  choices: [IKEJA, LEKKI],
  isLoading: false,
  ...patch,
});

describe("a school with one branch", () => {
  const calendar = calendarBranchFor(lens({ applies: false, choices: [IKEJA] }), "1");

  it("reads the school's calendar and offers no branch choice", () => {
    expect(calendar).toMatchObject({ applies: false, canChoose: false, readBranch: undefined, mustAsk: false });
  });

  it("sends no branch, leaving the server to take the only one", () => {
    expect(actionBranch(calendar, "")).toBeUndefined();
    expect(actionBranchReady(calendar, "")).toBe(true);
  });
});

describe("a bursar at a school with several branches", () => {
  it("reads and acts on the branch named in the page address", () => {
    const calendar = calendarBranchFor(lens({}), "2");

    expect(calendar).toMatchObject({ canChoose: true, selected: 2, readBranch: 2, actBranch: 2, mustAsk: false });
    expect(actionBranch(calendar, "")).toBe(2);
  });

  it("reads the school's calendar under All branches and asks each action for a branch", () => {
    const calendar = calendarBranchFor(lens({}), null);

    expect(calendar).toMatchObject({ canChoose: true, selected: "all", readBranch: undefined, actBranch: null, mustAsk: true });
    expect(actionBranchReady(calendar, "")).toBe(false);
    expect(actionBranch(calendar, "1")).toBe(1);
    expect(actionBranchReady(calendar, "1")).toBe(true);
  });

  it("treats a branch outside their reach in the address as All branches", () => {
    expect(calendarBranchFor(lens({}), "9").selected).toBe("all");
    expect(calendarBranchFor(lens({}), "ikeja").selected).toBe("all");
  });
});

describe("a reader posted to one branch of several", () => {
  it("reads and acts on their branch whatever the address says", () => {
    const calendar = calendarBranchFor(lens({ pinnedBranch: 1, choices: [IKEJA] }), "2");

    expect(calendar).toMatchObject({ canChoose: false, selected: 1, readBranch: 1, actBranch: 1, mustAsk: false });
  });
});
