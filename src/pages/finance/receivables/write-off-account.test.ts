/**
 * Bright Star's chart keeps Bad debts at 5350, and Corona has re-pointed the
 * mapping to its own account. The write-off form names whichever account the
 * mapping resolves to, and a bursar who may not read Finance Settings is told
 * the account by name, never by a code that might not be the school's.
 */
import { describe, expect, it } from "vitest";
import type { FinanceAccountMapping } from "@/redux/services/finance/setup-types";
import { defaultWriteOffAccount, writeOffAccountHint, writeOffRecapCode } from "./write-off-account";

const mapping = (key: string, code: string | null): FinanceAccountMapping => ({
  key, label: key, expected_account_type: "EXPENSE", default_code: "5350", source: "DEFAULT", is_valid: true,
  account: code ? { id: 9, code, name: "Bad debts", account_type: "EXPENSE", is_active: true, is_postable: true } : null,
});

describe("the default write-off account", () => {
  it("reads the Bad debt expense mapping and no other", () => {
    const found = defaultWriteOffAccount([mapping("BANK_CHARGES", "5500"), mapping("BAD_DEBT_EXPENSE", "5350")]);
    expect(found).toEqual({ code: "5350", name: "Bad debts" });
  });

  it("is unknown when the reader cannot read the mappings or none is set", () => {
    expect(defaultWriteOffAccount(undefined)).toBeNull();
    expect(defaultWriteOffAccount([mapping("BAD_DEBT_EXPENSE", null)])).toBeNull();
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
