import { describe, expect, it } from "vitest";
import type { TaxCode } from "@/redux/services/finance/setup-types";
import { taxCodeFormValid, taxCodeFormValues, taxCodeUpsertPayload, zeroRateHint } from "./tax-code-form";

const taxCode: TaxCode = {
  id: 7,
  code: "VAT-7.5",
  name: "VAT 7.5%",
  treatment: "STANDARD",
  rate_bps: 750,
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
});

describe("VAT treatment", () => {
  const exempt: TaxCode = { ...taxCode, code: "VAT-EXEMPT", name: "VAT exempt", treatment: "EXEMPT", rate_bps: 0 };

  it("keeps an exempt code exempt when it is renamed", () => {
    const sent = taxCodeUpsertPayload("ACME", { ...taxCodeFormValues(exempt), name: "Exempt supplies" });
    expect(sent.treatment).toBe("EXEMPT");
    expect(sent.rate_bps).toBe(0);
  });

  it("sends no rate for an exempt or zero-rated code, whatever was typed", () => {
    expect(taxCodeUpsertPayload("ACME", { ...taxCodeFormValues(exempt), percentage: "5" }).rate_bps).toBe(0);
    expect(taxCodeFormValid({ ...taxCodeFormValues(exempt), percentage: "" })).toBe(true);
  });

  it("reads an older server's code as standard", () => {
    expect(taxCodeFormValues({ ...taxCode, treatment: undefined }).treatment).toBe("STANDARD");
  });
});

describe("the hint beside a code with no rate", () => {
  it("takes the article its treatment needs", () => {
    expect(zeroRateHint("EXEMPT")).toBe("An exempt code charges no tax, so its rate is 0.");
    expect(zeroRateHint("ZERO_RATED")).toBe("A zero-rated code charges no tax, so its rate is 0.");
  });
});
