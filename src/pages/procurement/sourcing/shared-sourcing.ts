/**
 * Several branches buying together on one RFQ.
 *
 * Ikeja wants 60 chairs and Lekki 40. Rather than two suppliers quoting twice,
 * the buyer puts both approved requisitions on one RFQ: the vendor sees one line
 * of 100 chairs, and the award raises one purchase order for each branch, 60 for
 * Ikeja and 40 for Lekki, so each branch receives, owes and reports its own.
 *
 * Each requisition line goes on whole: the server refuses a part of a line,
 * because the branch that owns the rest would then be unclear, and it refuses an
 * RFQ whose lines come from only one branch, which is an ordinary RFQ. Lines with
 * the same description and expense account are put on one RFQ line, and each
 * keeps its allocation to the requisition line and branch it came from.
 *
 * Only lines nothing sources yet are offered: the server lists them (approved,
 * on no live RFQ, order or shared RFQ) and refuses any other, so the same
 * chairs are never put out to tender, or ordered, twice.
 */

import type { FreeRequisitionLine } from "@/redux/services/procurement/procurement-types";

export interface SourceLine {
  requisition_line: number;
  requisition_number: string;
  branch_id: number;
  branch_name: string;
  description: string;
  quantity: number;
  expense_code: string | null;
}

export interface SharedRfqLine {
  key: string;
  description: string;
  quantity: number;
  expense_code: string | null;
  allocations: SourceLine[];
}

/**
 * The free lines the server listed, as the editor offers them. A line whose
 * requisition has no branch yet is left out: the server refuses it until the
 * requisition is placed in a branch.
 */
export function sourceLinesFrom(rows: FreeRequisitionLine[]): SourceLine[] {
  return rows.flatMap((row) => row.branch_id == null ? [] : [{
    requisition_line: row.id,
    requisition_number: row.requisition_number,
    branch_id: row.branch_id,
    branch_name: row.branch_name || "",
    description: row.description,
    quantity: Number(row.quantity),
    expense_code: row.expense_code,
  }]);
}

const groupKey = (line: Pick<SourceLine, "description" | "expense_code">) =>
  `${line.description.trim().toLowerCase().replace(/\s+/g, " ")}|${line.expense_code ?? ""}`;

/** Put the chosen requisition lines on RFQ lines, one per description and account. */
export function groupSharedLines(lines: SourceLine[]): SharedRfqLine[] {
  const groups = new Map<string, SharedRfqLine>();
  for (const line of lines) {
    const key = groupKey(line);
    const group = groups.get(key) ?? { key, description: line.description.trim(), quantity: 0, expense_code: line.expense_code, allocations: [] };
    group.quantity += line.quantity;
    group.allocations.push(line);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The branches the chosen lines buy for, each once. */
export function participatingBranches(lines: SourceLine[]): { id: number; name: string }[] {
  const seen = new Map<number, string>();
  for (const line of lines) seen.set(line.branch_id, line.branch_name);
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id - b.id);
}

/** Why the chosen lines cannot make a shared RFQ yet, or null when they can. */
export function sharedSourcingProblem(lines: SourceLine[]): string | null {
  if (!lines.length) return "Choose the approved requisition lines to buy together.";
  if (participatingBranches(lines).length < 2) return "Buying together needs requisitions from at least two branches. For one branch, raise an ordinary RFQ.";
  return null;
}

/** The request's lines: each RFQ line with its whole requisition lines allocated to it. */
export function sharedRfqLinesBody(groups: SharedRfqLine[], descriptions: Record<string, string> = {}) {
  return groups.map((group, index) => ({
    line_no: index + 1,
    description: (descriptions[group.key] ?? group.description).trim() || group.description,
    quantity: group.quantity,
    ...(group.expense_code ? { expense_account: group.expense_code } : {}),
    allocations: group.allocations.map((line) => ({ requisition_line: line.requisition_line, quantity: line.quantity })),
  }));
}
