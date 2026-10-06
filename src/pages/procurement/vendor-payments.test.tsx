/**
 * A vendor payment an approver sent back is corrected and resumed by whoever sent it.
 *
 * Mrs Bello (user 4) sends a payment to Ade Stationers and Mr Eze returns it
 * asking for a reference. Her drawer offers Edit and Resume; her correction
 * sends the bills it settles, as every payment edit must, and the reference,
 * with no Save & Submit beside it. Resume posts to the request's resubmit
 * route. Mr Ade (user 9) sees the note but neither button. While the payment is
 * with Mr Eze, nobody sees Edit or Resume.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorPayment } from "@/redux/services/procurement/procurement-types";

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
vi.mock("./pickers", () => ({ VendorPicker: () => null }));
vi.mock("./document-attachments", () => ({ DocumentAttachments: () => null, useDocumentAttachmentRows: () => [] }));
vi.mock("@/redux/services/procurement/procurement-api", () => mocks.api({
  useGetVendorPaymentQuery: () => ({ ...mocks.query(), data: { data: mocks.state.doc } }),
  useUpdateVendorPaymentMutation: mocks.mutation((body) => mocks.state.update(body)),
}));
vi.mock("@/redux/services/dashboard/workflow-api", () => mocks.api({
  useGetWorkflowInstanceQuery: () => ({ ...mocks.query(), data: mocks.state.workflow }),
  useResubmitWorkflowInstanceMutation: mocks.mutation((id) => mocks.state.resume(id)),
}));

import { P } from "../../permissions";
import { PaymentDrawer } from "./vendor-payments";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAYMENT = {
  id: 21, document_number: "VP-0021", status: "DRAFT", approval_state: "PENDING", approval_returned: true, allocation_status: "UNALLOCATED",
  vendor_id: 1, vendor_code: "V-001", vendor_name: "Ade Stationers", payment_date: "2026-10-04", method: "BANK_TRANSFER",
  gross_amount: 9_000_000, wht_amount: 0, net_amount: 9_000_000, allocated_amount: 0, advance_remaining: 0,
  bank_account_id: 2, bank_account_name: "Ikeja operating", payment_code: "1010", payment_account_name: "Bank",
  wht_tax_code_value: null, wht_source: "COMPUTED", reference: "", narration: "", journal_id: null,
  created_at: "2026-10-04T09:00:00Z", created_by_name: "Mrs Bello", workflow_instance_id: "wf-21",
  allocations: [{ id: 1, vendor_invoice_id: 14, invoice_number: "VI-0014", due_date: "2026-11-02", amount: 9_000_000, invoice_balance: 9_000_000 }],
} as unknown as VendorPayment;
const RETURNED = {
  id: "wf-21", status: "RETURNED", requested_by: 4, audit_logs: [],
  stage_instances: [{ id: "s1", stage_label: "Bursar", status: "RETURNED", attempt: 1, eligible_approvers: [], actions: [
    { id: "a1", action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Add the transfer reference", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null, attempt: 1 },
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
  mocks.state.held = new Set([P.PROC_UPDATE_VENDOR_PAYMENT, P.PROC_SUBMIT_VENDOR_PAYMENT]);
  mocks.state.uid = 4;
  mocks.state.doc = PAYMENT;
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

const render = () => act(() => root.render(<MemoryRouter><PaymentDrawer id={21} entity="BSS" currency="NGN" onClose={() => undefined} /></MemoryRouter>));

describe("a vendor payment an approver sent back", () => {
  it("offers its sender Edit and Resume, and no Submit", async () => {
    render();
    expect(document.body.textContent).toContain("Sent back by Mr Eze on 2026-10-03: Add the transfer reference");
    expect(button("Submit for Approval")).toBeUndefined();
    expect(button("Edit")).toBeDefined();
    await act(async () => { button("Resume")!.click(); });
    expect(resume).toHaveBeenCalledWith("wf-21");
  });

  it("sends the bills it settles and the corrected reference, with no Save & Submit", async () => {
    render();
    act(() => button("Edit")!.click());
    expect(button("Save & Submit")).toBeUndefined();
    act(() => type(field("Reference"), "TRF-55102"));
    await act(async () => { button("Save changes")!.click(); });
    expect(update).toHaveBeenCalledWith({
      id: 21, entity: "BSS", reference: "TRF-55102", allocations: [{ vendor_invoice: 14, amount: 9_000_000 }],
    });
  });

  it("offers neither to a colleague who did not send it", () => {
    mocks.state.uid = 9;
    render();
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

describe("a vendor payment with its approver", () => {
  it("offers no Edit or Resume, and says it is with the approver", () => {
    mocks.state.doc = { ...PAYMENT, approval_returned: false };
    mocks.state.workflow = { ...RETURNED, status: "IN_PROGRESS" };
    render();
    expect(document.body.textContent).toContain("With the approver.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});
