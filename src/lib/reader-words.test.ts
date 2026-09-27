import { describe, expect, it } from "vitest";

import { wholeBooksLabel } from "./reader-words";

describe("wholeBooksLabel", () => {
  it("says school-wide to a school", () => {
    expect(wholeBooksLabel(true)).toBe("School-wide");
  });

  it("keeps the ledger word everywhere else", () => {
    expect(wholeBooksLabel(false)).toBe("Entity-wide");
  });
});
