/**
 * A purchase order an approver sent back is corrected and resumed by whoever sent it.
 *
 * Mrs Bello (user 4) sends her order for 40 chairs and Mr Eze returns it asking
 * for 30-day terms. Her drawer offers Edit and Resume; correcting the payment
 * terms sends the terms alone, and Resume posts to the request's resubmit
 * route. Mr Ade (user 9) sees the note but neither button. While the order is
 * with Mr Eze, nobody sees Edit or Resume, and the drawer says it is with him.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseOrder } from "@/redux/services/procurement/procurement-types";

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
vi.mock("./pickers", () => ({ VendorPicker: () => null, ContractPicker: () => null, RequisitionPicker: () => null }));
vi.mock("@/redux/services/procurement/procurement-api", () => mocks.api({
  useGetPurchaseOrderQuery: () => ({ ...mocks.query(), data: { data: mocks.state.doc } }),
  useUpdatePurchaseOrderMutation: mocks.mutation((body) => mocks.state.update(body)),
}));
vi.mock("@/redux/services/procurement/payables-corrections-api", () => mocks.api({}));
vi.mock("@/redux/services/dashboard/workflow-api", () => mocks.api({
  useGetWorkflowInstanceQuery: () => ({ ...mocks.query(), data: mocks.state.workflow }),
  useResubmitWorkflowInstanceMutation: mocks.mutation((id) => mocks.state.resume(id)),
}));

import { P } from "../../permissions";
import { PurchaseOrderDrawer } from "./purchase-orders";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PO = {
  id: 3, document_number: "PO-0003", status: "DRAFT", approval_state: "PENDING", approval_returned: true, display_status: "PENDING_APPROVAL",
  vendor_id: 1, vendor_code: "V-001", vendor_name: "Ade Stationers", requisition_id: 9, requisition_number: "REQ-0009",
  contract_id: null, contract_reference: null, quotation_number: null, order_date: "2026-10-02", expected_date: null,
  delivery_address: "Ikeja Branch store", payment_terms: "Cash on delivery", narration: "", subtotal: 0, tax_total: 0, total: 0,
  total_naira: "0.00", received_pct: "0", invoiced_pct: "0", lines: [], receipt_documents: [], invoice_documents: [],
  email_deliveries: [], can_email_vendor: false, workflow_instance_id: "wf-3",
} as PurchaseOrder;
const RETURNED = {
  id: "wf-3", status: "RETURNED", requested_by: 4, audit_logs: [],
  stage_instances: [{ id: "s1", stage_label: "Bursar", status: "RETURNED", attempt: 1, eligible_approvers: [], actions: [
    { id: "a1", action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Ask for 30-day terms", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null, attempt: 1 },
  ] }],
};

let container: HTMLDivElement;
let root: Root;
const update = vi.fn();
const resume = vi.fn();
beforeEach(() => {
  mocks.state.held = new Set([P.PROC_UPDATE_PURCHASE_ORDER, P.PROC_SUBMIT_PURCHASE_ORDER]);
  mocks.state.uid = 4;
  mocks.state.doc = PO;
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

const render = () => act(() => root.render(<MemoryRouter><PurchaseOrderDrawer id={3} entity="BSS" currency="NGN" onClose={() => undefined} /></MemoryRouter>));
const button = (label: string) => [...document.body.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label).pop();
const field = (label: string) => [...document.body.querySelectorAll("label")].find((l) => l.querySelector("span")?.textContent === label)?.querySelector("input, textarea") as HTMLInputElement;
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("a purchase order an approver sent back", () => {
  it("offers its sender Edit and Resume, and no Submit", async () => {
    render();
    expect(document.body.textContent).toContain("Sent back by Mr Eze on 2026-10-03: Ask for 30-day terms");
    expect(button("Submit for Approval")).toBeUndefined();
    expect(button("Edit")).toBeDefined();
    await act(async () => { button("Resume")!.click(); });
    expect(resume).toHaveBeenCalledWith("wf-3");
  });

  it("sends the corrected terms alone", async () => {
    render();
    act(() => button("Edit")!.click());
    act(() => type(field("Payment terms"), "Net 30"));
    await act(async () => { button("Save Changes")!.click(); });
    expect(update).toHaveBeenCalledWith({ id: 3, entity: "BSS", payment_terms: "Net 30" });
  });

  it("offers neither to a colleague who did not send it", () => {
    mocks.state.uid = 9;
    render();
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

describe("a purchase order with its approver", () => {
  it("offers no Edit or Resume, and says it is with the approver", () => {
    mocks.state.doc = { ...PO, approval_returned: false };
    mocks.state.workflow = { ...RETURNED, status: "IN_PROGRESS" };
    render();
    expect(document.body.textContent).toContain("With the approver.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});
