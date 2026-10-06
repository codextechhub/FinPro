/**
 * The doubtful-debt provision runs, for the whole-school bursar and a branch one.
 *
 * Mrs Bello covers Bright Star's Ikeja and Lekki branches; Mrs Adeyemi covers
 * Lekki only. A run covers every branch at once, so only Mrs Bello is offered
 * a new one, or Submit and Post on a draft. Mrs Adeyemi is sent Lekki's part of
 * each run (`partial_view`, `approval_required` null) and is told so. At a
 * school with two branches each branch's figures are named, and the journal
 * recap is the net of the branch lines.
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

/** The approval request a returned document names, and who is signed in. */
const returned = vi.hoisted(() => ({ uid: 4, request: undefined as unknown, resume: vi.fn() }));
vi.mock("@/redux/services/finance/approval-request-api", () => ({
  useGetDocumentApprovalRequestQuery: () => ({ data: undefined }),
  approvalRequestApi: { util: { invalidateTags: () => ({ type: "test/invalidate" }) } },
}));
vi.mock("@/redux/services/dashboard/workflow-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGetWorkflowInstanceQuery: () => ({ data: returned.request }),
  useResubmitWorkflowInstanceMutation: () => [(id: string) => { returned.resume(id); return { unwrap: async () => ({}) }; }, { isLoading: false }],
}));
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
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: returned.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
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

import { ProvisionsTab, isPartOfRun, provisionRecap } from "./provisions-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUN: DoubtfulDebtProvision = {
  id: 4, document_number: "DDP-0004", status: "DRAFT", as_of: "2026-12-31", narration: "",
  required_total: 90_000_00, movement_total: 60_000_00,
  policy_snapshot: [{ over_days: 180, rate_bps: 2500 }],
  lines: [
    { branch_id: 1, branch_name: "Ikeja", required: 50_000_00, current: 10_000_00, movement: 40_000_00, bands: { "180": { owed: 200_000_00, required: 50_000_00 } }, journal_id: null },
    { branch_id: 2, branch_name: "Lekki", required: 40_000_00, current: 20_000_00, movement: 20_000_00, bands: { "180": { owed: 160_000_00, required: 40_000_00 } }, journal_id: null },
  ],
  approval_required: true, created_at: "2026-12-31T10:00:00Z", partial_view: false,
};

/** The same run as Mrs Adeyemi is sent it: Lekki's line and totals alone. */
const LEKKI_PART: DoubtfulDebtProvision = {
  ...RUN, lines: [RUN.lines[1]], required_total: 40_000_00, movement_total: 20_000_00,
  approval_required: null, partial_view: true,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (wholeSchool: boolean, ...keys: string[]) => renderRows([RUN], wholeSchool, ...keys);

const renderRows = (rows: DoubtfulDebtProvision[], wholeSchool: boolean, ...keys: string[]) => {
  mocks.wholeSchool = wholeSchool;
  mocks.held = new Set(["finance.provision.view", ...keys]);
  mocks.rows = rows;
  act(() => root.render(<MemoryRouter><ProvisionsTab entity="BSS" currency="NGN" /></MemoryRouter>));
  return container.textContent ?? "";
};

/** Opens the run's drawer and returns the page's text. */
const openRun = () => {
  const row = [...container.querySelectorAll("tr, [role=button], button")].find((el) => el.textContent?.includes("DDP-0004"));
  act(() => (row as HTMLElement).click());
  return document.body.textContent ?? "";
};

const ALL_KEYS = ["finance.provision.create", "finance.provision.submit", "finance.provision.post"];

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

  it("keeps Submit for approval and the approval note for a whole-school bursar on a full run", () => {
    renderRows([RUN], true, ...ALL_KEYS);
    const text = openRun();
    expect(text).toContain("Submit for approval");
    expect(text).toContain("A second person approves this run");
    expect(text).not.toContain("You are shown only");
  });

  it("keeps Post provision for a whole-school bursar on a run that needs no approval", () => {
    renderRows([{ ...RUN, approval_required: false }], true, ...ALL_KEYS);
    const text = openRun();
    expect(text).toContain("Post provision");
    expect(text).not.toContain("A second person approves this run");
  });

  it("tells a branch bursar they hold their branch's part, and offers no Submit or Post", () => {
    const listText = renderRows([LEKKI_PART], false, ...ALL_KEYS);
    expect(listText).not.toContain("New provision run");
    expect(listText).toContain("You are shown only your branch's part: its figures and its journal.");
    expect(listText).toContain("your branch's part");
    const text = openRun();
    expect(text).toContain("This run covers the whole school. You are shown only your branch's part.");
    expect(text).not.toContain("Submit for approval");
    expect(text).not.toContain("Post provision");
  });

  it("reads a null approval_required as unknown: no approval note and no Submit or Post", () => {
    renderRows([{ ...RUN, approval_required: null }], true, ...ALL_KEYS);
    const text = openRun();
    expect(text).not.toContain("A second person approves this run");
    expect(text).toContain("The figures are worked out again when it posts");
    expect(text).not.toContain("Submit for approval");
    expect(text).not.toContain("Post provision");
  });

  it("tells a branch bursar with no runs where theirs will appear", () => {
    const text = renderRows([], false, ...ALL_KEYS);
    expect(text).toContain("No provision runs");
    expect(text).toContain("A run that includes your branch shows here");
    expect(text).not.toContain("You are shown only");
  });

  it("treats a run as a part when the server says so or withholds approval_required", () => {
    expect(isPartOfRun(RUN)).toBe(false);
    expect(isPartOfRun({ approval_required: undefined })).toBe(false);
    expect(isPartOfRun(LEKKI_PART)).toBe(true);
    expect(isPartOfRun({ partial_view: false, approval_required: null })).toBe(true);
  });

  it("recaps an increase as bad debts against the allowance, and a release the other way", () => {
    expect(provisionRecap(RUN.lines)).toMatchObject({ net: 60_000_00, dr: [{ code: "5350" }], cr: [{ code: "1290" }] });
    const release = provisionRecap([{ ...RUN.lines[0], movement: -5_000_00 }]);
    expect(release).toMatchObject({ net: -5_000_00, dr: [{ code: "1290", amount: 5_000_00 }], cr: [{ code: "5350" }] });
  });
});

describe("a provision run an approver sent back", () => {
  const SENT_BACK = { ...RUN, approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-4" };
  beforeEach(() => {
    returned.request = { id: "wf-4", status: "RETURNED", requested_by: 4, stage_instances: [] };
    returned.resume.mockReset();
  });

  it("offers its sender Resume alone, and says to withdraw it to change it", async () => {
    returned.uid = 4;
    renderRows([SENT_BACK], true, ...ALL_KEYS);
    const text = openRun();
    expect(text).toContain("To change it, withdraw it from your approvals");
    expect(text).not.toContain("Submit for approval");
    const resume = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Resume")!;
    await act(async () => { resume.click(); });
    expect(returned.resume).toHaveBeenCalledWith("wf-4");
  });

  it("offers anybody else nothing", () => {
    returned.uid = 9;
    renderRows([SENT_BACK], true, ...ALL_KEYS);
    openRun();
    expect([...document.body.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Resume")).toBe(false);
  });
});
