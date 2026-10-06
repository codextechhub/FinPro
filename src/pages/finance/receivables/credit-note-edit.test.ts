/**
 * The bursar sends back Mrs Bello's ₦15,000 credit note for Tunde: it should
 * be ₦12,000. Lowering the amount sends the note's one line again; fixing only
 * the reason sends only the reason. A note of several lines keeps its lines.
 */
import { describe, expect, it } from "vitest";

import type { CreditNote } from "@/redux/services/finance/ar-types";
import { creditNoteChanges, creditNoteCorrection, creditNoteCorrectionProblem } from "./credit-note-edit";

const LINE = { id: 1, line_no: 1, description: "Overbilled", revenue_account: "4000", quantity: "1.0000", unit_price: 1_500_000, tax_code: null, net_amount: 1_500_000, tax_amount: 0, cost_center: "ADM" };
const NOTE = {
  id: 7, document_number: "CN-0007", kind: "CREDIT", note_date: "2026-10-01", reason: "Overbilled", reference: "",
  subtotal: 1_500_000, total: 1_500_000, lines: [LINE],
} as unknown as CreditNote;

describe("creditNoteChanges", () => {
  it("sends nothing when nothing changed", () => {
    expect(creditNoteChanges(NOTE, creditNoteCorrection(NOTE))).toEqual({});
  });

  it("sends only the corrected reason", () => {
    expect(creditNoteChanges(NOTE, { ...creditNoteCorrection(NOTE), reason: "Overbilled for the bus" })).toEqual({ reason: "Overbilled for the bus" });
  });

  it("sends a lowered amount as the note's line, keeping its description and cost centre", () => {
    expect(creditNoteChanges(NOTE, { ...creditNoteCorrection(NOTE), amount: 1_200_000 })).toEqual({
      lines: [{ revenue_account: "4000", description: "Overbilled", quantity: 1, unit_price: 1_200_000, cost_center: "ADM" }],
    });
  });

  it("never sends lines for a note of several", () => {
    const several = { ...NOTE, lines: [LINE, { ...LINE, id: 2 }] } as CreditNote;
    const form = { ...creditNoteCorrection(several), amount: 1 };
    expect(creditNoteChanges(several, form)).toEqual({});
    expect(creditNoteCorrectionProblem({ ...form, account: "" }, false)).toBeNull();
  });
});
