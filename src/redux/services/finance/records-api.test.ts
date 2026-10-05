/**
 * The requests behind keeping the books. Archiving and unarchiving need a
 * reason the server keeps on the audit row; the settings writes send only the
 * fields given; the seal check is a read that names a year only when asked.
 */
import { describe, expect, it, vi } from "vitest";

type Definition = { query: (args: never) => { url: string; method: string; body?: unknown } };
const captured = vi.hoisted(() => ({ endpoints: {} as Record<string, Definition> }));

vi.mock("@/redux/services/base-api", () => ({
  baseApi: {
    injectEndpoints: ({ endpoints }: { endpoints: (b: unknown) => Record<string, Definition> }) => {
      const builder = { query: (d: Definition) => d, mutation: (d: Definition) => d };
      Object.assign(captured.endpoints, endpoints(builder));
      return {};
    },
  },
}));

import "./records-api";

const request = (name: string, args: Record<string, unknown>) => captured.endpoints[name].query(args as never);

describe("keeping the books", () => {
  it("archives and unarchives a year with the reason in the body", () => {
    expect(request("archiveFiscalYear", { id: 7, entity: "BRIGHTSTAR", reason: "Audited and finished" })).toEqual({
      url: "/finance/fiscal-years/7/archive/?entity=BRIGHTSTAR", method: "POST", body: { reason: "Audited and finished" },
    });
    expect(request("unarchiveFiscalYear", { id: 7, entity: "BRIGHTSTAR", reason: "Tax review" })).toEqual({
      url: "/finance/fiscal-years/7/unarchive/?entity=BRIGHTSTAR", method: "POST", body: { reason: "Tax review" },
    });
  });

  it("sends only the settings given", () => {
    expect(request("updateFinanceCalendarSettings", { entity: "BRIGHTSTAR", next_year_lead_days: 90 })).toEqual({
      url: "/finance/settings/calendar/?entity=BRIGHTSTAR", method: "PATCH", body: { next_year_lead_days: 90 },
    });
    expect(request("updateRecordRetentionSettings", { entity: "BRIGHTSTAR", retention_years: null })).toEqual({
      url: "/finance/settings/records/?entity=BRIGHTSTAR", method: "PATCH", body: { retention_years: null },
    });
  });

  it("verifies the seals of one year only when one is named", () => {
    expect(request("verifySeals", { entity: "BRIGHTSTAR" }).url).toBe("/finance/seals/verify/?entity=BRIGHTSTAR");
    expect(request("verifySeals", { entity: "BRIGHTSTAR", fiscal_year: 2027 }).url).toContain("fiscal_year=2027");
  });
});
