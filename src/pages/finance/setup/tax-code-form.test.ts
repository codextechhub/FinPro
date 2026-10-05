import { describe, expect, it } from "vitest";
import type { TaxCode } from "@/redux/services/finance/setup-types";
import { taxCodeFormValues, taxCodeUpsertPayload } from "./tax-code-form";

const taxCode: TaxCode = {
  id: 7,
  code: "VAT-7.5",
  name: "VAT 7.5%",
  rate_bps: 750,
  treatment: "STANDARD",
  is_recoverable: false,
  collected_account: "2210",
  paid_account: "1210",
  is_active: false,
};

describe("tax code edit form", () => {
  it("prefills every updatable field from an existing tax code", () => {
    expect(taxCodeFormValues(taxCode)).toEqual({
      code: "VAT-7.5",
      name: "VAT 7.5%",
      treatment: "STANDARD",
      percentage: "7.5",
      recoverable: false,
      collectedAccount: "2210",
      paidAccount: "1210",
      active: false,
    });
  });

  it("sends changed fields through the backend's upsert contract", () => {
    expect(taxCodeUpsertPayload("ACME", {
      ...taxCodeFormValues(taxCode),
      name: " Updated VAT ",
      percentage: "8.25",
      collectedAccount: "",
      active: true,
    })).toEqual({
      entity: "ACME",
      code: "VAT-7.5",
      name: "Updated VAT",
      treatment: "STANDARD",
      rate_bps: 825,
      is_recoverable: false,
      collected_account: undefined,
      paid_account: "1210",
      is_active: true,
    });
  });

  it("keeps an exempt code exempt on edit, at a rate of zero", () => {
    const exempt: TaxCode = { ...taxCode, code: "VAT-EXEMPT", name: "VAT exempt", rate_bps: 0, treatment: "EXEMPT" };
    const values = taxCodeFormValues(exempt);
    expect(values.treatment).toBe("EXEMPT");
    expect(taxCodeUpsertPayload("ACME", { ...values, percentage: "7.5" })).toMatchObject({
      code: "VAT-EXEMPT", treatment: "EXEMPT", rate_bps: 0,
    });
  });

  it("reads a code from a server that names no treatment as standard rated", () => {
    const older: TaxCode = { ...taxCode, treatment: undefined };
    expect(taxCodeFormValues(older).treatment).toBe("STANDARD");
  });
});
