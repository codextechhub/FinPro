/**
 * Mrs Bello's capital entry comes back from the bursar: the date is wrong.
 * She moves the date alone, and only the date is sent; the lines she did not
 * touch stay on the server. Splitting the credit across two accounts sends
 * every line, because the server replaces them all.
 */
import { describe, expect, it } from "vitest";

import type { JournalDetail } from "@/redux/services/finance/gl-types";
import { directEntryChanges, directEntryForm } from "./direct-entry-edit";

const SAVED = {
  id: 40, document_number: "JV-0040", date: "2026-10-01", narration: "Owner's capital", reference: "",
  source: "MANUAL", status: "DRAFT",
  lines: [
    { id: 1, account_code: "1010", debit: 500_000_000, credit: 0, cost_center: null, dimensions: {} },
    { id: 2, account_code: "3000", debit: 0, credit: 500_000_000, cost_center: null, dimensions: {} },
  ],
} as unknown as JournalDetail;

describe("directEntryChanges", () => {
  it("sends nothing when nothing changed", () => {
    expect(directEntryChanges(SAVED, directEntryForm(SAVED))).toEqual({});
  });

  it("sends only the corrected date", () => {
    expect(directEntryChanges(SAVED, { ...directEntryForm(SAVED), date: "2026-10-02" })).toEqual({ date: "2026-10-02" });
  });

  it("sends every line when one changed", () => {
    const form = directEntryForm(SAVED);
    const rows = [form.rows[0], { ...form.rows[1], amountKobo: 300_000_000 }, { account: "2200", amountKobo: 200_000_000, side: "credit" as const, costCenter: "ADM", dimensions: {} }];
    expect(directEntryChanges(SAVED, { ...form, rows })).toEqual({
      lines: [
        { account: "1010", debit: 500_000_000, credit: 0 },
        { account: "3000", debit: 0, credit: 300_000_000 },
        { account: "2200", debit: 0, credit: 200_000_000, cost_center: "ADM" },
      ],
    });
  });
});
