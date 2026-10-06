/**
 * A credit transfer reads with one word per state wherever it appears.
 *
 * Mr Okafor's transfer of Tunde's credit to Ada waits for a second person, and
 * an earlier one was voided. The status filter, the row pill and the drawer all
 * say "Awaiting approval" for the first and "Voided" for the second, so a
 * bursar who filters on a word finds rows wearing that same word.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerCreditTransfer } from "@/redux/services/finance/fees-types";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
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
    hasPermission: () => false,
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
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
  hostBranchLens: undefined,
}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetRefundAvailabilityQuery: () => ({ data: undefined }),
  useGetCustomersQuery: () => ({ data: undefined }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CustomerPicker: () => <div>customer-picker</div>,
  PostingDateField: () => <div>posting-date</div>,
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetCreditTransfersQuery: () => ({ data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useCreateCreditTransferMutation: mocks.mutation,
  useSubmitCreditTransferMutation: mocks.mutation,
  useVoidCreditTransferMutation: mocks.mutation,
}));

import { CREDIT_TRANSFER_STATUS, CreditTransfersTab } from "./credit-transfers-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const transfer = (id: number, status: string): CustomerCreditTransfer => ({
  id, document_number: `CCT-000${id}`, status, branch_id: 1,
  from_customer_id: 1, from_customer_code: "C-001", from_customer_name: "Tunde Okafor",
  to_customer_id: 2, to_customer_code: "C-002", to_customer_name: "Ada Okafor",
  transfer_date: "2026-10-01", amount: 1_500_000, amount_naira: "15,000.00", reason: "Sibling fees",
  receipt_id: null, receipt_number: null,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("credit transfer states", () => {
  it("names each state with the same word in the filter, the row and the drawer", () => {
    mocks.rows = [transfer(1, "PENDING_APPROVAL"), transfer(2, "REVERSED")];
    act(() => root.render(<MemoryRouter><CreditTransfersTab entity="BSS" currency="NGN" /></MemoryRouter>));

    const options = [...container.querySelectorAll('select[aria-label="Status"] option')].map((o) => o.textContent);
    expect(options).toEqual(["All statuses", "Draft", "Awaiting approval", "Posted", "Voided"]);

    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows.find((t) => t.includes("CCT-0001"))).toContain("Awaiting approval");
    expect(rows.find((t) => t.includes("CCT-0002"))).toContain("Voided");
    expect(container.textContent).not.toContain("Pending Approval");
    expect(container.textContent).not.toContain("Reversed");

    act(() => (container.querySelector("tbody tr") as HTMLElement).click());
    expect(document.body.textContent).toContain("Awaiting approval");
    expect(document.body.textContent).not.toContain("Pending Approval");
  });

  it("has a word for every state the backend gives a transfer", () => {
    expect(Object.keys(CREDIT_TRANSFER_STATUS).sort()).toEqual(["APPROVED", "DRAFT", "PENDING_APPROVAL", "POSTED", "REVERSED"]);
  });
});
