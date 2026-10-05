import { describe, expect, it } from "vitest";
import { auditActorLabel, auditBranchLabel, auditEntityLabel } from "./audit";

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

/**
 * Mrs Bello posts a receipt while acting as Mrs Adeyemi. The trail names both,
 * in the server's words; an ordinary entry names the actor; an automatic one
 * says System.
 */
describe("the audit trail's Actor column", () => {
  const base = { actor: "bello@brightstar.example.com", real_actor_name: null, proxied_user_name: null, acted_label: "Mrs Bello" };

  it("names both people for an act done through a proxy", () => {
    expect(auditActorLabel({ ...base, real_actor_name: "Mrs Bello", proxied_user_name: "Mrs Adeyemi", acted_label: "Mrs Bello for Mrs Adeyemi" }))
      .toBe("Mrs Bello for Mrs Adeyemi");
  });

  it("names the actor for an ordinary act, and System for an automatic one", () => {
    expect(auditActorLabel(base)).toBe("bello@brightstar.example.com");
    expect(auditActorLabel({ ...base, actor: null, acted_label: null })).toBe("System");
  });
});

/** The Entity column names the kind of record in words, never the model name. */
describe("the audit trail's Entity column", () => {
  it("reads a model name as words", () => {
    expect(auditEntityLabel("JournalEntry")).toBe("Journal entry");
    expect(auditEntityLabel("DunningPolicy")).toBe("Dunning policy");
    expect(auditEntityLabel("FixedAsset")).toBe("Fixed asset");
  });

  it("shows a dash when the entry names no record", () => {
    expect(auditEntityLabel(null)).toBe("-");
  });
});
