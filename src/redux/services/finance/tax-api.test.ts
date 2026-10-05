/**
 * The requests behind a tax return's shares. A payment names the share it pays;
 * a penalty names the branch that bears it; reversing a payment carries its
 * reason.
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

import "./tax-api";

const request = (name: string, args: Record<string, unknown>) => captured.endpoints[name].query(args as never);

describe("a tax return's requests", () => {
  it("pays one branch's share from its own bank", () => {
    expect(request("payTaxShare", { id: 9, entity: "BRIGHTSTAR", pay_date: "2026-11-21", bank_account: "12", branch: 2 })).toEqual({
      url: "/finance/tax-filings/9/pay/?entity=BRIGHTSTAR", method: "POST",
      body: { pay_date: "2026-11-21", bank_account: "12", branch: 2 },
    });
  });

  it("files with the branch that bears the penalty", () => {
    const sent = request("fileTaxReturn", { id: 9, entity: "BRIGHTSTAR", filed_date: "2026-11-20", adjustment_amount: 2500000, adjustment_account: "6100", adjustment_branch: 1 });
    expect(sent.body).toEqual({ filed_date: "2026-11-20", adjustment_amount: 2500000, adjustment_account: "6100", adjustment_branch: 1 });
  });

  it("reverses one payment with its reason", () => {
    expect(request("reverseTaxRemittance", { id: 9, remittanceId: 31, entity: "BRIGHTSTAR", reason: "Wrong bank" })).toEqual({
      url: "/finance/tax-filings/9/remittances/31/reverse/?entity=BRIGHTSTAR", method: "POST", body: { reason: "Wrong bank" },
    });
  });

  it("reads the people behind a return", () => {
    expect(request("getTaxFilingSchedule", { id: 9, entity: "BRIGHTSTAR" }).url).toBe("/finance/tax-filings/9/schedule/?entity=BRIGHTSTAR");
  });
});
