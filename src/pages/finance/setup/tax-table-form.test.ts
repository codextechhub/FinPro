/**
 * The PAYE table form shows naira and percent and sends kobo and basis points,
 * with contiguous bands from zero and only the top one open-ended. A new year
 * starts as a copy of the newest table.
 */

import { describe, expect, it } from "vitest";

import type { PayeTaxTable } from "@/redux/services/finance/statutory-types";
import { bandStarts, bpsToPercent, formFromTable, nextYearDraft, percentToBps, tableBody } from "./tax-table-form";

const TABLE_2026: PayeTaxTable = {
  id: 1, country: "NG", tax_year: 2026, name: "NG PAYE 2026", source_reference: "Nigeria Tax Act 2025", notes: "",
  minimum_tax_rate_bps: 0, exempt_income_threshold: 80_000_000, revision: 2, is_active: true, updated_at: "2026-01-02T00:00:00Z",
  bands: [
    { id: 11, sequence: 1, lower: 80_000_000, upper: 220_000_000, rate_bps: 1500 },
    { id: 10, sequence: 0, lower: 0, upper: 80_000_000, rate_bps: 0 },
    { id: 12, sequence: 2, lower: 220_000_000, upper: null, rate_bps: 2500 },
  ],
  reliefs: [
    { id: 20, sequence: 0, code: "PEN", name: "Pension", kind: "CONTRIBUTION", basis: "PENSION", rate_bps: 0, cap_amount: null, floor_amount: 0 },
    { id: 21, sequence: 1, code: "RENT", name: "Rent relief", kind: "PERCENT_CAPPED", basis: "ANNUAL_RENT", rate_bps: 2000, cap_amount: 50_000_000, floor_amount: 0 },
  ],
};

describe("percent and basis points", () => {
  it("round-trips the rates the law states", () => {
    expect(bpsToPercent(1500)).toBe("15");
    expect(bpsToPercent(75)).toBe("0.75");
    expect(percentToBps("15")).toBe(1500);
    expect(percentToBps("0.75")).toBe(75);
  });

  it("refuses what is not a percent from 0 to 100", () => {
    expect(percentToBps("101")).toBeNull();
    expect(percentToBps("-1")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
    expect(percentToBps("")).toBeNull();
  });
});

describe("formFromTable and tableBody", () => {
  it("reads a table in band order and sends it back unchanged", () => {
    const form = formFromTable(TABLE_2026);
    expect(form.bands).toEqual([{ upper: "800000", rate: "0" }, { upper: "2200000", rate: "15" }, { upper: "", rate: "25" }]);
    expect(bandStarts(form.bands)).toEqual(["0", "800000", "2200000"]);
    const result = tableBody(form);
    expect(result.error).toBeNull();
    expect(result.body?.bands).toEqual([
      { lower: 0, upper: 80_000_000, rate_bps: 0 },
      { lower: 80_000_000, upper: 220_000_000, rate_bps: 1500 },
      { lower: 220_000_000, upper: null, rate_bps: 2500 },
    ]);
    expect(result.body?.reliefs?.[1]).toEqual({
      code: "RENT", name: "Rent relief", kind: "PERCENT_CAPPED", basis: "ANNUAL_RENT", rate_bps: 2000, cap_amount: 50_000_000, floor_amount: 0,
    });
    expect(result.body?.exempt_income_threshold).toBe(80_000_000);
  });

  it("refuses a band that does not end above where it starts", () => {
    const form = formFromTable(TABLE_2026);
    form.bands[1].upper = "500000";
    expect(tableBody(form).error).toBe("Band 2 must end above where it starts.");
  });

  it("refuses an upper limit on the top band", () => {
    const form = formFromTable(TABLE_2026);
    form.bands[2].upper = "9000000";
    expect(tableBody(form).error).toMatch(/top band has no upper limit/);
  });

  it("refuses a relief with no code", () => {
    const form = formFromTable(TABLE_2026);
    form.reliefs[0].code = " ";
    expect(tableBody(form).error).toBe("Relief 1 needs a code and a name.");
  });
});

describe("nextYearDraft", () => {
  it("starts the next year from the newest table's rules", () => {
    const older = { ...TABLE_2026, id: 0, tax_year: 2025 };
    const { year, form } = nextYearDraft([older, TABLE_2026], 2026);
    expect(year).toBe(2027);
    expect(form.bands).toHaveLength(3);
    expect(form.name).toBe("");
  });

  it("starts this year's blank table when there is none", () => {
    expect(nextYearDraft([], 2026)).toMatchObject({ year: 2026, form: { bands: [{ upper: "", rate: "" }] } });
  });
});
