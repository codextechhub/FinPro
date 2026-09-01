import { describe, expect, it } from "vitest";
import { buildEntityCreatePayload } from "./entity-create-payload";

describe("buildEntityCreatePayload", () => {
  it("includes the complete fiscal calendar supported by the API", () => {
    expect(buildEntityCreatePayload({
      code: " crest ",
      numberCode: " crs ",
      name: " Crestfield Academy ",
      baseCurrency: "NGN",
      fiscalYear: "2026",
      startMonth: "9",
      startDay: "1",
      periodFrequency: "QUARTERLY",
    })).toEqual({
      code: "CREST",
      number_code: "CRS",
      name: "Crestfield Academy",
      base_currency: "NGN",
      fiscal_year: 2026,
      fiscal_start_month: 9,
      fiscal_start_day: 1,
      fiscal_period_frequency: "QUARTERLY",
    });
  });

  it("omits blank optional values but keeps the explicit frequency", () => {
    expect(buildEntityCreatePayload({
      code: "MAIN",
      numberCode: "",
      name: "Main Books",
      baseCurrency: "",
      fiscalYear: "",
      startMonth: "",
      startDay: "",
      periodFrequency: "MONTHLY",
    })).toEqual({
      code: "MAIN",
      number_code: undefined,
      name: "Main Books",
      base_currency: undefined,
      fiscal_year: undefined,
      fiscal_start_month: undefined,
      fiscal_start_day: undefined,
      fiscal_period_frequency: "MONTHLY",
    });
  });
});
