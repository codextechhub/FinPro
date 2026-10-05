/**
 * Reading a file of opening customer bills into the rows the server takes.
 *
 * A school moving onto these books arrives with unpaid bills, some of them
 * years old. Each is carried in as its own opening invoice, dated as the
 * original was, so it ages as the original did. The file is a CSV with one
 * row per unpaid bill; this module reads it, checks every row, and reports a
 * bad row by its line number before anything is sent. The server takes the
 * file all or nothing as well, so one bad row refuses the whole import.
 *
 * Columns, by header name in any order and any case: customer (code), invoice
 * date, due date, amount (naira still owed), reference, period, branch (name or
 * id), narration. Dates are YYYY-MM-DD, or DD/MM/YYYY as a spreadsheet often
 * writes them.
 */

import { toKobo } from "@/utils/money";
import type { OpeningInvoiceRow } from "@/redux/services/finance/fees-types";

/** The most rows one import may carry; the server's own limit. */
export const OPENING_IMPORT_LIMIT = 500;

export const OPENING_TEMPLATE =
  "customer,invoice_date,due_date,amount,reference,period,branch,narration\n"
  + "CUS-0001,2025-09-08,2025-09-30,120000.00,OLD-INV-114,First term 2025/2026,,Arrears carried in\n";

/** Split CSV text into rows of cells, honouring quoted cells and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADERS: Record<string, keyof RawRow> = {
  customer: "customer", customer_code: "customer",
  invoice_date: "invoice_date", "invoice date": "invoice_date", date: "invoice_date",
  due_date: "due_date", "due date": "due_date",
  amount: "amount", "amount owed": "amount",
  reference: "reference",
  period: "period_label", period_label: "period_label",
  branch: "branch",
  narration: "narration",
};

interface RawRow {
  customer: string;
  invoice_date: string;
  due_date: string;
  amount: string;
  reference: string;
  period_label: string;
  branch: string;
  narration: string;
}

/** A calendar date as `YYYY-MM-DD`, or null when it is not one. */
export function isoDate(raw: string): string | null {
  const text = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface ParsedOpeningFile {
  rows: OpeningInvoiceRow[];
  /** One line per problem, naming the file's line number. */
  problems: string[];
  total: number;
}

/**
 * Read an opening-bills file. `branches` names the school's branches; a row's
 * branch may be its name or its id. A blank branch is allowed: a customer filed
 * under a branch gives the bill that branch, and for a customer every branch
 * shares at a school with several the server asks for one by the row's position.
 */
export function readOpeningFile(text: string, branches: { id: number | string; name: string }[]): ParsedOpeningFile {
  const table = parseCsv(text);
  const problems: string[] = [];
  if (table.length < 2) return { rows: [], problems: ["The file has no rows under its header."], total: 0 };
  const header = table[0].map((h) => HEADERS[h.trim().toLowerCase()]);
  for (const needed of ["customer", "invoice_date", "amount"] as const) {
    if (!header.includes(needed)) problems.push(`The header has no "${needed}" column.`);
  }
  if (problems.length) return { rows: [], problems, total: 0 };
  if (table.length - 1 > OPENING_IMPORT_LIMIT) {
    return { rows: [], problems: [`The file has ${table.length - 1} rows; send at most ${OPENING_IMPORT_LIMIT} in one import.`], total: 0 };
  }

  const byName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), Number(b.id)]));
  const ids = new Set(branches.map((b) => Number(b.id)));
  const rows: OpeningInvoiceRow[] = [];
  let total = 0;
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const raw = {} as RawRow;
    header.forEach((key, col) => { if (key) raw[key] = (cells[col] ?? "").trim(); });
    const errors: string[] = [];
    const customer = (raw.customer ?? "").toUpperCase();
    if (!customer) errors.push("no customer");
    const invoiceDate = isoDate(raw.invoice_date ?? "");
    if (!invoiceDate) errors.push("the invoice date is not a date");
    const dueDate = raw.due_date ? isoDate(raw.due_date) : null;
    if (raw.due_date && !dueDate) errors.push("the due date is not a date");
    if (invoiceDate && dueDate && dueDate < invoiceDate) errors.push("it falls due before it was raised");
    const amountText = (raw.amount ?? "").replace(/[,\s₦]/g, "");
    const amount = /^\d+(\.\d{1,2})?$/.test(amountText) ? toKobo(amountText) : 0;
    if (amount <= 0) errors.push("the amount owed is not a positive number");
    let branch: number | undefined;
    if (raw.branch) {
      const asId = /^\d+$/.test(raw.branch) ? Number(raw.branch) : NaN;
      branch = ids.has(asId) ? asId : byName.get(raw.branch.toLowerCase());
      if (branch === undefined) errors.push(`no branch called "${raw.branch}"`);
    }
    if (errors.length) {
      problems.push(`Line ${line}: ${errors.join("; ")}.`);
      return;
    }
    total += amount;
    rows.push({
      customer,
      invoice_date: invoiceDate!,
      ...(dueDate ? { due_date: dueDate } : {}),
      amount,
      ...(raw.reference ? { reference: raw.reference.slice(0, 64) } : {}),
      ...(raw.period_label ? { period_label: raw.period_label.slice(0, 128) } : {}),
      ...(raw.narration ? { narration: raw.narration.slice(0, 255) } : {}),
      ...(branch !== undefined ? { branch } : {}),
    });
  });
  return { rows: problems.length ? [] : rows, problems, total: problems.length ? 0 : total };
}
