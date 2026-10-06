/**
 * Mrs Bello's stationery requisition comes back from Mr Eze asking for fewer
 * reams. She lowers the paper line from 20 to 10, adds toner and drops the
 * pens: the paper goes back with its id so the server corrects it in place,
 * the toner goes without one, and the pens are left out. A title fix alone
 * sends only the title.
 */
import { describe, expect, it } from "vitest";

import type { Requisition } from "@/redux/services/procurement/procurement-types";
import { requisitionApiLines, requisitionChanges, requisitionForm } from "./requisition-edit";

const SAVED: Requisition = {
  id: 9, document_number: "REQ-0009", status: "PENDING_APPROVAL", approval_state: "PENDING", approval_returned: true,
  title: "Stationery", request_date: "2026-10-01", needed_by: "2026-10-20", requested_by_id: 4, requested_by_name: "Mrs Bello",
  cost_center_id: 2, cost_center_code: "ADM", cost_center_name: "Admin", justification: "Term two", estimated_total: 0,
  estimated_total_naira: "0.00", created_at: "2026-10-01T09:00:00Z",
  lines: [
    { id: 31, line_no: 1, catalog_item_id: 5, description: "A4 paper", quantity: "20.0000", unit: "Ream", estimated_unit_price: 450_000, expense_code: null, estimated_line_total: 9_000_000 },
    { id: 32, line_no: 2, catalog_item_id: null, description: "Pens", quantity: "50.0000", unit: "Unit", estimated_unit_price: 20_000, expense_code: null, estimated_line_total: 1_000_000 },
  ],
};

describe("requisitionChanges", () => {
  it("sends nothing when nothing changed", () => {
    expect(requisitionChanges(SAVED, requisitionForm(SAVED))).toEqual({});
  });

  it("sends only a corrected title", () => {
    expect(requisitionChanges(SAVED, { ...requisitionForm(SAVED), title: "Stationery, term two" }))
      .toEqual({ title: "Stationery, term two" });
  });

  it("sends every line when one changed, existing lines with their id and a new one without", () => {
    const form = requisitionForm(SAVED);
    const [paper] = form.lines;
    const changed = requisitionChanges(SAVED, {
      ...form,
      lines: [{ ...paper, quantity: 10 }, { catalogItem: "", description: "Toner", quantity: 2, unit: "Unit", unitPriceKobo: 3_500_000 }],
    });
    expect(changed).toEqual({
      lines: [
        { id: 31, line_no: 1, catalog_item: "5", description: "A4 paper", quantity: 10, unit: "Ream", estimated_unit_price: 450_000 },
        { line_no: 2, description: "Toner", quantity: 2, unit: "Unit", estimated_unit_price: 3_500_000 },
      ],
    });
  });

  it("sends a cleared needed-by date and cost centre as null", () => {
    expect(requisitionChanges(SAVED, { ...requisitionForm(SAVED), neededBy: "", costCenter: "" }))
      .toEqual({ needed_by: null, cost_center: null });
  });
});

describe("requisitionApiLines", () => {
  it("leaves out a blank line and one of no quantity, and numbers the rest in order", () => {
    expect(requisitionApiLines([
      { catalogItem: "", description: " ", quantity: 1, unit: "Unit", unitPriceKobo: 0 },
      { catalogItem: "", description: "Chalk", quantity: 0, unit: "Box", unitPriceKobo: 100 },
      { catalogItem: "", description: "Markers", quantity: 3, unit: " ", unitPriceKobo: 150_000 },
    ])).toEqual([{ line_no: 1, description: "Markers", quantity: 3, unit: "Unit", estimated_unit_price: 150_000 }]);
  });
});
