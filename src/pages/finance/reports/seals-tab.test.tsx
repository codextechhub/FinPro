/**
 * Sealed Figures, the auditor's check that closed months and years have not moved.
 *
 * Mrs Bello, who covers the whole school, runs the check: every closed month
 * and year is listed as matching, or the balances that moved are named with
 * what was sealed and what the ledger says now. Mrs Adeyemi, the bursar for
 * Lekki only, is told the check covers every branch and no request is sent;
 * somebody without the key is told their role cannot verify the seals.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  result: { data: undefined as unknown, isFetching: false, isError: false, error: undefined as unknown },
  wholeSchool: true,
  denied: new Set<string>(),
  lens: { applies: true, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false },
}));

vi.mock("@/redux/services/finance/records-api", () => ({
  useLazyVerifySealsQuery: () => [mocks.verify, mocks.result],
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: { data: [{ id: 7, year: 2026, start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN" }] } }),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
  ok: false, lines_match: false, summary: "1 ledger line was added after the seal.",
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
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async () => act(async () => root.render(<SealsReport entity="BRIGHTSTAR" />));
const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);

describe("the verdict", () => {
  it("says every seal matches, or how many differ and how many break the chain", () => {
    expect(sealVerdict({ ok: true, checked: 14, mismatches: 0, chain_breaks: [] })).toBe("All 14 sealed months and years still match the ledger.");
    expect(sealVerdict({ ok: false, checked: 14, mismatches: 1, chain_breaks: [] })).toBe("1 of 14 sealed months and years differ from the ledger.");
    expect(sealVerdict({ ok: false, checked: 14, mismatches: 0, chain_breaks: [9] })).toBe("1 seal does not follow the seal before it.");
    expect(sealVerdict({ ok: true, checked: 0, mismatches: 0, chain_breaks: [] })).toContain("Nothing is sealed yet");
  });
});

describe("Sealed Figures", () => {
  it("runs the check only when asked, for the year chosen", async () => {
    await render();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Not checked yet");

    await act(async () => button("Verify sealed figures")!.click());
    expect(mocks.verify).toHaveBeenCalledWith({ entity: "BRIGHTSTAR" });
  });

  it("lists what moved, with the branch at a school with several", async () => {
    mocks.result = { data: { data: { ok: false, checked: 2, mismatches: 1, chain_breaks: [], checks: [MARCH, APRIL] } }, isFetching: false, isError: false, error: undefined };
    await render();

    expect(container.textContent).toContain("1 of 2 sealed months and years differ from the ledger.");
    expect(container.textContent).toContain("April 2026 (FY2026)");
    expect(container.textContent).toContain("1 ledger line was added after the seal.");
    expect(container.textContent).toContain("5100 Repairs");
    expect(container.textContent).toContain("Lekki");
    expect(container.textContent).toContain("Matches");
    expect(container.textContent).toContain("Differs");
  });

  it("tells a branch-only reader the check covers every branch, and sends nothing", async () => {
    mocks.wholeSchool = false;
    await render();

    expect(container.textContent).toContain("Only a school-wide reader can see the sealed figures");
    expect(button("Verify sealed figures")).toBeUndefined();
  });

  it("tells a reader without the key that their role cannot verify the seals", async () => {
    mocks.denied = new Set([P.FIN_VIEW_SEALS]);
    await render();

    expect(container.textContent).toContain("Your role can't verify the sealed figures");
  });
});
