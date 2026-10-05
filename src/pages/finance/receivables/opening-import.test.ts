/**
 * Reading a file of opening customer bills.
 *
 * Bright Star School carries in its arrears: Bisi Bakare's N120,000 from
 * 15 August 2026 at Lekki, and Tunde's N45,500.50 at the customer's own
 * branch. A bad row is named by its line and refuses the whole file.
 */
import { describe, expect, it } from "vitest";
import { isoDate, OPENING_IMPORT_LIMIT, OPENING_TEMPLATE, parseCsv, readOpeningFile } from "./opening-import";

const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];

describe("opening balances file", () => {
  it("splits quoted cells, doubled quotes and both line endings", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n\n')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });

  it("reads ISO and day-first dates and refuses impossible ones", () => {
    expect(isoDate("2026-08-15")).toBe("2026-08-15");
    expect(isoDate("15/08/2026")).toBe("2026-08-15");
    expect(isoDate("31/02/2026")).toBeNull();
    expect(isoDate("August 15")).toBeNull();
  });

  it("turns each row into a bill in kobo, with its branch by name or id", () => {
    const text = "Customer,Invoice Date,Due Date,Amount,Reference,Period,Branch\n"
      + "cus-bisi,15/08/2026,2026-09-01,\"120,000\",OLD-1,First term,Lekki\n"
      + "CUS-TUNDE,2026-07-01,,45500.50,,,\n";
    const parsed = readOpeningFile(text, BRANCHES);
    expect(parsed.problems).toEqual([]);
    expect(parsed.total).toBe(12_000_000 + 4_550_050);
    expect(parsed.rows).toEqual([
      { customer: "CUS-BISI", invoice_date: "2026-08-15", due_date: "2026-09-01", amount: 12_000_000, reference: "OLD-1", period_label: "First term", branch: 2 },
      { customer: "CUS-TUNDE", invoice_date: "2026-07-01", amount: 4_550_050 },
    ]);
  });

  it("names every bad row by its line and sends nothing", () => {
    const text = "customer,invoice_date,due_date,amount,branch\n"
      + "CUS-1,2026-08-15,2026-08-01,100,\n"
      + ",2026-08-15,,0,Yaba\n"
      + "CUS-3,2026-08-15,,100,2\n";
    const parsed = readOpeningFile(text, BRANCHES);
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toEqual([
      "Line 2: it falls due before it was raised.",
      'Line 3: no customer; the amount owed is not a positive number; no branch called "Yaba".',
    ]);
  });

  it("refuses a file missing a needed column, or with more rows than one import takes", () => {
    expect(readOpeningFile("customer,amount\nCUS-1,100\n", BRANCHES).problems).toEqual(['The header has no "invoice_date" column.']);
    const many = "customer,invoice_date,amount\n" + "CUS-1,2026-01-01,1\n".repeat(OPENING_IMPORT_LIMIT + 1);
    expect(readOpeningFile(many, BRANCHES).problems[0]).toMatch(/at most 500/);
  });

  it("offers a template the reader itself accepts", () => {
    const parsed = readOpeningFile(OPENING_TEMPLATE, BRANCHES);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
  });
});
