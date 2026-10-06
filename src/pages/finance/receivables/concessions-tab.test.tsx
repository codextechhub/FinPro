/**
 * A concession reads with one word per state wherever it appears.
 *
 * Mrs Bello's scholarship for Tunde waits for a second person, and last
 * term's discount for Ada was voided. The status filter, the row pill and the
 * drawer all say "Awaiting approval" for the first and "Voided" for the
 * second, so a bursar who filters on a word finds rows wearing that same word.
 *
 * Tunde's scholarship comes back rejected for a vague reason. Mrs Bello, who
 * may create concessions, corrects the reason alone and only the reason is
 * sent. Ada's, sent back to Mrs Bello (user 4) by an approver, offers her Edit
 * and Resume and no Submit; Mr Ade (user 9) is offered none of them.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Concession } from "@/redux/services/finance/ar-types";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  held: new Set<string>(),
  update: vi.fn(),
  mutation: () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }],
}));

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
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: returned.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));
vi.mock("./use-adjustment-gate", () => ({
  useAdjustmentGate: () => ({ rule: { kind: "none" }, isLoading: false }),
}));
vi.mock("./document-void-action", () => ({ DocumentVoidAction: () => null }));
vi.mock("./income-given-back", () => ({ IncomeGivenBack: () => null }));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetConcessionsQuery: () => ({ data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetConcessionSummaryQuery: () => ({ data: undefined }),
  useGetInvoicesQuery: () => ({ data: undefined }),
  useCreateConcessionMutation: mocks.mutation,
  usePostConcessionMutation: mocks.mutation,
  useSubmitConcessionMutation: mocks.mutation,
  useUpdateConcessionMutation: () => [(body: unknown) => { mocks.update(body); return { unwrap: async () => ({ message: "Scholarship CON-0001 corrected.", data: body }) }; }, { isLoading: false }],
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingDateField: () => null,
  AccountPicker: () => null,
  MoneyInput: () => null,
}));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../../permissions";
import { CONCESSION_FILTER_STATUSES, ConcessionDetailDrawer, ConcessionsTab } from "./concessions-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const concession = (id: number, name: string, status: string): Concession => ({
  id, document_number: `CON-000${id}`, kind: "SCHOLARSHIP", customer_id: id, customer_code: `C-00${id}`,
  customer_name: name, invoice_id: 40 + id, invoice_number: `INV-004${id}`, concession_date: "2026-10-01",
  status, amount: 5_000_000, amount_naira: "50,000.00", allowance_account: "4910", reason: "Scholarship",
  reference: "",
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { mocks.held = new Set(); mocks.update.mockReset(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("concession states", () => {
  it("names each state with the same word in the filter, the row and the drawer", () => {
    mocks.rows = [concession(1, "Tunde Bakare", "PENDING_APPROVAL"), concession(2, "Ada Okafor", "REVERSED")];
    act(() => root.render(<MemoryRouter><ConcessionsTab entity="BSS" currency="NGN" /></MemoryRouter>));

    const options = [...container.querySelectorAll('select[aria-label="Status"] option')].map((o) => o.textContent);
    expect(options).toEqual(["All statuses", "Draft", "Awaiting approval", "Posted", "Voided", "Sent back"]);

    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows.find((t) => t.includes("CON-0001"))).toContain("Awaiting approval");
    expect(rows.find((t) => t.includes("CON-0002"))).toContain("Voided");
    expect(container.textContent).not.toContain("Pending Approval");
    expect(container.textContent).not.toContain("Reversed");

    act(() => (container.querySelector("tbody tr") as HTMLElement).click());
    expect(document.body.textContent).toContain("Awaiting approval");
    expect(document.body.textContent).not.toContain("Pending Approval");
  });

  it("reads Sent back on a row and drawer an approver sent back, and keeps Draft and Awaiting approval otherwise", () => {
    returned.request = undefined;
    mocks.rows = [
      { ...concession(3, "Chidi Obi", "DRAFT"), approval_state: "PENDING", approval_returned: true },
      { ...concession(4, "Ngozi Eze", "DRAFT"), approval_state: "REJECTED", approval_returned: false },
      { ...concession(5, "Bayo Ade", "PENDING_APPROVAL"), approval_state: "PENDING", approval_returned: false },
    ];
    act(() => root.render(<MemoryRouter><ConcessionsTab entity="BSS" currency="NGN" /></MemoryRouter>));

    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows.find((t) => t.includes("CON-0003"))).toContain("Sent back");
    expect(rows.find((t) => t.includes("CON-0004"))).toContain("Draft");
    expect(rows.find((t) => t.includes("CON-0004"))).not.toContain("Sent back");
    expect(rows.find((t) => t.includes("CON-0005"))).toContain("Awaiting approval");

    act(() => (container.querySelector("tbody tr") as HTMLElement).click());
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Sent back");
  });

  it("filters on the states the backend gives a concession", () => {
    expect([...CONCESSION_FILTER_STATUSES]).toEqual(["DRAFT", "PENDING_APPROVAL", "POSTED", "REVERSED"]);
  });
});

/** Type into a controlled input the way React hears it. */
function type(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

describe("correcting a concession", () => {
  it("offers Edit on a rejected draft and sends only the corrected reason", async () => {
    mocks.held = new Set([P.FIN_CREATE_CONCESSION, P.FIN_SUBMIT_CONCESSION]);
    const rejected = { ...concession(1, "Tunde Bakare", "DRAFT"), approval_required: true, approval_state: "REJECTED" };
    act(() => root.render(<ConcessionDetailDrawer concession={rejected} entity="BSS" currency="NGN" onClose={vi.fn()} />));
    expect(button("Submit for approval")).toBeDefined();

    act(() => button("Edit")!.click());
    const reason = document.body.querySelector('input[aria-label="Basis / reason"]') as HTMLInputElement;
    act(() => type(reason, "Academic scholarship, 2026 entrance exam"));
    await act(async () => { button("Save changes")!.click(); });
    expect(mocks.update).toHaveBeenCalledWith({ id: 1, entity: "BSS", reason: "Academic scholarship, 2026 entrance exam" });
  });

  it("offers the sender of a draft an approver sent back Edit and Resume, and no Submit", async () => {
    mocks.held = new Set([P.FIN_CREATE_CONCESSION, P.FIN_SUBMIT_CONCESSION]);
    returned.uid = 4;
    returned.request = { id: "wf-2", status: "RETURNED", requested_by: 4, stage_instances: [] };
    const sentBack = { ...concession(2, "Ada Okafor", "DRAFT"), approval_required: true, approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-2" };
    act(() => root.render(<ConcessionDetailDrawer concession={sentBack} entity="BSS" currency="NGN" onClose={vi.fn()} />));
    expect(button("Edit")).toBeDefined();
    expect(button("Submit for approval")).toBeUndefined();
    await act(async () => { button("Resume")!.click(); });
    expect(returned.resume).toHaveBeenCalledWith("wf-2");
  });

  it("offers neither Edit nor Submit to anybody else, and says only the sender may", () => {
    mocks.held = new Set([P.FIN_CREATE_CONCESSION, P.FIN_SUBMIT_CONCESSION]);
    returned.uid = 9;
    returned.request = { id: "wf-2", status: "RETURNED", requested_by: 4, stage_instances: [] };
    const sentBack = { ...concession(2, "Ada Okafor", "DRAFT"), approval_required: true, approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-2" };
    act(() => root.render(<ConcessionDetailDrawer concession={sentBack} entity="BSS" currency="NGN" onClose={vi.fn()} />));
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
    expect(button("Submit for approval")).toBeUndefined();
    expect(document.body.textContent).toContain("Only the person who sent it can correct it and resume it.");
  });

  it("offers no Edit without the key to create concessions, nor on a posted one", () => {
    mocks.held = new Set([P.FIN_SUBMIT_CONCESSION]);
    act(() => root.render(<ConcessionDetailDrawer concession={concession(1, "Tunde Bakare", "DRAFT")} entity="BSS" currency="NGN" onClose={vi.fn()} />));
    expect(button("Edit")).toBeUndefined();
    mocks.held = new Set([P.FIN_CREATE_CONCESSION]);
    act(() => root.render(<ConcessionDetailDrawer concession={concession(1, "Tunde Bakare", "POSTED")} entity="BSS" currency="NGN" onClose={vi.fn()} />));
    expect(button("Edit")).toBeUndefined();
  });
});
