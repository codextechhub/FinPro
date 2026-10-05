/**
 * Splitting a recharged cost exactly as the server does
 * (vs_finance.inter_branch.split_by_weight), so the form's preview is the
 * figure that posts.
 */

import { describe, expect, it } from "vitest";

import { percentToBps, readWeights, sharesSomething, splitByWeight, weightsBody } from "./recharge-model";

describe("splitting a cost by weight", () => {
  it("halves Ikeja's N600,000 internet bill between Ikeja and Lekki", () => {
    expect(splitByWeight(60_000_000, { 1: 1, 2: 1 })).toEqual({ 1: 30_000_000, 2: 30_000_000 });
  });

  it("gives the leftover kobo to the largest fractions, ties to the lower branch", () => {
    expect(splitByWeight(100, { 1: 1, 2: 1, 3: 1 })).toEqual({ 1: 34, 2: 33, 3: 33 });
    expect(splitByWeight(101, { 5: 3333, 6: 3333, 7: 3334 })).toEqual({ 5: 34, 6: 33, 7: 34 });
  });

  it("stays exact for a large bill weighed in basis points", () => {
    const shares = splitByWeight(9_999_999_999_999, { 1: 6000, 2: 4000 });
    expect(shares[1] + shares[2]).toBe(9_999_999_999_999);
    expect(shares).toEqual({ 1: 5_999_999_999_999, 2: 4_000_000_000_000 });
  });

  it("splits nothing when no branch carries weight", () => {
    expect(splitByWeight(1000, { 1: 0 })).toEqual({});
  });
});

describe("reading the form's weights", () => {
  it("reads percentages to two decimal places and wants them to total 100", () => {
    expect(percentToBps("33.33")).toBe(3333);
    expect(percentToBps("33.333")).toBeNull();
    expect(readWeights("PERCENTAGES", { 1: "60", 2: "40" })).toEqual({ weights: { 1: 6000, 2: 4000 }, problem: null });
    expect(readWeights("PERCENTAGES", { 1: "60", 2: "30" }).problem).toBe("Fixed percentages must total 100.");
  });

  it("reads whole counts and leaves blank branches out", () => {
    expect(readWeights("COUNTS", { 1: "420", 2: "", 3: "180" })).toEqual({ weights: { 1: 420, 3: 180 }, problem: null });
    expect(readWeights("COUNTS", { 1: "4.5" }).problem).toBe("Each count is a whole number, zero or more.");
    expect(readWeights("COUNTS", {}).problem).toBe("Give a weight for each branch sharing the cost.");
  });

  it("sends percentages as percent and counts as count", () => {
    expect(weightsBody("PERCENTAGES", { 1: 6000, 2: 4000 })).toEqual([{ branch: 1, percent: 60 }, { branch: 2, percent: 40 }]);
    expect(weightsBody("COUNTS", { 1: 420 })).toEqual([{ branch: 1, count: 420 }]);
  });

  it("knows when only the paying branch would carry the cost", () => {
    expect(sharesSomething({ 1: 60_000_000, 2: 0 }, 1)).toBe(false);
    expect(sharesSomething({ 1: 30_000_000, 2: 30_000_000 }, 1)).toBe(true);
  });
});
