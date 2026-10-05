/**
 * A transfer's journals open in the General Ledger by their id, never shown as
 * a bare "journal #501" a bursar cannot use.
 */
import { describe, expect, it } from "vitest";
import { journalLink, transferLink } from "./links";

describe("Between Branches links", () => {
  it("opens one journal in the General Ledger", () => {
    expect(journalLink(501)).toBe("/finance/ledger?document=501");
  });

  it("opens one transfer in the register", () => {
    expect(transferLink(77)).toBe("/finance/inter-branch/transfers?document=77");
  });
});
