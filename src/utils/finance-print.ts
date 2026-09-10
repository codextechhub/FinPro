import type {
  BankAccount,
  BankStatementLine,
  ExpenseClaim,
  PayrollLine,
  PayrollRun,
  TaxFiling,
} from "../redux/services/finance/ops-types";
import { formatMoney } from "./money";

type PrintCell = {
  text: string;
  className?: string;
  colSpan?: number;
};

type PrintRow = {
  cells: PrintCell[];
  className?: string;
};

type PrintBlock =
  | { kind: "heading"; level: 1 | 3; text: string }
  | { kind: "text"; text: string; className?: string }
  | { kind: "cards"; cards: { label: string; value: string; className?: string }[] }
  | { kind: "table"; headings?: PrintCell[]; rows: PrintRow[] };

export type FinancePrintDocument = {
  title: string;
  bodyClass: "narrow" | "standard" | "wide";
  windowFeatures: string;
  blocks: PrintBlock[];
};

const PRINT_CSS = `
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;margin:auto}
body.narrow{max-width:520px}body.standard{max-width:760px}body.wide{max-width:900px}
h1{font-size:18px;margin:0 0 4px}h3{font-size:13px;margin:16px 0 4px}
.sub{color:#666;font-size:12px;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:12px}
th,td{border-bottom:1px solid #eee;padding:7px 8px;text-align:left}
th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#888}
.r{text-align:right;font-variant-numeric:tabular-nums}
.cards{display:flex;gap:12px;margin-bottom:20px}.card{flex:1;border:1px solid #eee;border-radius:8px;padding:10px}
.card-label{color:#666;font-size:11px}.card-value{font-size:16px;font-weight:600}.danger{color:#c0392b}
.section td{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;padding-top:14px;border-bottom:none}
.subtotal td{font-weight:600;border-top:1px solid #ddd}
.total td{font-weight:700;border-top:2px solid #ddd;border-bottom:none}
`;

const PRINT_ON_LOAD = "window.addEventListener('load',function(){window.print()},{once:true})";

function appendTextElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  parent: Node,
  tag: K,
  value: string,
  className?: string,
) {
  const element = doc.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}

/**
 * Builds a complete print document without parsing application data as markup.
 * Every caller-supplied value becomes a text node before the document is
 * serialized, so stored HTML cannot create elements, attributes, or scripts.
 */
export function renderFinancePrintHtml(spec: FinancePrintDocument) {
  const doc = document.implementation.createHTMLDocument("");
  doc.documentElement.lang = "en";
  const existingTitle = doc.querySelector("title");
  if (existingTitle) existingTitle.textContent = spec.title;
  else appendTextElement(doc, doc.head, "title", spec.title);

  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  doc.head.prepend(charset);
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  doc.head.appendChild(policy);
  appendTextElement(doc, doc.head, "style", PRINT_CSS);
  doc.body.className = spec.bodyClass;

  for (const block of spec.blocks) {
    if (block.kind === "heading") {
      appendTextElement(doc, doc.body, block.level === 1 ? "h1" : "h3", block.text);
      continue;
    }
    if (block.kind === "text") {
      appendTextElement(doc, doc.body, "div", block.text, block.className);
      continue;
    }
    if (block.kind === "cards") {
      const cards = doc.createElement("div");
      cards.className = "cards";
      for (const card of block.cards) {
        const container = doc.createElement("div");
        container.className = "card";
        appendTextElement(doc, container, "div", card.label, "card-label");
        appendTextElement(doc, container, "div", card.value, `card-value${card.className ? ` ${card.className}` : ""}`);
        cards.appendChild(container);
      }
      doc.body.appendChild(cards);
      continue;
    }

    const table = doc.createElement("table");
    if (block.headings) {
      const thead = doc.createElement("thead");
      const tr = doc.createElement("tr");
      for (const heading of block.headings) {
        const th = appendTextElement(doc, tr, "th", heading.text, heading.className);
        if (heading.colSpan) th.colSpan = heading.colSpan;
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    const tbody = doc.createElement("tbody");
    for (const row of block.rows) {
      const tr = doc.createElement("tr");
      if (row.className) tr.className = row.className;
      for (const cell of row.cells) {
        const td = appendTextElement(doc, tr, "td", cell.text, cell.className);
        if (cell.colSpan) td.colSpan = cell.colSpan;
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    doc.body.appendChild(table);
  }

  appendTextElement(doc, doc.body, "script", PRINT_ON_LOAD);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

/**
 * Opens a generated financial document in an isolated tab. The document is
 * created before the user gesture ends, and the tab has no opener reference
 * back to the authenticated application.
 */
export function openFinancePrintDocument(spec: FinancePrintDocument) {
  const blob = new Blob([renderFinancePrintHtml(spec)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank", `noopener,noreferrer,${spec.windowFeatures}`);
  if (popup) popup.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString() : "-";
const cell = (text: unknown, className?: string, colSpan?: number): PrintCell => ({
  text: text == null || text === "" ? "-" : String(text),
  className,
  colSpan,
});

export function buildPayrollSchedulePrintDocument(
  run: PayrollRun,
  kind: "PAYE" | "PENSION",
  currency?: string | null,
): FinancePrintDocument {
  const field = kind === "PAYE" ? "paye_amount" : "pension_amount";
  const title = kind === "PAYE" ? "PAYE remittance schedule" : "Pension remittance schedule";
  const total = kind === "PAYE" ? run.paye_total : run.pension_total;
  const rows: PrintRow[] = run.lines.map((line) => ({
    cells: [cell(line.employee_name), cell(formatMoney(line[field] ?? 0, currency), "r")],
  }));
  rows.push({
    className: "total",
    cells: [cell(`Total ${kind} payable`), cell(formatMoney(total, currency), "r")],
  });
  return {
    title: `${title} - ${run.document_number}`,
    bodyClass: "narrow",
    windowFeatures: "width=600,height=760",
    blocks: [
      { kind: "heading", level: 1, text: title },
      { kind: "text", className: "sub", text: `${run.period_label || ""} · ${run.document_number} · pay date ${date(run.pay_date)}` },
      { kind: "table", headings: [cell("Employee"), cell(`${kind} withheld`, "r")], rows },
    ],
  };
}

export function buildPayslipPrintDocument(
  run: PayrollRun,
  line: PayrollLine,
  currency?: string | null,
): FinancePrintDocument {
  const money = (amount?: number) => formatMoney(amount ?? 0, currency);
  const components = line.components ?? [];
  const rows: PrintRow[] = components.length
    ? [
        { className: "section", cells: [cell("Earnings", undefined, 2)] },
        ...components.filter((component) => component.kind === "EARNING").map((component) => ({ cells: [cell(component.name), cell(money(component.amount), "r")] })),
        { className: "subtotal", cells: [cell("Gross pay"), cell(money(line.gross_amount), "r")] },
        { className: "section", cells: [cell("Deductions", undefined, 2)] },
        ...components.filter((component) => component.kind === "DEDUCTION").map((component) => ({ cells: [cell(`${component.name} (${component.statutory_type})`), cell(`− ${money(component.amount)}`, "r")] })),
        { className: "total", cells: [cell("Net pay"), cell(money(line.net_amount), "r")] },
      ]
    : [
        { cells: [cell("Gross pay"), cell(money(line.gross_amount), "r")] },
        { cells: [cell("PAYE (income tax)"), cell(`− ${money(line.paye_amount)}`, "r")] },
        { cells: [cell("Pension"), cell(`− ${money(line.pension_amount)}`, "r")] },
        { className: "total", cells: [cell("Net pay"), cell(money(line.net_amount), "r")] },
      ];
  return {
    title: `Payslip - ${line.employee_name || "-"}`,
    bodyClass: "narrow",
    windowFeatures: "width=560,height=720",
    blocks: [
      { kind: "heading", level: 1, text: "Payslip" },
      { kind: "text", className: "sub", text: `${line.employee_name || "-"} · ${run.period_label || ""} · ${run.document_number} · paid ${date(run.pay_date)}` },
      { kind: "table", rows },
    ],
  };
}

export function buildBankReconciliationPrintDocument(input: {
  account: BankAccount;
  currency?: string | null;
  book: number;
  statement: number;
  difference: number;
  matched: BankStatementLine[];
  unmatched: BankStatementLine[];
}): FinancePrintDocument {
  const { account, currency, book, statement, difference, matched, unmatched } = input;
  const money = (amount: number) => formatMoney(amount, currency);
  const lineRows = (lines: BankStatementLine[]) => lines.length
    ? lines.map((line) => ({ cells: [cell(line.txn_date), cell(line.description), cell(money(line.amount), "r")] }))
    : [{ cells: [cell("None", undefined, 3)] }];
  return {
    title: `Bank reconciliation - ${account.name}`,
    bodyClass: "standard",
    windowFeatures: "width=820,height=900",
    blocks: [
      { kind: "heading", level: 1, text: "Bank reconciliation" },
      { kind: "text", className: "sub", text: `${account.name} · ${account.bank_name || ""} · GL ${account.gl_account} · ${new Date().toLocaleDateString()}` },
      { kind: "cards", cards: [
        { label: "Statement balance", value: money(statement) },
        { label: "Book balance", value: money(book) },
        { label: "Difference", value: money(difference), className: difference !== 0 ? "danger" : undefined },
      ] },
      { kind: "heading", level: 3, text: `Matched lines (${matched.length})` },
      { kind: "table", headings: [cell("Date"), cell("Description"), cell("Amount", "r")], rows: lineRows(matched) },
      { kind: "heading", level: 3, text: `Unmatched lines (${unmatched.length})` },
      { kind: "table", headings: [cell("Date"), cell("Description"), cell("Amount", "r")], rows: lineRows(unmatched) },
    ],
  };
}

export function buildExpenseClaimPrintDocument(
  claim: ExpenseClaim,
  statusLabel: string,
  currency?: string | null,
): FinancePrintDocument {
  const money = (amount: number) => formatMoney(amount, currency);
  const rows: PrintRow[] = claim.lines.map((line) => ({ cells: [
    cell(line.expense_account),
    cell(line.description),
    cell(line.cost_center),
    cell(money(line.line_total), "r"),
  ] }));
  rows.push({ className: "total", cells: [cell("Total", undefined, 3), cell(money(claim.total), "r")] });
  return {
    title: `Expense claim ${claim.document_number}`,
    bodyClass: "standard",
    windowFeatures: "width=780,height=900",
    blocks: [
      { kind: "heading", level: 1, text: `Expense claim ${claim.document_number}` },
      { kind: "text", className: "sub", text: `${claim.claimant_name || "-"} · ${date(claim.claim_date)} · ${claim.title || ""} · ${statusLabel}` },
      { kind: "table", headings: [cell("Category"), cell("Description"), cell("Cost center"), cell("Amount", "r")], rows },
    ],
  };
}

function taxPeriodLabel(start: string, end: string) {
  const first = new Date(start);
  const last = new Date(end);
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return last.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  if (first.getMonth() === 0 && last.getMonth() === 11 && first.getFullYear() === last.getFullYear()) {
    return `FY${last.getFullYear()}`;
  }
  return `${first.toLocaleDateString(undefined, { month: "short" })}–${last.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
}

const TAX_STATUS: Record<string, string> = { DRAFT: "Open", FILED: "Filed", PAID: "Paid", CANCELLED: "Cancelled" };

export function buildTaxFilingPackPrintDocument(
  filings: TaxFiling[],
  currency?: string | null,
): FinancePrintDocument {
  const money = (amount: number) => formatMoney(amount, currency);
  const totalAccrued = filings.reduce((sum, filing) => sum + filing.gross_liability, 0);
  const totalOutstanding = filings.reduce((sum, filing) => sum + filing.balance_due, 0);
  const rows: PrintRow[] = filings.map((filing) => ({ cells: [
    cell(filing.obligation_code),
    cell(taxPeriodLabel(filing.period_start, filing.period_end)),
    cell(filing.authority_name),
    cell(money(filing.gross_liability), "r"),
    cell(money(filing.balance_due), "r"),
    cell(date(filing.due_date)),
    cell(filing.filing_reference),
    cell(TAX_STATUS[filing.filing_status] ?? TAX_STATUS.DRAFT),
  ] }));
  rows.push({ className: "total", cells: [
    cell("Total", undefined, 3),
    cell(money(totalAccrued), "r"),
    cell(money(totalOutstanding), "r"),
    cell(" ", undefined, 3),
  ] });
  return {
    title: "Tax filing pack",
    bodyClass: "wide",
    windowFeatures: "width=960,height=720",
    blocks: [
      { kind: "heading", level: 1, text: "Tax filing pack" },
      { kind: "text", className: "sub", text: `Statutory obligations · generated ${new Date().toLocaleString()}` },
      { kind: "table", headings: [
        cell("Tax"), cell("Period"), cell("Authority"), cell("Accrued", "r"),
        cell("Outstanding", "r"), cell("Due date"), cell("Filing ref"), cell("Status"),
      ], rows },
    ],
  };
}

export const printPayrollSchedule = (run: PayrollRun, kind: "PAYE" | "PENSION", currency?: string | null) =>
  openFinancePrintDocument(buildPayrollSchedulePrintDocument(run, kind, currency));

export const printPayslip = (run: PayrollRun, line: PayrollLine, currency?: string | null) =>
  openFinancePrintDocument(buildPayslipPrintDocument(run, line, currency));

export const printBankReconciliation = (input: Parameters<typeof buildBankReconciliationPrintDocument>[0]) =>
  openFinancePrintDocument(buildBankReconciliationPrintDocument(input));

export const printExpenseClaim = (claim: ExpenseClaim, statusLabel: string, currency?: string | null) =>
  openFinancePrintDocument(buildExpenseClaimPrintDocument(claim, statusLabel, currency));

export const printTaxFilingPack = (filings: TaxFiling[], currency?: string | null) =>
  openFinancePrintDocument(buildTaxFilingPackPrintDocument(filings, currency));
