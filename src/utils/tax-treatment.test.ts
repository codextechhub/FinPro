/**
 * VAT treatment in plain words: tuition on the exempt code, textbooks on VAT-STD.
 */
import { describe, expect, it } from "vitest";
import type { TaxCode } from "@/redux/services/finance/setup-types";
import { lineTreatment, treatmentLabel } from "./tax-treatment";

const code = (over: Partial<TaxCode>): TaxCode => ({
  id: 1, code: "VAT-STD", name: "VAT", rate_bps: 750, treatment: "STANDARD", is_recoverable: true,
  collected_account: "2210", paid_account: null, is_active: true, ...over,
});
const CODES = [code({}), code({ id: 2, code: "VAT-EXEMPT", rate_bps: 0, treatment: "EXEMPT" }), code({ id: 3, code: "VAT-ZERO", rate_bps: 0, treatment: "ZERO_RATED" })];

describe("tax treatment", () => {
  it("labels each treatment, with the rate for standard rated", () => {
    expect(treatmentLabel("STANDARD", 750)).toBe("Standard 7.5%");
    expect(treatmentLabel("ZERO_RATED")).toBe("Zero rated");
    expect(treatmentLabel("EXEMPT")).toBe("Exempt");
  });

  it("reads a line's treatment off the school's codes", () => {
    expect(lineTreatment("VAT-STD", CODES)).toBe("Standard 7.5%");
    expect(lineTreatment("VAT-EXEMPT", CODES)).toBe("Exempt");
    expect(lineTreatment("VAT-ZERO", CODES)).toBe("Zero rated");
  });

  it("reads a line with no code as exempt and names an unknown code as it is", () => {
    expect(lineTreatment(null, CODES)).toBe("Exempt");
    expect(lineTreatment("WHT-5", CODES)).toBe("WHT-5");
  });

  it("falls back to the rate on a server that sends no treatment", () => {
    expect(treatmentLabel(undefined, 750)).toBe("7.5%");
    expect(treatmentLabel(undefined, 0)).toBe("Exempt");
  });
});
