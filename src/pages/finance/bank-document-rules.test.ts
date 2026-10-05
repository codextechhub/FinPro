import { describe, expect, it } from "vitest";

import { bankDocumentAccountProblem } from "./bank-document-rules";

describe("bankDocumentAccountProblem", () => {
  it("refuses an account with no branch at a school with several", () => {
    expect(bankDocumentAccountProblem({ name: "UBA shared", branch_id: null }, true))
      .toBe("UBA shared has not been given a branch, so no money can move through it. Give it its branch first.");
  });

  it("accepts a branch's account, and any account at a one-branch school", () => {
    expect(bankDocumentAccountProblem({ name: "Ikeja current", branch_id: 1 }, true)).toBeNull();
    expect(bankDocumentAccountProblem({ name: "Main", branch_id: null }, false)).toBeNull();
    expect(bankDocumentAccountProblem(undefined, true)).toBeNull();
  });
});
