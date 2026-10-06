/**
 * An ordinary RFQ's lines as the edit and amend forms hold them, and the body
 * they send.
 *
 * A line that came from a requisition carries that requisition line's id on
 * the line itself, and keeps it through every edit: a changed description or
 * quantity, a line removed above it, a draft saved again with only its title
 * changed, an amendment. The server replaces an RFQ's lines on every save, so
 * a line sent without its link stops holding the requisition line, and the
 * same chairs read as free to put on another RFQ or order and are bought
 * twice. A line the buyer adds by hand has no link and sends none.
 *
 * A saved line also sends its own `id`, which is how the server matches it to
 * the line it updates. A body for an RFQ that sources requisition lines and
 * names no line ids is refused, because it cannot say which lines were kept;
 * a line left out of a body that names the others is removed. A line added in
 * the form has no id and is new.
 */

import { emptyLine, type DocLine } from "@/components/finance-ui/line-editor";
import type { RequisitionLine, RfqLine } from "@/redux/services/procurement/procurement-types";

/** An editor line that may hold the requisition line it sources. */
export type RfqDocLine = DocLine & { requisitionLine?: number | null; lineId?: number };

/** One line of an RFQ create, edit or amendment body. Unpriced: never a unit price. */
export type RfqLineBody = {
  id?: number;
  description: string;
  quantity: number;
  expense_account?: string;
  tax_code?: string;
  requisition_line?: number;
};

/** An RFQ's saved lines, ready to edit, each keeping its requisition link. */
export function rfqDocLines(lines: RfqLine[]): RfqDocLine[] {
  return lines.map((line) => ({
    ...emptyLine(),
    description: line.description,
    quantity: Number(line.quantity),
    account: line.expense_code || "",
    taxCode: line.tax_code_id ? String(line.tax_code_id) : "",
    requisitionLine: line.requisition_line_id ?? null,
    lineId: line.id,
  }));
}

/** A requisition's lines as a new RFQ's lines, each linked to the line it came from. */
export function requisitionDocLines(lines: RequisitionLine[]): RfqDocLine[] {
  return lines.map((line) => ({
    ...emptyLine(),
    description: line.description,
    quantity: Number(line.quantity),
    account: line.expense_code || "",
    requisitionLine: line.id,
  }));
}

/** The lines to send: blank rows left out, every kept link sent back as it is. */
export function rfqLinesBody(lines: RfqDocLine[]): RfqLineBody[] {
  return lines
    .filter((line) => line.description.trim())
    .map((line) => ({
      ...(line.lineId ? { id: line.lineId } : {}),
      description: line.description.trim(),
      quantity: line.quantity || 1,
      ...(line.account ? { expense_account: line.account } : {}),
      ...(line.taxCode ? { tax_code: line.taxCode } : {}),
      ...(line.requisitionLine ? { requisition_line: line.requisitionLine } : {}),
    }));
}

/** Whether the edited lines differ from the RFQ's saved lines. */
export function rfqLinesChanged(lines: RfqDocLine[], saved: RfqLine[]): boolean {
  return JSON.stringify(rfqLinesBody(lines)) !== JSON.stringify(rfqLinesBody(rfqDocLines(saved)));
}
