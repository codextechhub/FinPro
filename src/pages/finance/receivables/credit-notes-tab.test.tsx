/**
 * A draft credit note is sent on from its drawer.
 *
 * Mrs Bello's ₦15,000 credit note for Tunde needs approval at its amount. Its
 * request was withdrawn, so it is a draft again: the drawer offers Submit for
 * approval, and submitting sends it to the submit route. Ada's, which an
 * approver sent back, waits in the approvals screen, so it offers no Submit
 * and says where to go. Below the threshold a draft is posted instead.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreditNote } from "@/redux/services/finance/ar-types";

const mocks = vi.hoisted(() => ({ held: new Set<string>(), submit: vi.fn(), post: vi.fn() }));

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
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));
vi.mock("./use-adjustment-gate", () => ({ useAdjustmentGate: () => ({ rule: { kind: "none" }, isLoading: false }) }));
vi.mock("./document-void-action", () => ({ DocumentVoidAction: () => null }));
vi.mock("./income-given-back", () => ({ IncomeGivenBack: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/redux/services/finance/ar-api", () => {
  const call = (spy: (body: unknown) => void) => () => [
    (body: unknown) => { spy(body); return { unwrap: async () => ({ message: "Done.", data: {} }) }; }, { isLoading: false },
  ];
  return {
    useGetCreditNotesQuery: () => ({ data: undefined, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetInvoicesQuery: () => ({ data: undefined }),
    useCreateCreditNoteMutation: call(vi.fn()),
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

  it("offers no Submit when an approver sent it back, and says where to go", () => {
    render(note({ approval_state: "PENDING" }));
    expect(button("Submit for approval")).toBeUndefined();
    expect(document.body.textContent).toContain("An approver sent this back to you.");
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
