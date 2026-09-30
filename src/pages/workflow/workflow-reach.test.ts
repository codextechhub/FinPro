import { describe, expect, it } from "vitest";
import type { HostReaderReach } from "@xvs/finance/host";
import { groupBranchIds, publishTarget, rowBranchIds } from "./workflow-reach";

/**
 * Bright Star runs Ikeja (1), Lekki (2) and Yaba (3). Mr Okafor covers the
 * whole school; Mrs Bello works at Lekki only; Mr Ade works at Lekki and Yaba.
 */
const reachOf = (ids: number[] | null): HostReaderReach => ({
  wholeSchool: ids === null,
  branchIds: ids,
  covers: (want) =>
    ids === null || (want.length > 0 && want.every((id) => ids.includes(id))),
});
const okafor = reachOf(null);
const bello = reachOf([2]);
const ade = reachOf([2, 3]);

const schoolLadder = { branch: null, is_platform: false };
const lekkiLadder = { branch: 2, is_platform: false };
const sharedLadder = { branch: null, is_platform: true };

describe("rowBranchIds", () => {
  it("reads a blank branch as the whole school and a string id as a number", () => {
    expect(rowBranchIds(null)).toEqual([]);
    expect(rowBranchIds("")).toEqual([]);
    expect(rowBranchIds("2")).toEqual([2]);
  });
});

describe("publishTarget", () => {
  it("keeps the branch of the steps a whole-school reader opened", () => {
    expect(publishTarget(lekkiLadder, okafor)).toEqual({ kind: "branch", branch: 2 });
    expect(publishTarget(schoolLadder, okafor)).toEqual({ kind: "school" });
    expect(publishTarget(sharedLadder, okafor)).toEqual({ kind: "school" });
    expect(publishTarget(null, okafor)).toEqual({ kind: "school" });
  });

  it("files a one-branch reader's edit of the school's steps under their branch", () => {
    expect(publishTarget(schoolLadder, bello)).toEqual({ kind: "branch", branch: 2 });
    expect(publishTarget(sharedLadder, bello)).toEqual({ kind: "branch", branch: 2 });
  });

  it("keeps a branch-bound reader's own branch steps where they are", () => {
    expect(publishTarget(lekkiLadder, ade)).toEqual({ kind: "branch", branch: 2 });
  });

  it("asks a reader working in several branches which one the steps are for", () => {
    expect(publishTarget(schoolLadder, ade)).toEqual({ kind: "choose", choices: [2, 3] });
    expect(publishTarget({ branch: 1, is_platform: false }, ade)).toEqual({
      kind: "choose", choices: [2, 3],
    });
  });
});

describe("groupBranchIds", () => {
  const group = { branch: 2, code: "lekki-approvers" };
  const step = (code: string) => ({ approver_group_code: code });

  it("is the whole school for a group nobody owns at a branch", () => {
    expect(groupBranchIds({ branch: null, code: "g" }, [])).toEqual([]);
  });

  it("is the owning branch while no template names the group", () => {
    expect(groupBranchIds(group, [])).toEqual([2]);
    expect(groupBranchIds(group, undefined)).toEqual([2]);
  });

  it("widens to each branch whose template names the group", () => {
    expect(
      groupBranchIds(group, [{ branch: 3, is_platform: false, stages: [step("lekki-approvers")] }]),
    ).toEqual([2, 3]);
  });

  it("becomes the whole school once the school's own ladder names it", () => {
    expect(
      groupBranchIds(group, [{ branch: null, is_platform: false, stages: [step("lekki-approvers")] }]),
    ).toEqual([]);
  });

  it("ignores a shared template and a template naming another group", () => {
    expect(
      groupBranchIds(group, [
        { branch: null, is_platform: true, stages: [step("lekki-approvers")] },
        { branch: null, is_platform: false, stages: [step("bursars")] },
      ]),
    ).toEqual([2]);
  });
});
