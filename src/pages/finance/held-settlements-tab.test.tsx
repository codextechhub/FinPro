/**
 * Held settlements, as a school reads them and as a platform operator acts on them.
 *
 * Bright Star School has Ikeja and Lekki. Its bursar reads the settlements the
 * platform paid each branch, with a Branch column because the school has two;
 * there is no action on the school's list. A platform operator reads every
 * school's due settlements and may submit only a prepared one that is not
 * already waiting for, or past, approval.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  submit: vi.fn(),
  applies: true,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));

const SETTLEMENT = {
  id: 1, branch: 2, branch_name: "Lekki", status: "PAID", run_on: "2026-10-03", final: false,
  gross: 100_000_000, fees: 1_500_000, transfer_fee: 5_000, amount: 98_495_000,
  bank_account: { id: 9, name: "Lekki Zenith" }, batch: { id: 4, reference: "HS-4", status: "PAID", approval_status: "APPROVED" },
  journal_id: 77, paid_at: "2026-10-03T09:00:00Z", failure_reason: null,
};
const platform = (id: number, approval_status: string | null, tenant = "bright-star") => ({
  ...SETTLEMENT, id, status: "PENDING", paid_at: null, journal_id: null,
  batch: { id: 10 + id, reference: `HS-${id}`, status: "DRAFT", approval_status },
  tenant, tenant_name: tenant === "bright-star" ? "Bright Star School" : "Greenfield", entity: "BSS",
  branch_name: id === 1 ? "Ikeja" : "Lekki",
});

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetHeldSettlementsQuery: () => ({ data: { data: [SETTLEMENT] }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetPlatformHeldSettlementsQuery: () => ({
    data: { data: [platform(1, null), platform(2, "PENDING"), platform(3, "APPROVED", "greenfield")] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useSubmitPlatformHeldSettlementMutation: () => [mocks.submit, { isLoading: false }],
}));

vi.mock("../../host", () => ({
  platformName: "CodeX",
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  hostBranchLens: () => ({ applies: mocks.applies, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { HeldSettlementsTab, PlatformHeldSettlementsTab } from "./held-settlements-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.held = new Set();
  mocks.applies = true;
  mocks.submit.mockReset();
  mocks.submit.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Settlement submitted for approval.", data: { approval: { parked: false } } }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent);
const row = (text: string) => [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(text)) as HTMLTableRowElement;

describe("a school's held settlements", () => {
  it("names each settlement's branch at a school with several branches, read only", () => {
    act(() => root.render(<HeldSettlementsTab entity="BSS" />));
    expect(headers()).toContain("Branch");
    expect(row("Lekki Zenith").textContent).toContain("Lekki");
    expect(row("Lekki Zenith").textContent).toContain("Paid");
    expect(container.textContent).not.toContain("Submit");
  });

  it("drops the Branch column at a school with one branch", () => {
    mocks.applies = false;
    act(() => root.render(<HeldSettlementsTab entity="BSS" />));
    expect(headers()).not.toContain("Branch");
  });
});

describe("the platform's held settlements", () => {
  it("offers Submit only on a prepared settlement, to a reader who may submit", () => {
    mocks.held = new Set(["801001", "801030"]);
    act(() => root.render(<PlatformHeldSettlementsTab />));
    expect(row("Ikeja").textContent).toContain("Submit");
    expect(row("Waiting for approval").textContent).not.toContain("Submit");
    expect(row("Greenfield").textContent).not.toContain("Submit");
  });

  it("offers no Submit to a reader who may only read", () => {
    mocks.held = new Set(["801001"]);
    act(() => root.render(<PlatformHeldSettlementsTab />));
    expect(container.querySelector("tbody")?.textContent).not.toContain("Submit");
  });

  it("filters by school and submits the confirmed settlement", async () => {
    mocks.held = new Set(["801001", "801030"]);
    act(() => root.render(<PlatformHeldSettlementsTab />));
    const school = container.querySelector('select[aria-label="School"]') as HTMLSelectElement;
    expect([...school.options].map((o) => o.textContent)).toEqual(["All schools", "Bright Star School", "Greenfield"]);
    const button = [...row("Ikeja").querySelectorAll("button")].find((b) => b.textContent?.includes("Submit")) as HTMLButtonElement;
    act(() => button.click());
    const confirm = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Submit") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    expect(mocks.submit).toHaveBeenCalledWith({ id: 1 });
  });
});
