/**
 * A payout batch approval holds two kinds of line. Mrs Eze approves Bright
 * Star's October batch: two lines pay vendors (Lagos Books, Ade Stationers) and
 * one pays the school's own landlord. The vendor lines restate the vendor's
 * banking, so they sit in a "Vendor beneficiaries" table of their own beside an
 * "Other beneficiaries" table. A role that may not read the account number is
 * given each table without that column, and the header leaves with its cells.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocumentDetailsPanel, documentDetailSections } from "./document-details";

const prompt = { title: "Review the source document", description: "Open the source record." };

const table = (title: string, columns: string[], rows: Record<string, string>[]) => ({
  kind: "table" as const,
  title,
  columns: columns.map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) })),
  rows,
});

const VENDOR_ROWS = [
  { beneficiary: "Lagos Books", account: "****4521", amount: "N150,000.00", narration: "Term 1 readers" },
  { beneficiary: "Ade Stationers", account: "****9034", amount: "N60,000.00", narration: "Chalk" },
];
const OTHER_ROWS = [{ beneficiary: "Mr Bello (landlord)", account: "****1177", amount: "N400,000.00", narration: "Rent" }];

const without = (rows: Record<string, string>[], ...keys: string[]) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key))));

function render(sections: unknown[]) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <DocumentDetailsPanel details={{ schema_version: 1, sections }} documentLink={null} documentPrompt={prompt} />,
  );
  return host;
}

const tables = (host: HTMLElement) => [...host.querySelectorAll("section")].map((section) => ({
  title: section.querySelector("h3")?.textContent,
  headers: [...section.querySelectorAll("th")].map((th) => th.textContent),
  rows: [...section.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent)),
}));

describe("Approval documents with two beneficiary tables", () => {
  const columns = ["beneficiary", "account", "amount", "narration"];

  it("draws the vendor table and the other table, each with its own lines", () => {
    const host = render([
      table("Vendor beneficiaries", columns, VENDOR_ROWS),
      table("Other beneficiaries", columns, OTHER_ROWS),
    ]);
    const [vendors, others] = tables(host);
    expect(vendors.title).toBe("Vendor beneficiaries");
    expect(vendors.headers).toEqual(["Beneficiary", "Account", "Amount", "Narration"]);
    expect(vendors.rows).toEqual([
      ["Lagos Books", "****4521", "N150,000.00", "Term 1 readers"],
      ["Ade Stationers", "****9034", "N60,000.00", "Chalk"],
    ]);
    expect(others.title).toBe("Other beneficiaries");
    expect(others.rows).toEqual([["Mr Bello (landlord)", "****1177", "N400,000.00", "Rent"]]);
    expect(host.textContent).not.toContain("undefined");
  });

  it("drops a column the reader may not see, header and cells together, in every table", () => {
    const shown = ["beneficiary", "amount", "narration"];
    const host = render([
      table("Vendor beneficiaries", shown, without(VENDOR_ROWS, "account")),
      table("Other beneficiaries", shown, without(OTHER_ROWS, "account")),
    ]);
    const [vendors, others] = tables(host);
    expect(vendors.headers).toEqual(["Beneficiary", "Amount", "Narration"]);
    expect(vendors.rows[0]).toEqual(["Lagos Books", "N150,000.00", "Term 1 readers"]);
    expect(others.headers).toEqual(["Beneficiary", "Amount", "Narration"]);
    expect(others.rows[0]).toEqual(["Mr Bello (landlord)", "N400,000.00", "Rent"]);
    expect(host.textContent).not.toContain("****");
  });

  it("lets the two tables differ: vendor lines hide the beneficiary while other lines show it", () => {
    const host = render([
      table("Vendor beneficiaries", ["account", "amount", "narration"], without(VENDOR_ROWS, "beneficiary")),
      table("Other beneficiaries", columns, OTHER_ROWS),
    ]);
    const [vendors, others] = tables(host);
    expect(vendors.headers).toEqual(["Account", "Amount", "Narration"]);
    expect(vendors.rows[1]).toEqual(["****9034", "N60,000.00", "Chalk"]);
    expect(vendors.rows.every((row) => row.length === vendors.headers.length)).toBe(true);
    expect(others.headers).toHaveLength(4);
  });

  it("refuses a table whose rows lack a column it names, and accepts one whose columns match its rows", () => {
    const sections = [table("Vendor beneficiaries", columns, without(VENDOR_ROWS, "account"))];
    expect(documentDetailSections({ schema_version: 1, sections })).toBeNull();
    expect(documentDetailSections({ schema_version: 1, sections: [table("Vendor beneficiaries", ["amount"], without(VENDOR_ROWS, "account"))] })).toHaveLength(1);
  });

  it("shows a single Beneficiaries table when the batch holds one kind of line", () => {
    const host = render([table("Beneficiaries", columns, OTHER_ROWS)]);
    expect(tables(host).map((t) => t.title)).toEqual(["Beneficiaries"]);
  });
});
