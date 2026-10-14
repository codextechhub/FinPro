/**
 * The footer and notes of a payroll run. Mrs Bello sends January's run for
 * approval; when Bright Star's payroll approver group is empty except for her,
 * the server parks the run and the screen says who is missing instead of
 * offering to carry on without approval. The stage's buttons themselves are
 * exercised through the run drawer in payroll.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { parkedSentence } from "./payroll-run-stage";

describe("a run nobody but its preparer could approve", () => {
  it("says nobody can approve it yet, with the server's own requirement", () => {
    const text = parkedSentence({ parked: true, instance_id: "i", requirement: "Members of the finance-payroll-approver group can approve this." })!;
    expect(text).toContain("Nobody can approve this run yet.");
    expect(text).toContain("Members of the finance-payroll-approver group can approve this.");
    expect(text).toContain("The person who prepared a run can never approve it.");
  });

  it("says nothing for a run somebody can approve, or when the answer is missing", () => {
    expect(parkedSentence({ parked: false, instance_id: "i" })).toBeNull();
    expect(parkedSentence(undefined)).toBeNull();
    expect(parkedSentence(null)).toBeNull();
  });
});
