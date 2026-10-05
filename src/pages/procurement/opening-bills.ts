/**
 * Opening supplier bills: the bills still unpaid on the day the books began,
 * carried in so Accounts Payable and its aging start true.
 *
 * One row is one unpaid bill, dated when the supplier raised it so it ages as
 * the original did, for the amount still owed. A school with several branches
 * names each bill's branch; at a one-branch school the column is left out and
 * every bill is that branch's. The import is all or nothing: one refused row
 * refuses the file, and the server names the row by its position, so the
 * screen shows that row's line in the file.
 *
 * The file is a CSV with a header row. Columns, in any order:
 * `vendor` (code), `invoice_date` (YYYY-MM-DD), `due_date`, `vendor_reference`,
 * `amount` (naira, commas allowed), `branch` (name or id) and `narration`.
 */

import { toKobo } from "../../utils/money";
import type { OpeningBillRow } from "@/redux/services/procurement/procurement-types";

/** The columns the importer reads; the first five are the ones most files carry. */
export const OPENING_BILL_COLUMNS = ["vendor", "invoice_date", "due_date", "vendor_reference", "amount", "branch", "narration"] as const;

/** At most this many bills go in one import; the server refuses more. */
export const OPENING_BILL_LIMIT = 500;

/** The template a school fills in, with the branch column only where it means something. */
export function openingBillTemplate(withBranch: boolean): string {
  const header = OPENING_BILL_COLUMNS.filter((column) => withBranch || column !== "branch");
  const sample = withBranch
    ? ["VEN001", "2025-11-14", "2025-12-14", "INV-4471", "250000.00", "Ikeja", "Stationery, November"]
    : ["VEN001", "2025-11-14", "2025-12-14", "INV-4471", "250000.00", "Stationery, November"];
  return `${header.join(",")}\n${sample.join(",")}\n`;
}

/** Split one CSV line, honouring double-quoted fields with commas and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === "\"" && line[i + 1] === "\"") { field += "\""; i += 1; }
      else if (char === "\"") quoted = false;
      else field += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") { out.push(field); field = ""; }
    else field += char;
  }
  out.push(field);
  return out.map((value) => value.trim());
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedOpeningBills {
  rows: OpeningBillRow[];
  /** Problems found before sending, each naming its line in the file (header is line 1). */
  problems: string[];
}

/**
 * Read the file into request rows. `branches` maps the branch names and ids the
 * reader may file under; `askBranch` says whether the school's bills need one.
 */
export function parseOpeningBills(
  text: string,
  { branches, askBranch }: { branches: { id: string | number; name: string }[]; askBranch: boolean },
): ParsedOpeningBills {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], problems: ["The file is empty."] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => header.indexOf(name);
  const missing = ["vendor", "invoice_date", "amount"].filter((name) => col(name) < 0);
  if (missing.length) return { rows: [], problems: [`The header row needs ${missing.join(", ")}.`] };
  if (askBranch && col("branch") < 0) return { rows: [], problems: ["The school has more than one branch, so add a branch column."] };

  const rows: OpeningBillRow[] = [];
  const problems: string[] = [];
  const findBranch = (value: string) => branches.find((b) => String(b.id) === value || b.name.trim().toLowerCase() === value.toLowerCase());
  lines.slice(1).forEach((line, index) => {
    const at = `Line ${index + 2}`;
    const cells = splitCsvLine(line);
    const cell = (name: string) => (col(name) >= 0 ? cells[col(name)] ?? "" : "");
    const vendor = cell("vendor");
    const invoiceDate = cell("invoice_date");
    const dueDate = cell("due_date");
    const amount = toKobo(cell("amount"));
    if (!vendor) problems.push(`${at}: the vendor is missing.`);
    if (!ISO_DAY.test(invoiceDate)) problems.push(`${at}: give the invoice date as YYYY-MM-DD.`);
    if (dueDate && !ISO_DAY.test(dueDate)) problems.push(`${at}: give the due date as YYYY-MM-DD.`);
    if (dueDate && ISO_DAY.test(invoiceDate) && dueDate < invoiceDate) problems.push(`${at}: the bill cannot fall due before it was raised.`);
    if (amount <= 0) problems.push(`${at}: the amount still owed must be more than zero.`);
    let branch: number | undefined;
    if (askBranch) {
      const named = cell("branch");
      const match = named ? findBranch(named) : undefined;
      if (!named) problems.push(`${at}: name the branch this bill belongs to.`);
      else if (!match) problems.push(`${at}: no branch called "${named}" that you can file under.`);
      else branch = Number(match.id);
    }
    rows.push({
      vendor,
      invoice_date: invoiceDate,
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(cell("vendor_reference") ? { vendor_reference: cell("vendor_reference") } : {}),
      amount,
      ...(branch !== undefined ? { branch } : {}),
      ...(cell("narration") ? { narration: cell("narration") } : {}),
    });
  });
  if (rows.length > OPENING_BILL_LIMIT) problems.push(`Send at most ${OPENING_BILL_LIMIT} bills in one import; split the file.`);
  return { rows, problems };
}

/**
 * The server's refusal of an import, as lines a person can act on. A row's
 * refusal arrives keyed by its position in the request, `{bills: {3: {amount:
 * ["..."]}}}`, and is reported against its line in the file (position + 2, for
 * the header and counting from one). A refusal of the whole file arrives as a
 * sentence or a list of them.
 */
export function openingImportRefusal(error: unknown): string[] {
  const detail = (error as { data?: { error?: { detail?: unknown } } })?.data?.error?.detail as { bills?: unknown } | undefined;
  const bills = detail?.bills;
  if (!bills) return [];
  const flatten = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === "object") return Object.values(value).flatMap(flatten);
    return [];
  };
  if (typeof bills === "string" || Array.isArray(bills)) return flatten(bills);
  return Object.entries(bills as Record<string, unknown>).flatMap(([position, value]) => {
    const line = Number(position);
    return flatten(value).map((message) => (Number.isInteger(line) ? `Line ${line + 2}: ${message}` : message));
  });
}
