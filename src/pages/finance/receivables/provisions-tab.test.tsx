/**
 * The doubtful-debt provision runs, for the whole-school bursar and a branch one.
 *
 * Mrs Bello covers Bright Star's Ikeja and Lekki branches; Mrs Adeyemi covers
 * Lekki only. A run covers every branch at once, so only Mrs Bello is offered
 * a new one; both see the runs. At a school with two branches each branch's
 * figures are named, and the journal recap is the net of the branch lines.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../../permissions";
import type { DoubtfulDebtProvision } from "@/redux/services/finance/fees-types";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  wholeSchool: true,
  rows: [] as unknown[],
  mutation: () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }],
}));
const holds = (code: PermissionCode) => mocks.held.has(FINANCE_PERMISSION_REGISTRY[code]);

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: holds,
    hasAnyPermission: (...codes: PermissionCode[]) => codes.some(holds),
    hasAllPermissions: (...codes: PermissionCode[]) => codes.every(holds),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
  hostBranchLens: undefined,
}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetProvisionsQuery: () => ({ data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useCreateProvisionMutation: mocks.mutation,
  useSubmitProvisionMutation: mocks.mutation,
  usePostProvisionMutation: mocks.mutation,
}));

import { ProvisionsTab, provisionRecap } from "./provisions-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUN: DoubtfulDebtProvision = {
  id: 4, document_number: "DDP-0004", status: "DRAFT", as_of: "2026-12-31", narration: "",
  required_total: 90_000_00, movement_total: 60_000_00,
  policy_snapshot: [{ over_days: 180, rate_bps: 2500 }],
  lines: [
    { branch_id: 1, branch_name: "Ikeja", required: 50_000_00, current: 10_000_00, movement: 40_000_00, bands: { "180": { owed: 200_000_00, required: 50_000_00 } }, journal_id: null },
    { branch_id: 2, branch_name: "Lekki", required: 40_000_00, current: 20_000_00, movement: 20_000_00, bands: { "180": { owed: 160_000_00, required: 40_000_00 } }, journal_id: null },
  ],
  approval_required: true, created_at: "2026-12-31T10:00:00Z",
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (wholeSchool: boolean, ...keys: string[]) => {
  mocks.wholeSchool = wholeSchool;
  mocks.held = new Set(["finance.provision.view", ...keys]);
  mocks.rows = [RUN];
  act(() => root.render(<MemoryRouter><ProvisionsTab entity="BSS" currency="NGN" /></MemoryRouter>));
  return container.textContent ?? "";
};

describe("provision runs", () => {
  it("offers a new run to the whole-school bursar only", () => {
    expect(render(true, "finance.provision.create")).toContain("New provision run");
    const branchText = render(false, "finance.provision.create");
    expect(branchText).not.toContain("New provision run");
    expect(branchText).toContain("only someone who covers the whole school raises one");
  });

  it("names each branch's figures and offers Submit for approval on a gated draft", () => {
    render(true, "finance.provision.submit");
    const row = [...container.querySelectorAll("tr, [role=button], button")].find((el) => el.textContent?.includes("DDP-0004"));
    act(() => (row as HTMLElement).click());
    const text = document.body.textContent ?? "";
    expect(text).toContain("By branch");
    expect(text).toContain("Ikeja");
    expect(text).toContain("Lekki");
    expect(text).toContain("Submit for approval");
  });

  it("recaps an increase as bad debts against the allowance, and a release the other way", () => {
    expect(provisionRecap(RUN.lines)).toMatchObject({ net: 60_000_00, dr: [{ code: "5350" }], cr: [{ code: "1290" }] });
    const release = provisionRecap([{ ...RUN.lines[0], movement: -5_000_00 }]);
    expect(release).toMatchObject({ net: -5_000_00, dr: [{ code: "1290", amount: 5_000_00 }], cr: [{ code: "5350" }] });
  });
});
