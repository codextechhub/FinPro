/**
 * Editing a requisition: the form's values, the lines it sends, and the body of
 * an edit.
 *
 * An edit sends only what changed, so a reader who fixes the title does not
 * also rewrite the lines a colleague costed a moment ago. When the lines did
 * change, every line goes, each existing one with its `id`: the server updates
 * a line named by id in place, adds a line without one, and removes a line left
 * out. A line an RFQ or order ever named keeps its id that way, so correcting
 * it never cuts the record of where it was sourced, and a line a live RFQ or
 * order still holds is refused by the server rather than silently replaced.
 *
 * The same body corrects a draft and a requisition an approver sent back.
 */

import type { Requisition } from "@/redux/services/procurement/procurement-types";

/** One line on the form. `id` names the saved line it edits; a new line has none. */
export interface RequisitionFormLine {
  id?: number;
  catalogItem: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceKobo: number;
}

/** The form's fields. `costCenter` is a cost centre code, "" for none. */
export interface RequisitionFormValues {
  title: string;
  costCenter: string;
  requestDate: string;
  neededBy: string;
  justification: string;
  lines: RequisitionFormLine[];
}

/** A line as the requisition routes take it. */
export type RequisitionApiLine = {
  id?: number;
  line_no: number;
  catalog_item?: string;
  description: string;
  quantity: number;
  unit: string;
  estimated_unit_price: number;
};

/** The PATCH body's fields. */
export interface RequisitionChanges {
  title?: string;
  cost_center?: string | null;
  request_date?: string;
  needed_by?: string | null;
  justification?: string;
  lines?: RequisitionApiLine[];
}

export const blankRequisitionLine = (): RequisitionFormLine => ({
  catalogItem: "", description: "", quantity: 1, unit: "Unit", unitPriceKobo: 0,
});

/** The form a saved requisition opens with. */
export function requisitionForm(r: Requisition): RequisitionFormValues {
  return {
    title: r.title ?? "",
    costCenter: r.cost_center_code ?? "",
    requestDate: r.request_date ?? "",
    neededBy: r.needed_by ?? "",
    justification: r.justification ?? "",
    lines: r.lines.length ? r.lines.map((line) => ({
      id: line.id,
      catalogItem: line.catalog_item_id ? String(line.catalog_item_id) : "",
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unitPriceKobo: line.estimated_unit_price,
    })) : [blankRequisitionLine()],
  };
}

/** The lines worth sending, numbered in order. A blank line, or one of no quantity, is left out. */
export function requisitionApiLines(lines: readonly RequisitionFormLine[]): RequisitionApiLine[] {
  return lines.filter((line) => line.description.trim() && line.quantity > 0).map((line, index) => ({
    ...(line.id != null ? { id: line.id } : {}),
    line_no: index + 1,
    ...(line.catalogItem ? { catalog_item: line.catalogItem } : {}),
    description: line.description.trim(),
    quantity: line.quantity,
    unit: line.unit.trim() || "Unit",
    estimated_unit_price: line.unitPriceKobo,
  }));
}

/** Only what the form changed, as the server names it. A cleared date or cost centre is sent as null. */
export function requisitionChanges(saved: Requisition, form: RequisitionFormValues): RequisitionChanges {
  const was = requisitionForm(saved);
  const out: RequisitionChanges = {};
  if (form.title.trim() !== was.title.trim()) out.title = form.title.trim();
  if (form.costCenter !== was.costCenter) out.cost_center = form.costCenter || null;
  if (form.requestDate !== was.requestDate) out.request_date = form.requestDate;
  if (form.neededBy !== was.neededBy) out.needed_by = form.neededBy || null;
  if (form.justification.trim() !== was.justification.trim()) out.justification = form.justification.trim();
  const lines = requisitionApiLines(form.lines);
  if (JSON.stringify(lines) !== JSON.stringify(requisitionApiLines(was.lines))) out.lines = lines;
  return out;
}
