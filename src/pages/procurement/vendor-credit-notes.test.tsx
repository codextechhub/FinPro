/**
 * A vendor credit note an approver sent back is corrected and resumed by whoever sent it.
 *
 * Mrs Bello (user 4) sends a credit note for ten damaged reams and Mr Eze
 * returns it asking for the supplier's own credit note number. Her drawer
 * offers Edit and Resume; correcting the number sends it alone. Mr Ade (user 9)
 * sees the note but neither button. While the note is with Mr Eze, nobody sees
 * Edit or Resume.
 *
 * A credit note read that does not name its request cannot tell Mrs Bello she
 * sent it: the drawer then offers neither, and says she resumes it from her
 * approvals.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorCreditNote } from "@/redux/services/procurement/procurement-types";

const mocks = vi.hoisted(() => {
  const state = {
    held: new Set<string>(),
    uid: 4,
    doc: null as unknown,
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
  useReaderBranchLens: () => ({ applies: false }),
  PostingDateField: () => null,
  BankAccountPicker: () => null,
  TaxCodePicker: () => null,
}));
vi.mock("@/redux/services/finance/setup-api", () => mocks.api({}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({ useNoApproverPrompt: () => ({ promptIfParked: () => undefined, noApproverDialog: null }) }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@/redux/services/procurement/procurement-api", () => mocks.api({}));
vi.mock("@/redux/services/procurement/payables-corrections-api", () => mocks.api({
  useGetVendorCreditNoteQuery: () => ({ ...mocks.query(), data: { data: mocks.state.doc } }),
  useUpdateVendorCreditNoteMutation: mocks.mutation((body) => mocks.state.update(body)),
}));
vi.mock("@/redux/services/dashboard/workflow-api", () => mocks.api({
  useGetWorkflowInstanceQuery: (_id: string, options: { skip?: boolean }) => ({ ...mocks.query(), data: options?.skip ? undefined : mocks.state.workflow }),
  useResubmitWorkflowInstanceMutation: mocks.mutation((id) => mocks.state.resume(id)),
}));

import { P } from "../../permissions";
import { CreditNoteDrawer } from "./vendor-credit-notes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE: VendorCreditNote = {
  id: 5, document_number: "VC-0005", status: "DRAFT", approval_state: "PENDING", approval_returned: true,
  branch_id: 1, branch_name: "Ikeja Branch", vendor_id: 1, vendor_code: "V-001", vendor_name: "Ade Stationers",
  vendor_invoice_id: 14, vendor_invoice_number: "VI-0014", note_date: "2026-10-04", vendor_reference: "",
  reason: "10 reams returned damaged", subtotal: 4_500_000, tax_total: 0, total: 4_500_000, allocated_amount: 0,
  advance_remaining: 0, journal_id: null, workflow_instance_id: "wf-5", lines: [], allocations: [],
};
const RETURNED = {
  id: "wf-5", status: "RETURNED", requested_by: 4, audit_logs: [],
  stage_instances: [{ id: "s1", stage_label: "Bursar", status: "RETURNED", attempt: 1, eligible_approvers: [], actions: [
    { id: "a1", action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Add the supplier's credit note number", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null, attempt: 1 },
  ] }],
};

let container: HTMLDivElement;
let root: Root;
const update = vi.fn();
const resume = vi.fn();
const button = (label: string) => [...document.body.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label).pop();
const field = (label: string) => [...document.body.querySelectorAll("label")].find((l) => l.querySelector("span")?.textContent?.replace(" *", "") === label)?.querySelector("input, textarea") as HTMLInputElement;
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
beforeEach(() => {
  mocks.state.held = new Set([P.PROC_UPDATE_VENDOR_CREDIT_NOTE, P.PROC_SUBMIT_VENDOR_CREDIT_NOTE]);
  mocks.state.uid = 4;
  mocks.state.doc = NOTE;
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

const render = () => act(() => root.render(<MemoryRouter><CreditNoteDrawer id={5} entity="BSS" currency="NGN" onClose={() => undefined} /></MemoryRouter>));

describe("a vendor credit note an approver sent back", () => {
  it("offers its sender Edit and Resume, and no Submit", async () => {
    render();
    expect(document.body.textContent).toContain("Sent back by Mr Eze on 2026-10-03: Add the supplier's credit note number");
    expect(button("Submit for approval")).toBeUndefined();
    expect(button("Edit")).toBeDefined();
    await act(async () => { button("Resume")!.click(); });
    expect(resume).toHaveBeenCalledWith("wf-5");
  });

  it("sends the corrected supplier number alone", async () => {
    render();
    act(() => button("Edit")!.click());
    act(() => type(field("Vendor reference"), "ADE-CN-12"));
    await act(async () => { button("Save changes")!.click(); });
    expect(update).toHaveBeenCalledWith({ id: 5, entity: "BSS", vendor_reference: "ADE-CN-12" });
  });

  it("offers neither to a colleague who did not send it", () => {
    mocks.state.uid = 9;
    render();
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });

  it("offers neither when the read does not name its request, and points to the approvals", () => {
    mocks.state.doc = { ...NOTE, workflow_instance_id: undefined };
    render();
    expect(document.body.textContent).toContain("Whoever sent it can resume it from their approvals.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

describe("a vendor credit note with its approver", () => {
  it("offers no Edit or Resume, and says it is with the approver", () => {
    mocks.state.doc = { ...NOTE, approval_returned: false };
    mocks.state.workflow = { ...RETURNED, status: "IN_PROGRESS" };
    render();
    expect(document.body.textContent).toContain("With the approver.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});
