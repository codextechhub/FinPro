/**
 * Mrs Bello's ₦50,000 scholarship for Tunde was rejected for a vague reason.
 * She corrects the reason alone, and only the reason is sent.
 */
import { describe, expect, it } from "vitest";

import type { Concession } from "@/redux/services/finance/ar-types";
import { concessionChanges, concessionForm, concessionFormProblem } from "./concession-edit";

const SAVED: Concession = {
  id: 1, document_number: "CON-0001", kind: "SCHOLARSHIP", customer_id: 1, customer_code: "C-001",
  customer_name: "Tunde Bakare", invoice_id: 41, invoice_number: "INV-0041", concession_date: "2026-10-01",
  status: "DRAFT", amount: 5_000_000, amount_naira: "50,000.00", allowance_account: "4910", reason: "Scholarship",
  reference: "",
};

describe("concessionChanges", () => {
  it("sends nothing when nothing changed", () => {
    expect(concessionChanges(SAVED, concessionForm(SAVED))).toEqual({});
  });

  it("sends only the corrected reason", () => {
    expect(concessionChanges(SAVED, { ...concessionForm(SAVED), reason: "Academic scholarship, 2026 entrance exam" }))
      .toEqual({ reason: "Academic scholarship, 2026 entrance exam" });
  });

  it("names every changed field as the server does, a cleared allowance account as null", () => {
    expect(concessionChanges(SAVED, {
      kind: "DISCOUNT", date: "2026-10-02", amount: 4_000_000, allowance: "", reason: "Scholarship", reference: "BOARD-12",
    })).toEqual({
      kind: "DISCOUNT", concession_date: "2026-10-02", amount: 4_000_000, allowance_account: null, reference: "BOARD-12",
    });
  });
});

describe("concessionFormProblem", () => {
  it("needs a date, an amount above zero and a reason", () => {
    expect(concessionFormProblem(concessionForm(SAVED))).toBeNull();
    expect(concessionFormProblem({ ...concessionForm(SAVED), amount: 0 })).toBe("Enter an amount above zero.");
    expect(concessionFormProblem({ ...concessionForm(SAVED), reason: " " })).toBe("Say what the concession is for.");
  });
});
