/**
 * Bright Star's chart keeps Bad debts at 5350, and Corona has re-pointed the
 * mapping to its own account. The write-offs list names whichever account the
 * mapping resolves to, to a bursar who may create write-offs; a bursar who is
 * not sent one is told the account by name, never by a code that might not be
 * the school's.
 */
import { describe, expect, it } from "vitest";
import { defaultWriteOffAccount, writeOffAccountHint, writeOffRecapCode } from "./write-off-account";

describe("the default write-off account", () => {
  it("reads the account the list names", () => {
    expect(defaultWriteOffAccount({ default_write_off_account: { id: 9, code: "5350", name: "Bad debts" } })).toEqual({ code: "5350", name: "Bad debts" });
  });

  it("is unknown when the list is not loaded, names none, or omits it for this reader", () => {
    expect(defaultWriteOffAccount(undefined)).toBeNull();
    expect(defaultWriteOffAccount({ default_write_off_account: null })).toBeNull();
    expect(defaultWriteOffAccount({})).toBeNull();
  });

  it("words the hint with the school's own code, or without any code", () => {
    expect(writeOffAccountHint({ code: "5350", name: "Bad debts" })).toBe("Defaults to Bad debts (5350)");
    expect(writeOffAccountHint(null)).toBe("Defaults to the school's bad debts account");
    expect(writeOffAccountHint(null)).not.toMatch(/\d/);
  });

  it("previews the picked account first, then the default, then no code", () => {
    expect(writeOffRecapCode("5999", { code: "5350", name: "Bad debts" })).toBe("5999");
    expect(writeOffRecapCode("", { code: "5350", name: "Bad debts" })).toBe("5350");
    expect(writeOffRecapCode("", null)).toBe("");
  });
});
