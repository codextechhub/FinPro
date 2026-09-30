import { describe, expect, it } from "vitest";
import { auditBranchLabel } from "./audit";

/**
 * Lagoon View's trail, read by the proprietor. Ngozi's receipt at Lekki names
 * Lekki; the fee-settings change and the payroll run for the whole school name
 * no branch and read "School-wide", because they belong to the whole books, not
 * to a branch that is missing. The console's books read "Entity-wide".
 */
describe("the audit trail's Branch column", () => {
  it("names the branch of the document the entry is about", () => {
    expect(auditBranchLabel({ branch_name: "Lekki Branch" }, "School-wide")).toBe("Lekki Branch");
  });

  it("reads an entry about the whole books as the books' whole-scope word", () => {
    expect(auditBranchLabel({ branch_name: null }, "School-wide")).toBe("School-wide");
    expect(auditBranchLabel({ branch_name: null }, "Entity-wide")).toBe("Entity-wide");
  });
});
