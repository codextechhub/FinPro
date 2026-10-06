/**
 * A draft credit note is sent on from its drawer.
 *
 * Mrs Bello's ₦15,000 credit note for Tunde needs approval at its amount. Its
 * request was withdrawn, so it is a draft again: the drawer offers Submit for
 * approval, and submitting sends it to the submit route. Below the threshold
 * a draft is posted instead.
 *
 * Ada's, which the bursar (user 7) sent back to Mrs Bello (user 4) asking for
 * the right amount, offers no Submit. Mrs Bello sees Edit and Resume; her
 * correction of the amount sends the note's line again and nothing else.
 * Mr Ade (user 9) sees who sent it back, and neither button. Where the read
 * does not name the request, nobody is offered either, and the note says the
 * sender resumes it from their approvals.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreditNote } from "@/redux/services/finance/ar-types";

const mocks = vi.hoisted(() => ({ held: new Set<string>(), submit: vi.fn(), post: vi.fn(), update: vi.fn() }));

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
vi.mock("./use-adjustment-gate", () => ({ useAdjustmentGate: () => ({ rule: { kind: "none" }, isLoading: false }) }));
vi.mock("./document-void-action", () => ({ DocumentVoidAction: () => null }));
vi.mock("./income-given-back", () => ({ IncomeGivenBack: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingDateField: () => null,
  AccountPicker: () => null,
  CostCenterPicker: () => null,
  MoneyInput: ({ valueKobo, onChangeKobo }: { valueKobo: number; onChangeKobo: (v: number) => void }) => (
    <input aria-label="Amount in kobo" value={valueKobo} onChange={(e) => onChangeKobo(Number(e.target.value))} />
  ),
}));
vi.mock("@/redux/services/finance/ar-api", () => {
  const call = (spy: (body: unknown) => void) => () => [
    (body: unknown) => { spy(body); return { unwrap: async () => ({ message: "Done.", data: {} }) }; }, { isLoading: false },
  ];
  return {
    useGetCreditNotesQuery: () => ({ data: undefined, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetInvoicesQuery: () => ({ data: undefined }),
    useCreateCreditNoteMutation: call(vi.fn()),
    useUpdateCreditNoteMutation: call((body) => mocks.update(body)),
    useAllocateCreditNoteMutation: call(vi.fn()),
    useSubmitCreditNoteMutation: call((body) => mocks.submit(body)),
    usePostCreditNoteMutation: call((body) => mocks.post(body)),
  };
});

import { P } from "../../../permissions";
import { NoteDetailDrawer } from "./credit-notes-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const note = (over: Partial<CreditNote> & { approval_state?: string }): CreditNote => ({
  id: 7, document_number: "CN-0007", kind: "CREDIT", customer_id: 1, customer_code: "C-001", customer_name: "Tunde Bakare",
  invoice_id: 41, invoice_number: "INV-0041", note_date: "2026-10-01", status: "DRAFT", subtotal: 1_500_000, tax_total: 0,
  total: 1_500_000, total_naira: "15,000.00", allocated_amount: 0, unallocated_amount: 0, reason: "Overbilled",
  reference: "", approval_required: true, lines: [], ...over,
} as CreditNote);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.FIN_SUBMIT_CREDIT_NOTE, P.FIN_POST_CREDIT_NOTE]);
  mocks.submit.mockReset();
  mocks.post.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const button = (label: string) => [...document.body.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label).pop();
const render = (n: CreditNote) => act(() => root.render(<NoteDetailDrawer note={n} entity="BSS" currency="NGN" onClose={vi.fn()} />));

describe("a draft credit note", () => {
  it("offers Submit for approval once its request was withdrawn, and submits it", async () => {
    render(note({ approval_state: "NOT_SUBMITTED" }));
    act(() => button("Submit for approval")!.click());
    await act(async () => { button("Submit")!.click(); });
    expect(mocks.submit).toHaveBeenCalledWith({ id: 7, entity: "BSS" });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("offers no Submit when an approver sent it back, and without its request says where to resume it", () => {
    render(note({ approval_state: "PENDING" }));
    expect(button("Submit for approval")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
    expect(document.body.textContent).toContain("Whoever sent it can resume it from their approvals.");
  });

  it("is posted instead below the approval threshold", async () => {
    render(note({ approval_required: false }));
    act(() => button("Post note")!.click());
    await act(async () => { button("Post")!.click(); });
    expect(mocks.post).toHaveBeenCalledWith({ id: 7, entity: "BSS" });
  });

  it("offers nothing to a reader without the submit key, and says why", () => {
    mocks.held = new Set();
    render(note({}));
    expect(button("Submit for approval")).toBeUndefined();
    expect(document.body.textContent).toContain("Your role can't submit credit notes.");
  });

  it("offers neither on a posted note", () => {
    render(note({ status: "POSTED" }));
    expect(button("Submit for approval")).toBeUndefined();
    expect(button("Post note")).toBeUndefined();
  });
});

const RETURNED_REQUEST = {
  id: "wf-7", status: "RETURNED", requested_by: 4,
  stage_instances: [{ actions: [{ action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "It should be N12,000", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null }] }],
};
const sentBack = () => note({
  approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-7",
  lines: [{ id: 1, line_no: 1, description: "Overbilled", revenue_account: "4000", quantity: "1.0000", unit_price: 1_500_000, tax_code: null, net_amount: 1_500_000, tax_amount: 0, cost_center: null }],
});

describe("a credit note an approver sent back", () => {
  beforeEach(() => {
    mocks.held = new Set([P.FIN_SUBMIT_CREDIT_NOTE, P.FIN_CREATE_CREDIT_NOTE]);
    mocks.update.mockReset();
    returned.resume.mockReset();
    returned.uid = 4;
    returned.request = RETURNED_REQUEST;
  });

  it("offers its sender Edit and Resume, and says who sent it back and why", async () => {
    render(sentBack());
    expect(document.body.textContent).toContain("Sent back by Mr Eze on");
    expect(document.body.textContent).toContain("It should be N12,000");
    expect(button("Submit for approval")).toBeUndefined();
    await act(async () => { button("Resume")!.click(); });
    expect(returned.resume).toHaveBeenCalledWith("wf-7");
  });

  it("sends a corrected amount as the note's line, and nothing else", async () => {
    render(sentBack());
    act(() => button("Edit")!.click());
    const amount = document.body.querySelector('input[aria-label="Amount in kobo"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(amount, "1200000");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Save changes")!.click(); });
    expect(mocks.update).toHaveBeenCalledWith({
      id: 7, entity: "BSS",
      lines: [{ revenue_account: "4000", description: "Overbilled", quantity: 1, unit_price: 1_200_000 }],
    });
  });

  it("offers neither to a colleague who did not send it", () => {
    returned.uid = 9;
    render(sentBack());
    expect(document.body.textContent).toContain("Only the person who sent it can correct it and resume it.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});
