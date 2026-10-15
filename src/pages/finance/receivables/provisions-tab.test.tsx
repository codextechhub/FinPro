/**
 * The doubtful-debt provision runs, for the whole-school bursar and a branch one.
 *
 * Mrs Bello covers Bright Star's Ikeja and Lekki branches; Mrs Adeyemi covers
 * Lekki only. A run covers every branch at once, so only Mrs Bello is offered
 * a new one, or Submit and Post on a draft. Mrs Adeyemi is sent Lekki's part of
 * each run (`partial_view`, `approval_required` null) and is told so. At a
 * school with two branches each branch's figures are named, and the journal
 * recap is the net of the branch lines.
 *
 * Field Access: the run and its branch lines are `finance.provision` fields. A
 * role that may not read one has it, its header and its filter left out, a role
 * that may not read the status is offered no Submit or Post, and the provision
 * date and narration are the two typed in when a run is raised.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../../permissions";
import type { DoubtfulDebtProvision, ProvisionLine } from "@/redux/services/finance/fees-types";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  wholeSchool: true,
  rows: [] as unknown[],
  access: {} as Record<string, unknown>,
  query: vi.fn(),
  create: vi.fn(),
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
    fieldAccess: mocks.access,
  }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingDateField: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <label>{label}<input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /></label>
  ),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: returned.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
  hostBranchLens: undefined,
}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetProvisionsQuery: (args: unknown) => (mocks.query(args), { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useCreateProvisionMutation: () => [mocks.create, { isLoading: false }],
  useSubmitProvisionMutation: mocks.mutation,
  usePostProvisionMutation: mocks.mutation,
}));

import { ProvisionsTab, isPartOfRun, provisionRecap } from "./provisions-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUN: DoubtfulDebtProvision & { lines: ProvisionLine[] } = {
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
const LEKKI_PART: DoubtfulDebtProvision & { lines: ProvisionLine[] } = {
  ...RUN, lines: [RUN.lines[1]], required_total: 40_000_00, movement_total: 20_000_00,
  approval_required: null, partial_view: true,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {};
  mocks.query.mockReset();
  mocks.create.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Prepared.", data: RUN }) });
});
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

const RESOURCE = "finance.provision";
const ALL_LINE_KEYS = ["branch_id", "branch_name", "required", "current", "movement", "bands", "journal_id"];

/** A run as the server sends it to a role that may not read these keys, lines included. */
const served = (run: DoubtfulDebtProvision, hidden: string[]): DoubtfulDebtProvision => {
  const drop = <T extends object>(row: T): T => Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.includes(key))) as T;
  const { lines, ...rest } = run;
  return { ...drop(rest), lines: (lines ?? []).map(drop).filter((line) => Object.keys(line).length > 0) };
};

/** Restricts the role and feeds the screen the runs the server would send it. */
const restrict = (restrictions: { hidden?: string[]; read_only?: string[] }, runs: DoubtfulDebtProvision[] = [RUN]) => {
  mocks.access = { [RESOURCE]: restrictions };
  return runs.map((run) => served(run, restrictions.hidden ?? []));
};

const headers = () => Array.from(document.body.querySelectorAll("table")).map((t) => Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent?.trim()));
const aligned = () => Array.from(document.body.querySelectorAll("table")).every((t) => {
  const first = t.querySelector("tbody tr");
  return !first || first.querySelectorAll("td").length === t.querySelectorAll("thead th").length;
});
const button = (label: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(label));

describe("the provision list under Field Access", () => {
  it("shows every column when nothing is restricted", () => {
    render(true, "finance.provision.view");
    expect(headers()[0]).toEqual(["Ref", "As of", "Allowance required", "Change", "Status"]);
    expect(container.querySelector('select[aria-label="Status"]')).not.toBeNull();
    expect(aligned()).toBe(true);
  });

  it("leaves out each hidden column with its header", () => {
    const rows = restrict({ hidden: ["as_of", "movement_total"] });
    renderRows(rows, true, "finance.provision.view");
    expect(headers()[0]).toEqual(["Ref", "Allowance required", "Status"]);
    expect(aligned()).toBe(true);
    expect(container.textContent).toContain("DDP-0004");
  });

  it("leaves out the status column, the sent-back filter and the filter argument when the status is hidden", () => {
    const rows = restrict({ hidden: ["status", "approval_state", "approval_returned", "approval_required"] });
    renderRows(rows, true, "finance.provision.view");
    expect(headers()[0]).toEqual(["Ref", "As of", "Allowance required", "Change"]);
    expect(container.querySelector('select[aria-label="Status"]')).toBeNull();
    expect(mocks.query).toHaveBeenLastCalledWith({ entity: "BSS", page: 1 });
  });

  it("keeps the number and the branch picker whatever the map lists", () => {
    mocks.access = { [RESOURCE]: { hidden: ["document_number", "branch_id", "branch_name"] } };
    renderRows([RUN], true, "finance.provision.view");
    expect(headers()[0][0]).toBe("Ref");
    expect(container.textContent).toContain("DDP-0004");
    expect(container.querySelector('select[aria-label="Branch"]')).not.toBeNull();
  });
});

describe("a provision run's drawer under Field Access", () => {
  it("shows the branch lines, the ages and the recap when nothing is restricted", () => {
    renderRows([RUN], true, ...ALL_KEYS);
    openRun();
    expect(headers()[1]).toEqual(["Branch", "Required", "Held now", "Change"]);
    expect(headers()[2]).toEqual(["Branch", "Band", "Owed", "Required"]);
    expect(document.body.textContent).toContain("Raising the allowance");
    expect(document.body.textContent).toContain("at 25%");
    expect(aligned()).toBe(true);
  });

  it("drops the hidden figures from the branch table, header and cell together", () => {
    const rows = restrict({ hidden: ["current", "movement"] });
    renderRows(rows, true, ...ALL_KEYS);
    openRun();
    expect(headers()[1]).toEqual(["Branch", "Required"]);
    expect(aligned()).toBe(true);
    expect(document.body.textContent).not.toContain("Raising the allowance");
  });

  it("keeps the branch column in both tables whatever the map lists", () => {
    mocks.access = { [RESOURCE]: { hidden: ["branch_id", "branch_name"] } };
    renderRows([RUN], true, ...ALL_KEYS);
    openRun();
    expect(headers()[1]).toEqual(["Branch", "Required", "Held now", "Change"]);
    expect(headers()[2]).toEqual(["Branch", "Band", "Owed", "Required"]);
    expect(document.body.textContent).toContain("Ikeja");
    expect(aligned()).toBe(true);
  });

  it("removes the age table when the bands are hidden and the rate when the policy is hidden", () => {
    renderRows(restrict({ hidden: ["bands"] }), true, ...ALL_KEYS);
    openRun();
    expect(document.body.textContent).not.toContain("By age");
    act(() => root.unmount());
    root = createRoot(container);
    document.body.querySelectorAll("[role=dialog]").forEach((d) => d.remove());
    renderRows(restrict({ hidden: ["policy_snapshot"] }), true, ...ALL_KEYS);
    openRun();
    expect(document.body.textContent).toContain("By age");
    expect(document.body.textContent).not.toContain("at 25%");
  });

  it("drops the ages and the rates the server leaves out when the provision bands setting is hidden", () => {
    // finance.provision lists nothing as hidden; the receivables policy switch closes both.
    const { policy_snapshot: _snapshot, ...rest } = RUN;
    const stripped = { ...rest, lines: RUN.lines.map(({ bands: _bands, ...line }) => line) } as DoubtfulDebtProvision;
    renderRows([stripped], true, ...ALL_KEYS);
    const text = openRun();
    expect(text).not.toContain("By age");
    expect(text).not.toContain("at 25%");
    expect(text).not.toMatch(/NaN|undefined/);
    expect(headers()[1]).toEqual(["Branch", "Required", "Held now", "Change"]);
    expect(headers()).toHaveLength(2);
    expect(text).toContain("Raising the allowance");
    expect(aligned()).toBe(true);
  });

  it("removes the branch table and the recap when every line field is hidden", () => {
    const rows = restrict({ hidden: ALL_LINE_KEYS });
    expect(rows[0].lines).toEqual([]);
    renderRows(rows, true, ...ALL_KEYS);
    const text = openRun();
    expect(text).not.toContain("By branch");
    expect(text).not.toContain("Figures");
    expect(text).not.toContain("By age");
    expect(text).not.toContain("Raising the allowance");
    expect(text).toContain("Status");
  });

  it("removes the date and the status card that are hidden", () => {
    const rows = restrict({ hidden: ["as_of", "status", "approval_state", "approval_returned", "approval_required"] });
    renderRows(rows, true, ...ALL_KEYS);
    const row = container.querySelector("tbody tr") as HTMLElement;
    act(() => row.click());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Allowance required");
    expect(text).toContain("DDP-0004");
    expect(text).not.toContain("aged to");
    expect(document.body.querySelector("[role=dialog]")?.textContent).not.toContain("Status");
  });

  it("removes the total cards that are hidden", () => {
    const rows = restrict({ hidden: ["required_total", "movement_total"] });
    renderRows(rows, true, ...ALL_KEYS);
    const text = openRun();
    expect(text).not.toContain("Allowance required");
    expect(text).not.toContain("Change to the allowance");
    expect(text).toContain("Status");
  });

  it("offers neither Submit nor Post when the status is hidden", () => {
    const rows = restrict({ hidden: ["status", "approval_state", "approval_returned", "approval_required"] });
    renderRows(rows, true, ...ALL_KEYS);
    const row = container.querySelector("tbody tr") as HTMLElement;
    act(() => row.click());
    expect(button("Submit for approval")).toBeUndefined();
    expect(button("Post provision")).toBeUndefined();
  });

  it("hides the narration when it may not be read", () => {
    renderRows([{ ...RUN, narration: "Year-end provision" }], true, ...ALL_KEYS);
    expect(openRun()).toContain("Year-end provision");
    act(() => root.unmount());
    root = createRoot(container);
    document.body.querySelectorAll("[role=dialog]").forEach((d) => d.remove());
    renderRows(restrict({ hidden: ["narration"] }, [{ ...RUN, narration: "Year-end provision" }]), true, ...ALL_KEYS);
    expect(openRun()).not.toContain("Year-end provision");
  });
});

describe("raising a provision run under Field Access", () => {
  const open = (restrictions: { hidden?: string[]; read_only?: string[] } = {}) => {
    mocks.access = { [RESOURCE]: restrictions };
    mocks.wholeSchool = true;
    mocks.held = new Set(["finance.provision.view", "finance.provision.create"]);
    mocks.rows = [];
    act(() => root.render(<MemoryRouter><ProvisionsTab entity="BSS" currency="NGN" /></MemoryRouter>));
  };
  const type = (label: string, value: string) => {
    const input = document.body.querySelector<HTMLInputElement>(`[aria-label="${label}"], [placeholder="e.g. Year-end provision"]`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const prepare = async () => { await act(async () => { button("Prepare run")?.click(); }); };

  it("sends the date and the narration when both may be written", async () => {
    open();
    await act(async () => { button("New provision run")?.click(); });
    await act(async () => { type("Age debts to", "2026-12-31"); type("Narration", "Year-end"); });
    await prepare();
    expect(mocks.create).toHaveBeenCalledWith({ entity: "BSS", as_of: "2026-12-31", narration: "Year-end" });
  });

  it("offers no new run when the provision date may not be written", () => {
    open({ read_only: ["as_of"] });
    expect(button("New provision run")).toBeUndefined();
    act(() => root.unmount());
    root = createRoot(container);
    open({ hidden: ["as_of"] });
    expect(button("New provision run")).toBeUndefined();
  });

  it("greys the narration and leaves it out of the body when it is read-only", async () => {
    open({ read_only: ["narration"] });
    await act(async () => { button("New provision run")?.click(); });
    expect(document.body.querySelector('[data-field="narration"]')?.getAttribute("data-read-only")).toBe("true");
    await act(async () => { type("Age debts to", "2026-12-31"); });
    await prepare();
    expect(mocks.create).toHaveBeenCalledWith({ entity: "BSS", as_of: "2026-12-31" });
  });

  it("leaves the narration field out when it is hidden", async () => {
    open({ hidden: ["narration"] });
    await act(async () => { button("New provision run")?.click(); });
    expect(document.body.querySelector('[data-field="narration"]')).toBeNull();
  });

  it("shows a refusal beside the date it names", async () => {
    mocks.create.mockReturnValue({ unwrap: async () => { throw { status: 403, data: { error: { code: "field_write_denied", detail: { as_of: ["You do not have permission to change this field."] } } } }; } });
    open();
    await act(async () => { button("New provision run")?.click(); });
    await act(async () => { type("Age debts to", "2026-12-31"); });
    await prepare();
    expect(document.body.querySelector('[data-field="as_of"] [role=alert]')?.textContent).toContain("do not have permission");
  });
});
