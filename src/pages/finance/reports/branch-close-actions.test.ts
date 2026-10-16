/**
 * Which close acts the workbench offers under All branches, and for whom.
 *
 * Meridian Crest runs Ikeja, Lekki and Victoria Island. Its October reads Open
 * for the school because Victoria Island has not closed it, while Ikeja and
 * Lekki have. Mr Bello, its bursar, reads All branches: Re-open must still be
 * offered for Ikeja and Lekki, Close only for Victoria Island, and neither
 * dialog may offer a branch the server would refuse.
 */
import { describe, expect, it } from "vitest";

import type { ReaderBranchLens } from "@/components/finance-ui/raising-branch";
import type { BranchCloseState, FiscalPeriod } from "@/redux/services/finance/setup-types";
import {
  branchList,
  monthActionBranches,
  monthActionCandidates,
  readableBranchStates,
  yearCloseBranches,
  yearReopenBranches,
  type MonthBranchContext,
} from "./branch-close-actions";
import { calendarBranchFor } from "./calendar-branch";

const IKEJA = { id: 1, name: "Ikeja" };
const LEKKI = { id: 2, name: "Lekki" };
const VI = { id: 3, name: "Victoria Island" };

const lens = (patch: Partial<ReaderBranchLens> = {}): ReaderBranchLens => ({
  applies: true,
  pinnedBranch: null,
  branch: "all",
  choices: [IKEJA, LEKKI, VI],
  isLoading: false,
  ...patch,
});
const ALL = calendarBranchFor(lens(), null);

const states = (ikeja: string, lekki: string, vi: string): BranchCloseState[] => [
  { branch: 1, branch_name: "Ikeja", status: ikeja, closed_at: null },
  { branch: 2, branch_name: "Lekki", status: lekki, closed_at: null },
  { branch: 3, branch_name: "Victoria Island", status: vi, closed_at: null },
];

const october = (patch: Partial<MonthBranchContext> = {}): MonthBranchContext => ({
  monthStates: states("CLOSED", "CLOSED", "OPEN"),
  monthStatus: "OPEN",
  yearStates: states("OPEN", "OPEN", "OPEN"),
  yearStatus: "OPEN",
  finalPeriod: false,
  ...patch,
});

const names = (branches: { name: string }[]) => branches.map((branch) => branch.name);

describe("a month the branches stand apart on", () => {
  it("offers Re-open for the branches still closed, though the school reads Open", () => {
    expect(names(monthActionBranches(ALL, "reopen", october()))).toEqual(["Ikeja", "Lekki"]);
  });

  it("offers Close and Soft close only for the branch still open", () => {
    expect(names(monthActionBranches(ALL, "close", october()))).toEqual(["Victoria Island"]);
    expect(names(monthActionBranches(ALL, "soft-close", october()))).toEqual(["Victoria Island"]);
  });

  it("offers a soft-closed branch both its close and its re-open, but not a soft close", () => {
    const context = october({ monthStates: states("SOFT_CLOSED", "CLOSED", "OPEN") });

    expect(names(monthActionBranches(ALL, "close", context))).toEqual(["Ikeja", "Victoria Island"]);
    expect(names(monthActionBranches(ALL, "reopen", context))).toEqual(["Ikeja", "Lekki"]);
    expect(names(monthActionBranches(ALL, "soft-close", context))).toEqual(["Victoria Island"]);
  });

  it("offers Lock only for a branch whose month is closed", () => {
    expect(names(monthActionBranches(ALL, "lock", october()))).toEqual(["Ikeja", "Lekki"]);
  });

  it("offers nothing to close once every branch has closed, and nothing to re-open while all are open", () => {
    expect(monthActionBranches(ALL, "close", october({ monthStates: states("CLOSED", "CLOSED", "CLOSED"), monthStatus: "CLOSED" }))).toEqual([]);
    expect(monthActionBranches(ALL, "reopen", october({ monthStates: states("OPEN", "OPEN", "OPEN") }))).toEqual([]);
  });

  it("reads a branch the states leave out at the school's state", () => {
    const context = october({ monthStates: states("CLOSED", "CLOSED", "OPEN").slice(0, 2), monthStatus: "OPEN" });

    expect(names(monthActionBranches(ALL, "close", context))).toEqual(["Victoria Island"]);
  });

  it("offers only the branches the reader may act for", () => {
    const bello = calendarBranchFor(lens({ choices: [IKEJA, VI] }), null);

    expect(names(monthActionBranches(bello, "reopen", october()))).toEqual(["Ikeja"]);
  });
});

describe("the year holding a month back, branch by branch", () => {
  it("does not offer a month's re-open for a branch whose year is closed", () => {
    const context = october({ yearStates: states("CLOSED", "OPEN", "OPEN") });

    expect(names(monthActionCandidates(ALL, "reopen", context))).toEqual(["Ikeja", "Lekki"]);
    expect(names(monthActionBranches(ALL, "reopen", context))).toEqual(["Lekki"]);
  });

  it("locks the final month only for a branch whose year has closed", () => {
    const context = october({ finalPeriod: true, yearStates: states("CLOSED", "OPEN", "OPEN") });

    expect(names(monthActionBranches(ALL, "lock", context))).toEqual(["Ikeja"]);
  });

  it("falls back to the school's year when the year's branch states are not read", () => {
    expect(monthActionBranches(ALL, "reopen", october({ yearStates: null, yearStatus: "CLOSED" }))).toEqual([]);
  });
});

describe("whether the branch states can be judged by", () => {
  it("judges by them only under All branches", () => {
    expect(readableBranchStates(ALL, states("CLOSED", "CLOSED", "OPEN"))).toHaveLength(3);
    expect(readableBranchStates(calendarBranchFor(lens(), "1"), states("CLOSED", "CLOSED", "OPEN"))).toBeNull();
  });

  it("falls back to the school's state when the row sends none or a state is closed", () => {
    expect(readableBranchStates(ALL, undefined)).toBeNull();
    expect(readableBranchStates(ALL, [])).toBeNull();
    const hidden = [{ branch: 1, branch_name: "Ikeja", closed_at: null }] as unknown as BranchCloseState[];
    expect(readableBranchStates(ALL, hidden)).toBeNull();
  });
});

const month = (no: number, status: FiscalPeriod["status"], branchStates: BranchCloseState[]): FiscalPeriod => ({
  id: no,
  period_no: no,
  name: `2026-${String(no).padStart(2, "0")}`,
  label: `Month ${no}`,
  fiscal_year: 2026,
  start_date: `2026-${String(no).padStart(2, "0")}-01`,
  end_date: `2026-${String(no).padStart(2, "0")}-28`,
  status,
  closed_at: null,
  branch_states: branchStates,
});

describe("a fiscal year the branches stand apart on", () => {
  it("offers the year's close for a branch whose every month is closed, though the school's are not", () => {
    const periods = [
      month(1, "CLOSED", states("CLOSED", "CLOSED", "CLOSED")),
      month(2, "OPEN", states("CLOSED", "OPEN", "OPEN")),
    ];

    expect(names(yearCloseBranches(ALL, states("OPEN", "OPEN", "OPEN"), "OPEN", periods))).toEqual(["Ikeja"]);
  });

  it("does not offer the year's close for a branch that has already closed it", () => {
    const periods = [month(1, "CLOSED", states("CLOSED", "CLOSED", "CLOSED"))];

    expect(names(yearCloseBranches(ALL, states("CLOSED", "OPEN", "OPEN"), "OPEN", periods))).toEqual(["Lekki", "Victoria Island"]);
  });

  it("offers the year's re-open for each branch whose year is closed, though the school's is open", () => {
    expect(names(yearReopenBranches(ALL, states("CLOSED", "LOCKED", "OPEN"), "OPEN"))).toEqual(["Ikeja"]);
  });
});

describe("naming the branches", () => {
  it("reads as a sentence would", () => {
    expect(branchList([IKEJA])).toBe("Ikeja");
    expect(branchList([IKEJA, LEKKI])).toBe("Ikeja and Lekki");
    expect(branchList([IKEJA, LEKKI, VI])).toBe("Ikeja, Lekki and Victoria Island");
  });
});
