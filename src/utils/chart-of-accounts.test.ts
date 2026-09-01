import { describe, expect, it } from "vitest";
import { accountCodeError, accountsInCodeLine, accountTypeFromCode, isValidAccountCode } from "./chart-of-accounts";

describe("chart-of-accounts code rules", () => {
  it.each([
    ["1000", "ASSET"],
    ["2100", "LIABILITY"],
    ["3200", "EQUITY"],
    ["4100", "INCOME"],
    ["5200", "EXPENSE"],
  ])("derives the account type for %s", (code, expected) => {
    expect(accountTypeFromCode(code)).toBe(expected);
    expect(isValidAccountCode(code)).toBe(true);
  });

  it("rejects codes outside the five account lines", () => {
    expect(accountCodeError("6100")).toMatch(/start with 1, 2, 3, 4, or 5/i);
    expect(isValidAccountCode("6100")).toBe(false);
  });

  it("rejects non-numeric suffixes", () => {
    expect(accountCodeError("4ABC")).toMatch(/numbers only/i);
    expect(isValidAccountCode("4ABC")).toBe(false);
  });

  it("requires exactly four digits", () => {
    expect(accountCodeError("410")).toMatch(/exactly 4 digits/i);
    expect(accountCodeError("41000")).toMatch(/exactly 4 digits/i);
  });

  it("detects an existing code immediately", () => {
    const existingCodes = new Set(["1100", "4100"]);
    expect(accountCodeError("4100", existingCodes)).toMatch(/already exists/i);
    expect(isValidAccountCode("4100", existingCodes)).toBe(false);
    expect(isValidAccountCode("4200", existingCodes)).toBe(true);
  });

  it("keeps parent choices within the line selected by the new code", () => {
    const accounts = [
      { code: "1000", account_type: "ASSET" },
      { code: "4100", account_type: "INCOME" },
      { code: "4200", account_type: "INCOME" },
      { code: "4900", account_type: "ASSET" },
    ];

    expect(accountsInCodeLine(accounts, "4150")).toEqual([
      { code: "4100", account_type: "INCOME" },
      { code: "4200", account_type: "INCOME" },
    ]);
  });
});
