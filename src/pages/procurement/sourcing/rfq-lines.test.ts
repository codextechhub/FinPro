import { describe, expect, it } from "vitest";

import { emptyLine } from "@/components/finance-ui/line-editor";
import type { RequisitionLine, RfqLine } from "@/redux/services/procurement/procurement-types";
import { requisitionDocLines, rfqDocLines, rfqLinesBody, rfqLinesChanged, type RfqDocLine } from "./rfq-lines";

const chairs: RfqLine = { id: 11, line_no: 1, description: "Classroom chair", quantity: "40.000", requisition_line_id: 501, expense_account_id: 9, expense_code: "5300", tax_code_id: null };
const desks: RfqLine = { id: 12, line_no: 2, description: "Desk", quantity: "10.000", requisition_line_id: 502, expense_account_id: 9, expense_code: "5300", tax_code_id: 4 };
const handAdded: RfqLine = { id: 13, line_no: 3, description: "Delivery", quantity: "1.000", requisition_line_id: null, expense_account_id: null, expense_code: null, tax_code_id: null };

const requisitionChairs: RequisitionLine = { id: 501, line_no: 1, catalog_item_id: null, description: "Classroom chair", quantity: "40.000", unit: "each", estimated_unit_price: 1500000, expense_code: "5300", estimated_line_total: 60000000 };

/** Edit one line as the line editor does: a new object spread over the old. */
const edit = (lines: RfqDocLine[], index: number, patch: Partial<RfqDocLine>) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line));

describe("rfqLinesBody", () => {
  it("sends every saved line's id and requisition link back unchanged when nothing on the lines moved", () => {
    expect(rfqLinesBody(rfqDocLines([chairs, desks, handAdded]))).toEqual([
      { id: 11, description: "Classroom chair", quantity: 40, expense_account: "5300", requisition_line: 501 },
      { id: 12, description: "Desk", quantity: 10, expense_account: "5300", tax_code: "4", requisition_line: 502 },
      { id: 13, description: "Delivery", quantity: 1 },
    ]);
  });

  it("keeps a line's link when its description or quantity is changed", () => {
    const lines = edit(edit(rfqDocLines([chairs, desks]), 0, { quantity: 35 }), 1, { description: "Teacher desk" });
    expect(rfqLinesBody(lines).map((line) => line.requisition_line)).toEqual([501, 502]);
  });

  it("keeps each remaining line's own link when a line above it is removed", () => {
    const lines = rfqDocLines([chairs, desks]).filter((_, i) => i !== 0);
    expect(rfqLinesBody(lines)).toEqual([{ id: 12, description: "Desk", quantity: 10, expense_account: "5300", tax_code: "4", requisition_line: 502 }]);
  });

  it("sends neither an id nor a link for a line added in the form", () => {
    expect(rfqLinesBody([...rfqDocLines([chairs]), { ...emptyLine(), description: "Delivery" }])[1]).toEqual({ description: "Delivery", quantity: 1 });
  });

  it("leaves blank rows out", () => {
    expect(rfqLinesBody([...rfqDocLines([chairs]), emptyLine()])).toHaveLength(1);
  });
});

describe("requisitionDocLines", () => {
  it("links each prefilled line to its requisition line, and the link survives an edit before the first save", () => {
    const lines = edit(requisitionDocLines([requisitionChairs]), 0, { quantity: 30, description: "Chair, stackable" });
    expect(rfqLinesBody(lines)).toEqual([{ description: "Chair, stackable", quantity: 30, expense_account: "5300", requisition_line: 501 }]);
  });
});

describe("rfqLinesChanged", () => {
  it("reads unchanged lines as unchanged, links included", () => {
    expect(rfqLinesChanged(rfqDocLines([chairs, desks]), [chairs, desks])).toBe(false);
  });

  it("reads a changed quantity as a change", () => {
    expect(rfqLinesChanged(edit(rfqDocLines([chairs]), 0, { quantity: 41 }), [chairs])).toBe(true);
  });
});
