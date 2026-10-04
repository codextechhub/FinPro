/**
 * The requests behind the fiscal calendar's undo actions.
 *
 * Re-opening a month and forcing a close past its checks each undo a control,
 * and the backend refuses either one without a reason it can store on the
 * audit row. These tests read the request each endpoint builds, so a reason
 * the form collected cannot be dropped on the way to the server.
 *
 * The host's base api is replaced by one that only records the endpoint
 * definitions, which keeps the test independent of either application's
 * interceptor.
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

import "./setup-api";

function request(name: string, args: Record<string, unknown>) {
  return captured.endpoints[name].query(args as never);
}

describe("re-opening a month", () => {
  it("sends the reason in the body", () => {
    const sent = request("reopenPeriod", { id: 41, entity: "BRIGHTSTAR", reason: "Late supplier bill for March" });

    expect(sent.method).toBe("POST");
    expect(sent.url).toBe("/finance/periods/41/reopen/?entity=BRIGHTSTAR");
    expect(sent.body).toEqual({ reason: "Late supplier bill for March" });
  });
});

describe("closing a fiscal year", () => {
  it("sends the reason with a forced close", () => {
    const sent = request("closeFiscalYear", {
      id: 7, entity: "BRIGHTSTAR", force: true, reason: "Auditors need the year sealed", closing_date: "2026-08-31",
    });

    expect(sent.url).toBe("/finance/fiscal-years/7/close/?entity=BRIGHTSTAR");
    expect(sent.body).toEqual({ force: true, reason: "Auditors need the year sealed", closing_date: "2026-08-31" });
  });

  it("sends no override on an ordinary close", () => {
    expect(request("closeFiscalYear", { id: 7, entity: "BRIGHTSTAR" }).body).toEqual({});
  });
});

describe("forcing a month closed", () => {
  it("sends the reason with the force", () => {
    const sent = request("closePeriod", { id: 41, entity: "BRIGHTSTAR", force: true, reason: "Bank feed is down" });

    expect(sent.body).toEqual({ force: true, reason: "Bank feed is down" });
  });
});

/**
 * The fiscal calendar is kept per branch. At a school with several branches each
 * write names its branch in the body and each read asks for one in the address;
 * at a school with one branch both leave it out and the server takes that branch.
 */
describe("a branch's fiscal calendar", () => {
  it("re-opens a year for one branch with exactly the branch and the reason", () => {
    const sent = request("reopenFiscalYear", { id: 7, entity: "BRIGHTSTAR", branch: 2, reason: "June bill arrived late" });

    expect(sent.method).toBe("POST");
    expect(sent.url).toBe("/finance/fiscal-years/7/reopen/?entity=BRIGHTSTAR");
    expect(sent.body).toEqual({ branch: 2, reason: "June bill arrived late" });
  });

  it("re-opens a year at a one-branch school with the reason alone", () => {
    expect(request("reopenFiscalYear", { id: 7, entity: "HARBOUR", reason: "June bill arrived late" }).body)
      .toEqual({ reason: "June bill arrived late" });
  });

  it("names the branch in the body of every other calendar write", () => {
    expect(request("closePeriod", { id: 41, entity: "BRIGHTSTAR", soft: false, branch: 1 }).body).toEqual({ soft: false, branch: 1 });
    expect(request("reopenPeriod", { id: 41, entity: "BRIGHTSTAR", branch: 1, reason: "Late bill" }).body).toEqual({ branch: 1, reason: "Late bill" });
    expect(request("lockPeriod", { id: 41, entity: "BRIGHTSTAR", branch: 1 }).body).toEqual({ branch: 1 });
    expect(request("closeFiscalYear", { id: 7, entity: "BRIGHTSTAR", branch: 1 }).body).toEqual({ branch: 1 });
  });

  it("sends no branch on a write at a one-branch school", () => {
    expect(request("lockPeriod", { id: 41, entity: "HARBOUR" }).body).toEqual({});
    expect(request("reopenPeriod", { id: 41, entity: "HARBOUR", reason: "Late bill" }).body).toEqual({ reason: "Late bill" });
  });

  it("reads one branch's months and checklist with ?branch=", () => {
    expect(request("getFiscalYearPeriods", { entity: "BRIGHTSTAR", year: 2026, branch: 2 }).url)
      .toBe("/finance/periods/?entity=BRIGHTSTAR&year=2026&branch=2&all=true");
    expect(request("getPeriodChecklist", { id: 41, entity: "BRIGHTSTAR", branch: 2 }).url)
      .toBe("/finance/periods/41/checklist/?entity=BRIGHTSTAR&branch=2");
    expect(request("getPeriodChecklist", { id: 41, entity: "HARBOUR" }).url)
      .toBe("/finance/periods/41/checklist/?entity=HARBOUR");
  });
});
