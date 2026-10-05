import { describe, expect, it } from "vitest";

import { openingBillTemplate, openingImportRefusal, parseOpeningBills } from "./opening-bills";

const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];

describe("parseOpeningBills", () => {
  it("reads each bill with its original date, amount in kobo and branch", () => {
    const parsed = parseOpeningBills(
      "vendor,invoice_date,due_date,vendor_reference,amount,branch\nVEN001,2025-11-14,2025-12-14,INV-1,\"250,000.00\",Lekki\n",
      { branches: BRANCHES, askBranch: true },
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([{
      vendor: "VEN001", invoice_date: "2025-11-14", due_date: "2025-12-14",
      vendor_reference: "INV-1", amount: 25_000_000, branch: 2,
    }]);
  });

  it("sends no branch at a one-branch school", () => {
    const parsed = parseOpeningBills("vendor,invoice_date,amount\nVEN001,2025-11-14,100\n", { branches: [], askBranch: false });
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0]).toEqual({ vendor: "VEN001", invoice_date: "2025-11-14", amount: 10_000 });
  });

  it("names each bad line by its line in the file", () => {
    const parsed = parseOpeningBills(
      "vendor,invoice_date,amount,branch\nVEN001,14/11/2025,100,Ikeja\n,2025-11-14,0,Ajah\n",
      { branches: BRANCHES, askBranch: true },
    );
    expect(parsed.problems).toEqual([
      "Line 2: give the invoice date as YYYY-MM-DD.",
      "Line 3: the vendor is missing.",
      "Line 3: the amount still owed must be more than zero.",
      "Line 3: no branch called \"Ajah\" that you can file under.",
    ]);
  });

  it("asks for a branch column at a school with several branches", () => {
    expect(parseOpeningBills("vendor,invoice_date,amount\nV,2025-01-01,1\n", { branches: BRANCHES, askBranch: true }).problems)
      .toEqual(["The school has more than one branch, so add a branch column."]);
  });
});

describe("openingImportRefusal", () => {
  it("reports a refused row against its line in the file", () => {
    const error = { data: { error: { detail: { bills: { 3: { amount: ["The amount still owed must be positive."] } } } } } };
    expect(openingImportRefusal(error)).toEqual(["Line 5: The amount still owed must be positive."]);
  });

  it("reports a refusal of the whole file as it stands", () => {
    const error = { data: { error: { detail: { bills: ["A bill dated on or after go-live is ordinary business."] } } } };
    expect(openingImportRefusal(error)).toEqual(["A bill dated on or after go-live is ordinary business."]);
  });
});

describe("openingBillTemplate", () => {
  it("carries the branch column only where branches mean something", () => {
    expect(openingBillTemplate(true).split("\n")[0]).toContain("branch");
    expect(openingBillTemplate(false).split("\n")[0]).not.toContain("branch");
  });
});
