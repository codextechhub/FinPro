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
  createRefund: vi.fn(), postRefund: vi.fn(), tie: vi.fn(),
  defaultAccount: null as unknown, listAsked: [] as boolean[],
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
  AccountPicker: ({ placeholder }: { placeholder?: string }) => <input aria-label="expense account" placeholder={placeholder} readOnly />,
}));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({ useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }) }));
vi.mock("./document-void-action", () => ({ DocumentVoidAction: () => null }));
// The online side of a refund has its own test (provider-refund-panel.test.tsx); here a button stands in for choosing it.
vi.mock("./provider-refund-panel", () => ({
  OnlineRefundFields: ({ onChange }: { onChange: (v: { online: boolean; collection: string; payment: null }) => void }) => (
    <button type="button" onClick={() => onChange({ online: true, collection: "5", payment: null })}>Choose online</button>
  ),
  ProviderRefundChip: () => null,
  ProviderRefundPanel: () => null,
  useProviderRefundMap: () => new Map(),
  useTieRefund: () => mocks.tie,
}));
vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: ({ options, value, onChange }: { options: { value: string; label: string }[]; value?: string; onChange?: React.ChangeEventHandler<HTMLSelectElement> }) => (
    <select aria-label="customer" value={value ?? ""} onChange={onChange}>
      <option value="">-</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/redux/services/finance/ar-api", () => {
  const mutation = () => [() => ({ unwrap: async () => ({ data: {} }) }), { isLoading: false }];
  const query = () => ({ data: undefined, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
  return {
    useGetWriteOffRequestsQuery: (_args: unknown, options?: { skip?: boolean }) => (
      mocks.listAsked.push(options?.skip === true),
      { data: options?.skip ? undefined : { data: [], default_write_off_account: mocks.defaultAccount } }
    ),
    useGetArAdjustmentsQuery: query, useGetInvoicesQuery: query, useGetRefundAvailabilityQuery: (_args: unknown, options?: { skip?: boolean }) => (mocks.availabilityAsked.push(options?.skip === true), { data: options?.skip ? undefined : mocks.availability, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useCreateRefundMutation: () => [mocks.createRefund, { isLoading: false }], usePostRefundMutation: () => [mocks.postRefund, { isLoading: false }], useSubmitRefundMutation: mutation,
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
  mocks.defaultAccount = { id: 9, code: "5350", name: "Bad debts" };
  mocks.listAsked = [];
  mocks.createRefund.mockReset();
  mocks.createRefund.mockReturnValue({ unwrap: async () => ({ data: { id: 21, approval_required: false } }) });
  mocks.postRefund.mockReset();
  mocks.postRefund.mockReturnValue({ unwrap: async () => ({ message: "Refund processed." }) });
  mocks.tie.mockReset();
  mocks.tie.mockResolvedValue(true);
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

describe("a refund returned through the payment provider", () => {
  const CREDIT = { customer_id: 1, customer_code: "C-001", customer_name: "Adeyemi", branch_id: 2, branch_name: "Lekki", refundable_credit: 10_000_000, refundable_credit_naira: "100,000.00" };

  /** Fills the form as Mrs Bello would: a date, Mrs Adeyemi's credit at Lekki, and the online way of paying. */
  const fillForm = async () => {
    mocks.availability = { data: [CREDIT], pagination: { currentPage: 1, totalPages: 1 } };
    act(() => root.render(<NewActionDrawer open onClose={vi.fn()} entity="BSS" currency="NGN" />));
    await act(async () => { button("Pick date")!.click(); });
    const select = document.body.querySelector("select[aria-label=customer]") as HTMLSelectElement;
    await act(async () => { select.value = "C-001::2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  };

  it("is raised as an online refund with no bank account, tied to its payment, then posted", async () => {
    await fillForm();
    await act(async () => { button("Choose online")!.click(); });
    await act(async () => { button("Process refund")!.click(); });
    expect(mocks.createRefund).toHaveBeenCalledTimes(1);
    const body = mocks.createRefund.mock.calls[0][0];
    expect(body).toMatchObject({ entity: "BSS", customer: "C-001", branch: 2, method: "ONLINE", amount: 10_000_000 });
    expect(body.bank_account).toBeUndefined();
    expect(mocks.tie).toHaveBeenCalledWith(21, "5");
    expect(mocks.postRefund).toHaveBeenCalledTimes(1);
    expect(mocks.tie.mock.invocationCallOrder[0]).toBeLessThan(mocks.postRefund.mock.invocationCallOrder[0]);
  });

  it("stays a draft when the payment cannot be tied, and says so", async () => {
    mocks.tie.mockResolvedValue(false);
    await fillForm();
    await act(async () => { button("Choose online")!.click(); });
    await act(async () => { button("Process refund")!.click(); });
    expect(mocks.createRefund).toHaveBeenCalledTimes(1);
    expect(mocks.postRefund).not.toHaveBeenCalled();
  });

  it("is a bank refund while the online choice is not made", async () => {
    await fillForm();
    expect(button("Process refund")!.disabled).toBe(true);
  });
});

describe("the account a write-off defaults to", () => {
  const openWriteOff = async () => {
    mocks.availability = { data: [], pagination: { currentPage: 1, totalPages: 1 } };
    act(() => root.render(<NewActionDrawer open onClose={vi.fn()} entity="BSS" currency="NGN" />));
    await act(async () => { button("Write off to expense")!.click(); });
  };
  const hint = () => document.body.querySelector<HTMLInputElement>("input[aria-label='expense account']")?.placeholder;

  it("is named from the account the write-offs list sends, not from a code in the screen", async () => {
    mocks.held = new Set([P.FIN_CREATE_WRITE_OFF]);
    await openWriteOff();
    expect(hint()).toBe("Defaults to Bad debts (5350)");
    expect(document.body.textContent).not.toContain("5300");
  });

  it("follows the account the school has pointed its bad debts at", async () => {
    mocks.held = new Set([P.FIN_CREATE_WRITE_OFF]);
    mocks.defaultAccount = { id: 12, code: "5361", name: "Impairment of fees" };
    await openWriteOff();
    expect(hint()).toBe("Defaults to Impairment of fees (5361)");
  });

  it("is worded without a code when the school has no usable bad debts account", async () => {
    mocks.held = new Set([P.FIN_CREATE_WRITE_OFF]);
    mocks.defaultAccount = null;
    await openWriteOff();
    expect(hint()).toBe("Defaults to the school's bad debts account");
  });

  it("is worded without a code, and the list not asked for, when the reader holds only the key to write off an invoice", async () => {
    mocks.held = new Set([P.FIN_WRITE_OFF_INVOICE]);
    await openWriteOff();
    expect(hint()).toBe("Defaults to the school's bad debts account");
    expect(mocks.listAsked.every((skipped) => skipped)).toBe(true);
    expect(document.body.textContent).not.toMatch(/\b5[0-9]{3}\b/);
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
