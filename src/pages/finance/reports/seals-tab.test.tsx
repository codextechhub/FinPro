/**
 * Closed figures, the auditor's check that closed months and years have not moved.
 *
 * Mrs Bello, who covers the whole school, runs the check: every closed month
 * and year is listed as matching, or the balances that moved are named with
 * what was stored when it closed and what the ledger says now. Mrs Adeyemi, the bursar for
 * Lekki only, is told the check covers every branch and no request is sent;
 * somebody without the key is told their role cannot verify the closed figures.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  result: { data: undefined as unknown, isFetching: false, isError: false, error: undefined as unknown },
  wholeSchool: true,
  denied: new Set<string>(),
  access: {} as Record<string, { hidden?: string[] }>,
  yearArgs: [] as unknown[],
  lens: { applies: true, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false },
}));

vi.mock("@/redux/services/finance/records-api", () => ({
  useLazyVerifySealsQuery: () => [mocks.verify, mocks.result],
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: (args: unknown) => (mocks.yearArgs.push(args), { data: { data: [{ id: 7, year: 2026, start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN" }] } }),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.access,
  }),
}));

vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  hostBranchLens: () => mocks.lens,
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));

import { P } from "../../../permissions";
import { SealsReport, sealVerdict } from "./seals-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: String(kobo / 100) });

const MARCH = {
  seal_id: 11, label: "March 2026 (FY2026)", kind: "PERIOD_CLOSED", fiscal_year: 2026, period_id: 41,
  sealed_at: "2026-04-03T10:00:00Z", seal_checksum: "abc", line_count: 120, line_count_now: 120,
  ok: true, seal_intact: true, lines_match: true, summary: null, differences: [],
};
const APRIL = {
  ...MARCH, seal_id: 12, label: "April 2026 (FY2026)", period_id: 42, line_count: 80, line_count_now: 81,
  ok: false, lines_match: false, summary: "1 ledger line was added after the month closed.",
  differences: [{
    branch_id: 2, branch_name: "Lekki", account_id: 5, account_code: "5100", account_name: "Repairs",
    sealed: { debit: money(2000000), credit: money(0) }, now: { debit: money(2500000), credit: money(0) },
  }],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.verify.mockReset();
  mocks.result = { data: undefined, isFetching: false, isError: false, error: undefined };
  mocks.wholeSchool = true;
  mocks.denied = new Set();
  mocks.access = {};
  mocks.yearArgs = [];
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async () => act(async () => root.render(<SealsReport entity="BRIGHTSTAR" />));
const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);

describe("the verdict", () => {
  it("says every close matches, or how many differ and how many break the chain", () => {
    expect(sealVerdict({ ok: true, checked: 14, mismatches: 0, chain_breaks: [] })).toBe("All 14 closed months and years still match the ledger.");
    expect(sealVerdict({ ok: false, checked: 14, mismatches: 1, chain_breaks: [] })).toBe("1 of 14 closed months and years differ from the ledger.");
    expect(sealVerdict({ ok: false, checked: 14, mismatches: 0, chain_breaks: [9] })).toBe("1 close does not follow the close before it.");
    expect(sealVerdict({ ok: true, checked: 0, mismatches: 0, chain_breaks: [] })).toContain("No month or year has been closed yet");
  });
});

describe("Closed figures", () => {
  it("runs the check only when asked, for the year chosen", async () => {
    await render();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Not checked yet");

    await act(async () => button("Verify closed figures")!.click());
    expect(mocks.verify).toHaveBeenCalledWith({ entity: "BRIGHTSTAR" });
  });

  it("lists what moved, with the branch at a school with several", async () => {
    mocks.result = { data: { data: { ok: false, checked: 2, mismatches: 1, chain_breaks: [], checks: [MARCH, APRIL] } }, isFetching: false, isError: false, error: undefined };
    await render();

    expect(container.textContent).toContain("1 of 2 closed months and years differ from the ledger.");
    expect(container.textContent).toContain("April 2026 (FY2026)");
    expect(container.textContent).toContain("1 ledger line was added after the month closed.");
    expect(container.textContent).toContain("5100 Repairs");
    expect(container.textContent).toContain("Lekki");
    expect(container.textContent).toContain("Matches");
    expect(container.textContent).toContain("Differs");
  });

  it("names the stored figures as closed, never as sealed", async () => {
    mocks.result = { data: { data: { ok: false, checked: 2, mismatches: 1, chain_breaks: [12], checks: [MARCH, { ...APRIL, summary: null }] } }, isFetching: false, isError: false, error: undefined };
    await render();

    expect(container.textContent).toContain("Closed debit");
    expect(container.textContent).toContain("Closed credit");
    expect(button("Verify closed figures")).toBeDefined();
    expect(container.textContent).not.toMatch(/sealed|seal\b|seals\b/i);
  });

  it("tells a branch-only reader the check covers every branch, and sends nothing", async () => {
    mocks.wholeSchool = false;
    await render();

    expect(container.textContent).toContain("Only a school-wide reader can see the closed figures");
    expect(button("Verify closed figures")).toBeUndefined();
  });

  it("tells a reader without the key that their role cannot verify the closed figures", async () => {
    mocks.denied = new Set([P.FIN_VIEW_SEALS]);
    await render();

    expect(container.textContent).toContain("Your role can't verify the closed figures");
  });
});

/** A result with the parts a role's Field Access closed taken out, the way the server omits them. */
const withoutParts = (check: Record<string, unknown>, ...names: string[]) => {
  const copy = { ...check };
  for (const name of names) delete copy[name];
  return copy;
};

const showResult = async (data: unknown) => {
  mocks.result = { data: { data }, isFetching: false, isError: false, error: undefined };
  await render();
};

describe("Closed figures with parts a Field Access switch closed", () => {
  it("draws a row from the parts that remain when the checksum, counts and names are closed", async () => {
    await showResult({
      ok: false, checked: 2, mismatches: 1, chain_breaks: [],
      checks: [
        withoutParts(MARCH, "seal_checksum", "line_count", "line_count_now"),
        withoutParts(APRIL, "label", "kind", "fiscal_year", "period_id", "seal_id", "line_count", "line_count_now"),
      ],
    });

    const text = container.textContent ?? "";
    expect(text).toContain("March 2026 (FY2026)");
    expect(text).toContain("Month closed");
    expect(text).not.toContain("ledger lines");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("undefined");
    expect(text).toContain("Closed month or year 1");
    expect(text).toContain("1 ledger line was added");
  });

  it("draws no balance table when the moved balances and their sentence are closed", async () => {
    await showResult({ ok: false, checked: 1, mismatches: 1, chain_breaks: [], checks: [withoutParts(APRIL, "differences", "summary")] });

    expect(container.textContent).toContain("Differs");
    expect(container.textContent).not.toContain("Closed debit");
    expect(container.textContent).not.toContain("1 ledger line was added");
  });

  it("draws no verdict banner and no badge when the verdict is closed, keeping the list", async () => {
    await showResult({
      chain_breaks: [], checks: [withoutParts(MARCH, "ok"), withoutParts(APRIL, "ok")],
    });

    expect(container.querySelector("[role='status']")?.textContent).toBe("Every close follows the close before it.");
    expect(container.textContent).not.toContain("Matches");
    expect(container.textContent).not.toContain("Differs");
    expect(container.textContent).toContain("April 2026 (FY2026)");
  });

  it("states the broken chain on its own when only the chain is readable", async () => {
    await showResult({ chain_breaks: [12] });

    expect(container.querySelector("[role='status']")?.textContent).toBe("1 close does not follow the close before it.");
    expect(container.querySelector("ul")).toBeNull();
  });

  it("states the verdict without the chain when the chain is closed", async () => {
    await showResult({ ok: false, checked: 3, mismatches: 0 });

    expect(container.textContent).toContain("The closed figures do not all match the ledger.");
    await showResult({ ok: true, checked: 3, mismatches: 0 });
    expect(container.textContent).toContain("All 3 closed months and years still match the ledger.");
  });

  it("leaves out the whole list when it is closed, and a row with nothing readable", async () => {
    await showResult({ ok: true, checked: 2, mismatches: 0, chain_breaks: [] });
    expect(container.querySelector("ul")).toBeNull();
    expect(container.textContent).toContain("All 2 closed months and years still match");

    await showResult({ ok: true, checked: 2, mismatches: 0, chain_breaks: [], checks: [{}, {}] });
    expect(container.querySelector("ul")).toBeNull();
  });

  it("says neutrally that nothing is readable when every part is closed", async () => {
    await showResult({});

    expect(container.textContent).toContain("none of its results are in your access");
  });

  it("asks for archived years only when the role may read the archive state", async () => {
    await render();
    expect(mocks.yearArgs.at(-1)).toEqual({ entity: "BRIGHTSTAR", include_archived: "true" });

    mocks.access = { "finance.fiscalyear": { hidden: ["archived_at", "is_archived"] } };
    mocks.yearArgs = [];
    await render();
    expect(mocks.yearArgs.at(-1)).toEqual({ entity: "BRIGHTSTAR" });
  });
});
