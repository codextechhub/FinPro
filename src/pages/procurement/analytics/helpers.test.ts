// The branch-scope advisory has to distinguish three states the backend deliberately
// keeps apart: not narrowed at all (key absent), narrowed with nothing left out (zero),
// and narrowed with documents left out (a count). Only the third is worth a line, and
// it must say what was left out - a bare "3 excluded" tells a bursar nothing.

import { describe, expect, it } from "vitest";

import { excludedScopeNote } from "./helpers";

describe("excludedScopeNote", () => {
  it("says nothing when the reader is not branch-bound", () => {
    // The key is absent for an unbound caller and for a tenant with no branches: those
    // figures are the whole story, so a note would invent a caveat that does not exist.
    expect(excludedScopeNote(undefined, "vendor bill")).toBeNull();
  });

  it("says nothing when a branch-bound reader has nothing excluded", () => {
    expect(excludedScopeNote(0, "vendor bill")).toBeNull();
  });

  it("names the documents and why they are missing, not just a bare count", () => {
    const note = excludedScopeNote(3, "goods receipt");
    expect(note).toContain("3 goods receipts");
    expect(note).toContain("entity level");
    expect(note).toContain("not included in these figures");
  });

  it("reads as one document in the singular", () => {
    expect(excludedScopeNote(1, "vendor bill")).toBe(
      "1 vendor bill sits at entity level rather than in a branch, so it is outside your branch view and not included in these figures.",
    );
  });

  it("takes an explicit plural for nouns that do not take an -s", () => {
    expect(excludedScopeNote(2, "entry", "entries")).toContain("2 entries");
  });

  it("never states an amount - the count is all the backend is willing to disclose", () => {
    const note = excludedScopeNote(4, "vendor bill") ?? "";
    expect(note).not.toMatch(/[₦$]|\d+\.\d{2}/);
  });
});
