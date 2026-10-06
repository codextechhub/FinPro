/**
 * A requisition an approver sent back is corrected and resumed by whoever sent it.
 *
 * Mrs Bello (user 4) sends her stationery requisition for approval and Mr Eze
 * returns it: "Use the framework supplier". Her drawer offers Edit and Resume
 * and says who sent it back and why; her correction of the paper line sends
 * the lines with their ids, and Resume posts to the request's resubmit route.
 * Mr Ade (user 9), who may edit requisitions too, sees the note but neither
 * button. While it is still with Mr Eze, nobody sees Edit or Resume.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requisition } from "@/redux/services/procurement/procurement-types";

const mocks = vi.hoisted(() => {
  const state = {
    held: new Set<string>(),
    uid: 4,
    doc: null as unknown,
    rows: [] as unknown[],
    workflow: undefined as unknown,
    update: (() => undefined) as (body: unknown) => void,
    resume: (() => undefined) as (id: unknown) => void,
  };
  const query = () => ({ data: undefined, currentData: undefined, isLoading: false, isFetching: false, isError: false, refetch: () => undefined });
  const mutation = (spy?: (body: unknown) => void) => () => [
    (body: unknown) => { spy?.(body); return { unwrap: async () => ({ message: "Done.", data: { id: 9 } }) }; }, { isLoading: false },
  ];
  /** Every hook an RTK Query module exports, answering empty unless named in `own`. */
  const api = (own: Record<string, unknown>) => new Proxy(own, {
    has: () => true,
    get: (target, key) => {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      if (key.startsWith("useLazy")) return () => [() => ({ unwrap: async () => ({ data: {} }) }), {}];
      if (key.endsWith("Mutation")) return mutation();
      if (key.startsWith("use")) return query;
      return undefined;
    },
  });
  return { state, query, mutation, api };
});

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.state.held.has(code),
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { user: { id: mocks.state.uid }, tenant: {}, permissions: [] } }),
  useAppDispatch: () => () => undefined,
}));
vi.mock("../../lib/display-prefs", () => ({
  useDates: () => ({ day: (value: string) => String(value).slice(0, 10), dateTime: String, time: String, today: () => "2026-10-06" }),
}));
vi.mock("../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("../../lib/host-routes", () => ({ useServesPath: () => () => false }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRaisingBranchChoice: () => ({ ready: true, body: () => ({}) }),
  RaisingBranchChoiceField: () => null,
  useActiveEntity: () => ({ code: "BSS", currency: "NGN", entity: null, isLoading: false }),
}));
vi.mock("./procurement-shell", () => ({ ProcurementShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../host", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), QuickExportButton: () => null }));
vi.mock("@/lib/source-document-route", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useSourceDocumentParam: () => undefined }));
vi.mock("@/hooks/use-action-param", () => ({ useActionParam: () => undefined }));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({ useNoApproverPrompt: () => ({ promptIfParked: () => undefined, noApproverDialog: null }) }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/redux/services/procurement/procurement-api", () => mocks.api({
  useGetRequisitionQuery: () => ({ ...mocks.query(), data: { data: mocks.state.doc } }),
  useGetRequisitionsQuery: () => ({ ...mocks.query(), currentData: { data: mocks.state.rows, pagination: { currentPage: 1, totalPages: 1 } } }),
  useUpdateRequisitionMutation: mocks.mutation((body) => mocks.state.update(body)),
}));
vi.mock("@/redux/services/finance/setup-api", () => mocks.api({}));
vi.mock("@/redux/services/dashboard/workflow-api", () => mocks.api({
  useGetWorkflowInstanceQuery: () => ({ ...mocks.query(), data: mocks.state.workflow }),
  useResubmitWorkflowInstanceMutation: mocks.mutation((id) => mocks.state.resume(id)),
}));

import { P } from "../../permissions";
import RequisitionsPage, { RequisitionDrawer } from "./requisitions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REQ: Requisition = {
  id: 9, document_number: "REQ-0009", status: "PENDING_APPROVAL", approval_state: "PENDING", approval_returned: true,
  title: "Stationery", request_date: "2026-10-01", needed_by: null, requested_by_id: 4, requested_by_name: "Mrs Bello",
  cost_center_id: null, cost_center_code: null, cost_center_name: null, justification: "", estimated_total: 9_000_000,
  estimated_total_naira: "90,000.00", created_at: "2026-10-01T09:00:00Z", workflow_instance_id: "wf-9",
  lines: [{ id: 31, line_no: 1, catalog_item_id: null, description: "A4 paper", quantity: "20.0000", unit: "Ream", estimated_unit_price: 450_000, expense_code: null, estimated_line_total: 9_000_000 }],
};
const RETURNED = {
  id: "wf-9", status: "RETURNED", requested_by: 4, audit_logs: [],
  stage_instances: [{ id: "s1", stage_label: "Head of admin", status: "RETURNED", attempt: 1, eligible_approvers: [], actions: [
    { id: "a1", action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Use the framework supplier", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null, attempt: 1 },
  ] }],
};

let container: HTMLDivElement;
let root: Root;
const update = vi.fn();
const resume = vi.fn();
beforeEach(() => {
  mocks.state.held = new Set([P.PROC_UPDATE_REQUISITION, P.PROC_SUBMIT_REQUISITION]);
  mocks.state.uid = 4;
  mocks.state.doc = REQ;
  mocks.state.workflow = RETURNED;
  update.mockReset();
  resume.mockReset();
  mocks.state.update = update;
  mocks.state.resume = resume;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<MemoryRouter><RequisitionDrawer id={9} entity="BSS" currency="NGN" onClose={() => undefined} /></MemoryRouter>));
const button = (label: string) => [...document.body.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label).pop();
function type(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("a requisition an approver sent back", () => {
  it("offers its sender Edit and Resume, and says who sent it back and why", async () => {
    render();
    expect(document.body.textContent).toContain("Sent back by Mr Eze on 2026-10-03: Use the framework supplier");
    expect(button("Edit")).toBeDefined();
    expect(button("Submit for Approval")).toBeUndefined();
    await act(async () => { button("Resume")!.click(); });
    expect(resume).toHaveBeenCalledWith("wf-9");
  });

  it("sends a corrected line with its id, and nothing it did not change", async () => {
    render();
    act(() => button("Edit")!.click());
    expect(button("Create Requisition")).toBeUndefined();
    const quantity = document.body.querySelector('input[aria-label="Quantity"]') as HTMLInputElement;
    act(() => type(quantity, "10"));
    await act(async () => { button("Save changes")!.click(); });
    expect(update).toHaveBeenCalledWith({
      id: 9, entity: "BSS",
      lines: [{ id: 31, line_no: 1, description: "A4 paper", quantity: 10, unit: "Ream", estimated_unit_price: 450_000 }],
    });
  });

  it("offers neither to a colleague who did not send it, even holding the edit key", () => {
    mocks.state.uid = 9;
    render();
    expect(document.body.textContent).toContain("Only the person who sent it can correct it and resume it.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

describe("a requisition with its approver", () => {
  it("offers no Edit or Resume, and says it is with the approver", () => {
    mocks.state.doc = { ...REQ, approval_returned: false };
    mocks.state.workflow = { ...RETURNED, status: "IN_PROGRESS", stage_instances: [] };
    render();
    expect(document.body.textContent).toContain("With the approver.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

describe("the requisitions list", () => {
  it("reads Sent back on a requisition an approver sent back, and Pending Approval on one still with its approver", () => {
    mocks.state.held = new Set([P.PROC_VIEW_REQUISITIONS]);
    mocks.state.rows = [
      { ...REQ, id: 9, document_number: "REQ-0009", title: "Chairs for Ikeja" },
      { ...REQ, id: 10, document_number: "REQ-0010", title: "Toner", approval_returned: false },
    ];
    act(() => root.render(<MemoryRouter><RequisitionsPage /></MemoryRouter>));
    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows.find((t) => t.includes("REQ-0009"))).toContain("Sent back");
    expect(rows.find((t) => t.includes("REQ-0010"))).toContain("Pending Approval");
    expect(rows.find((t) => t.includes("REQ-0010"))).not.toContain("Sent back");
  });
});
