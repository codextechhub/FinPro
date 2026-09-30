import { describe, expect, it } from "vitest";
import { auditBranchLabel } from "./audit";

/**
 * Holy Cross's trail, read by the proprietor. A journal posted at the Annex
 * names the Annex. A fee-settings change and a vendor quotation that no
 * administrator has placed yet name no branch, and both read "No branch": the
 * quotation is not the whole school's, it simply has not been given a branch.
 */
describe("the audit trail's Branch column", () => {
  it("names the branch of the document the entry is about", () => {
    expect(auditBranchLabel({ branch_name: "Holy Cross College Annex" })).toBe("Holy Cross College Annex");
  });

  it("says an entry names no branch, never that it is the whole school's", () => {
    expect(auditBranchLabel({ branch_name: null })).toBe("No branch");
  });
});
