/**
 * Adding Aisha at Lekki while Ikeja already pays her is refused on the
 * `employee` field; the form keeps that sentence in view.
 */

import { describe, expect, it } from "vitest";
import { fieldRefusals } from "./payroll-refusals";

describe("a refused payroll write", () => {
  it("gives each field's first message from a 400", () => {
    const error = { status: 400, data: { error: { detail: { employee: ["Aisha Bello is already on the payroll at Ikeja Branch."], name: "Required." } } } };
    expect(fieldRefusals(error)).toEqual({ employee: "Aisha Bello is already on the payroll at Ikeja Branch.", name: "Required." });
  });

  it("is empty for any other failure", () => {
    expect(fieldRefusals({ status: 403, data: { error: { detail: { gross_amount: ["No."] } } } })).toEqual({});
    expect(fieldRefusals(undefined)).toEqual({});
  });
});
