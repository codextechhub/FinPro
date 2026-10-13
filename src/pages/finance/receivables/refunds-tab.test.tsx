/**
 * A refund an approver sent back is resumed by whoever sent it, never submitted again.
 *
 * The refunds and write-offs list carries no approval state, so the drawer
 * reads the refund's own detail. Mrs Bello (user 4) sent Tunde's ₦20,000
 * refund and the bursar (user 7) returned it asking for the bank reference.
 * Her drawer reads "Sent back", offers Resume and no Submit for approval.
 * Mr Ade (user 9) is offered neither. A draft never sent keeps Submit.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArAdjustment } from "@/redux/services/finance/ar-types";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(), detail: undefined as unknown, uid: 4, request: undefined as unknown, resume: vi.fn(), availability: undefined as unknown, fieldAccess: {} as Record<string, unknown>, availabilityAsked: [] as unknown[],
}));

vi.mock("@/redux/services/finance/approval-request-api", () => ({
  useGetDocumentApprovalRequestQuery: (_args: unknown, options: { skip?: boolean }) => ({ data: options?.skip ? undefined : { data: mocks.detail } }),
  approvalRequestApi: { util: { invalidateTags: () => ({ type: "test/invalidate" }) } },
}));
vi.mock("@/redux/services/dashboard/workflow-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGetWorkflowInstanceQuery: () => ({ data: mocks.request }),
  useResubmitWorkflowInstanceMutation: () => [(id: string) => { mocks.resume(id); return { unwrap: async () => ({}) }; }, { isLoading: false }],
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: mocks.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));
/** The school writes dates day first: "03/10/2026". */
const dayFirst = (v: string) => String(v).slice(0, 10).split("-").reverse().join("/");
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: dayFirst, today: () => "2026-10-06" }) }));
vi.mock("./use-adjustment-gate", () => ({ useAdjustmentGate: () => ({ rule: { mode: "never", threshold: null } }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingDateField: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" onClick={() => onChange("2026-09-05")}>Pick date</button>,
  CustomerPicker: () => null,
  BankAccountPicker: () => null,
  AccountPicker: () => null,
}));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({ useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }) }));
vi.mock("./document-void-action", () => ({ DocumentVoidAction: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/redux/services/finance/ar-api", () => {
  const mutation = () => [() => ({ unwrap: async () => ({ data: {} }) }), { isLoading: false }];
  const query = () => ({ data: undefined, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
  return {
    useGetArAdjustmentsQuery: query, useGetInvoicesQuery: query, useGetRefundAvailabilityQuery: (_args: unknown, options?: { skip?: boolean }) => (mocks.availabilityAsked.push(options?.skip === true), { data: options?.skip ? undefined : mocks.availability, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useCreateRefundMutation: mutation, usePostRefundMutation: mutation, useSubmitRefundMutation: mutation,
    useCreateWriteOffRequestMutation: mutation, usePostWriteOffRequestMutation: mutation, useSubmitWriteOffRequestMutation: mutation,
  };
});

import { P } from "../../../permissions";
import { AdjustmentDetailDrawer, NewActionDrawer, adjustmentKpiTiles } from "./refunds-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW: ArAdjustment = {
  key: "R12", kind: "REFUND", reference: "RF-0012", date: "2026-10-02", customer_code: "C-001", customer_name: "Tunde Bakare",
  reason: "Customer refund", amount: 2_000_000, amount_naira: "20,000.00", status: "DRAFT", refund_id: 12, approval_required: true,
};
const RETURNED = {
  id: "wf-12", status: "RETURNED", requested_by: 4,
  stage_instances: [{ actions: [{ action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Add the bank reference", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null }] }],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.FIN_SUBMIT_REFUND]);
  mocks.detail = { approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-12" };
  mocks.request = RETURNED;
  mocks.uid = 4;
  mocks.resume.mockReset();
  mocks.fieldAccess = {};
  mocks.availabilityAsked = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<AdjustmentDetailDrawer row={ROW} entity="BSS" currency="NGN" onClose={vi.fn()} />));
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim().endsWith(label));

describe("a refund an approver sent back", () => {
  it("reads Sent back and offers its sender Resume, and no Submit", async () => {
    render();
    expect(document.body.textContent).toContain("Sent back by Mr Eze on 03/10/2026: Add the bank reference");
    expect(button("Submit for approval")).toBeUndefined();
    await act(async () => { button("Resume")!.click(); });
    expect(mocks.resume).toHaveBeenCalledWith("wf-12");
  });

  it("offers anybody else neither", () => {
    mocks.uid = 9;
    render();
    expect(button("Resume")).toBeUndefined();
    expect(button("Submit for approval")).toBeUndefined();
  });

  it("keeps Submit for approval on a draft never sent", () => {
    mocks.detail = { approval_state: "NOT_SUBMITTED", approval_returned: false, workflow_instance_id: null };
    render();
    expect(button("Submit for approval")).toBeDefined();
    expect(document.body.textContent).not.toContain("Sent back");
  });
});

describe("the date a new refund is measured on", () => {
  it("is written in the school's date style when no customer has credit on it", async () => {
    mocks.availability = { data: [], pagination: { currentPage: 1, totalPages: 1 } };
    act(() => root.render(<NewActionDrawer open onClose={vi.fn()} entity="BSS" currency="NGN" />));
    await act(async () => { button("Pick date")!.click(); });
    const text = document.body.textContent ?? "";
    expect(text).toContain("No customer had credit available to refund as at 05/09/2026.");
    expect(text).not.toContain("2026-09-05");
  });
});

describe("the refund picker for a role that may not read customer balances", () => {
  it("is not asked for and says why, rather than reporting that nobody holds credit", async () => {
    mocks.fieldAccess = { "finance.customer": { hidden: ["balance"] } };
    mocks.availability = { data: [], pagination: { currentPage: 1, totalPages: 1 } };
    act(() => root.render(<NewActionDrawer open onClose={vi.fn()} entity="BSS" currency="NGN" />));
    await act(async () => { button("Pick date")!.click(); });
    const text = document.body.textContent ?? "";
    expect(document.body.querySelector("[data-testid=refund-credit-hidden]")).not.toBeNull();
    expect(text).not.toContain("No customer had credit available");
    expect(mocks.availabilityAsked.every((skipped) => skipped === true)).toBe(true);
  });

  it("asks for the list when the balance is readable", async () => {
    mocks.availability = { data: [], pagination: { currentPage: 1, totalPages: 1 } };
    act(() => root.render(<NewActionDrawer open onClose={vi.fn()} entity="BSS" currency="NGN" />));
    await act(async () => { button("Pick date")!.click(); });
    expect(document.body.querySelector("[data-testid=refund-credit-hidden]")).toBeNull();
    expect(mocks.availabilityAsked.at(-1)).toBe(false);
  });
});

describe("the refunds and write-offs figures", () => {
  it("count the tiles the server sent so the row is always full", () => {
    expect(adjustmentKpiTiles(undefined)).toEqual({ showCredit: true, showWrittenOff: true, count: 4 });
    expect(adjustmentKpiTiles({ written_off_ytd: 5, refundable_credit: 9 })).toEqual({ showCredit: true, showWrittenOff: true, count: 4 });
    expect(adjustmentKpiTiles({ written_off_ytd: 5 })).toEqual({ showCredit: false, showWrittenOff: true, count: 3 });
    expect(adjustmentKpiTiles({ written_off_ytd: null, refundable_credit: 9 })).toEqual({ showCredit: true, showWrittenOff: false, count: 3 });
    expect(adjustmentKpiTiles({ written_off_ytd: null, refundable_credit: null })).toEqual({ showCredit: false, showWrittenOff: false, count: 2 });
    expect(adjustmentKpiTiles({ written_off_ytd: 0, refundable_credit: 0 }).count).toBe(4);
  });
});
