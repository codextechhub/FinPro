/**
 * Mrs Adeyemi keeps Lekki's books. Her N5,000,000 capital receipt BT-0005 came
 * back rejected: she may correct it, send it again or cancel it, because she
 * holds the bank transaction create key and covers Lekki. A draft still with its
 * approvers offers none of the three, nor does Ikeja's rejected draft or one
 * she lacks the key for. A correction sends only what she changed, and a
 * cancellation asks first. Transfers behave the same way under their own key.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  transaction: null as unknown,
  transfer: null as unknown,
  update: vi.fn(), submit: vi.fn(), cancel: vi.fn(),
  updateTransfer: vi.fn(), submitTransfer: vi.fn(), cancelTransfer: vi.fn(),
}));

const ok = (fn: (args: unknown) => void) => (args: unknown) => {
  fn(args);
  return { unwrap: () => Promise.resolve({ message: "Done." }) };
};

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
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: returned.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: false, branchIds: [2], covers: (ids: number[]) => ids.length > 0 && ids.every((id) => id === 2) }),
}));
vi.mock("../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => v, today: () => "2026-10-05" }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderBranchLens: () => ({ applies: true }),
  DetailDrawer: ({ open, title, children, footer }: { open: boolean; title: string; children?: React.ReactNode; footer?: React.ReactNode }) =>
    open ? <section aria-label={title}><h2>{title}</h2>{children}<footer>{footer}</footer></section> : null,
  AccountPicker: () => null,
  BankAccountPicker: () => null,
  MoneyInput: () => null,
  PostingDateField: () => null,
}));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetBankAccountsQuery: () => ({ data: { data: [{ id: 3, name: "Lekki current", branch_id: 2 }, { id: 4, name: "Lekki savings", branch_id: 2 }] } }),
}));
vi.mock("@/redux/services/finance/bank-documents-api", () => {
  const list = (key: "transaction" | "transfer") => () => ({
    data: { data: mocks[key] ? [mocks[key]] : [], pagination: { currentPage: 1, totalPages: 1 } },
    isLoading: false, isFetching: false, isError: false, error: undefined, refetch: vi.fn(),
  });
  const one = (key: "transaction" | "transfer") => () => ({ data: { data: mocks[key] }, isLoading: false, refetch: vi.fn() });
  const idle = { isLoading: false };
  return {
    useGetBankTransactionsQuery: list("transaction"),
    useGetBankTransfersQuery: list("transfer"),
    useGetBankTransactionDocumentQuery: one("transaction"),
    useGetBankTransferDocumentQuery: one("transfer"),
    useCreateBankTransactionMutation: () => [vi.fn(), idle],
    useCreateBankTransferMutation: () => [vi.fn(), idle],
    useVoidBankTransactionMutation: () => [vi.fn(), idle],
    useVoidBankTransferMutation: () => [vi.fn(), idle],
    useUpdateBankTransactionMutation: () => [ok(mocks.update), idle],
    useSubmitBankTransactionMutation: () => [ok(mocks.submit), idle],
    useCancelBankTransactionMutation: () => [ok(mocks.cancel), idle],
    useUpdateBankTransferMutation: () => [ok(mocks.updateTransfer), idle],
    useSubmitBankTransferMutation: () => [ok(mocks.submitTransfer), idle],
    useCancelBankTransferMutation: () => [ok(mocks.cancelTransfer), idle],
  };
});
vi.mock("../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../permissions";
import type { BankTransactionDocument, BankTransferDocument } from "@/redux/services/finance/bank-documents-types";
import { BankDocumentsSection } from "./bank-documents";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const transaction = (over: Partial<BankTransactionDocument> = {}): BankTransactionDocument => ({
  id: 5, document_number: "BT-0005", status: "DRAFT", branch_id: 2, bank_account_id: 3, bank_account_name: "Lekki current",
  direction: "IN", amount: 500_000_000, counter_account_id: 31, counter_account_code: "3000", counter_account_name: "Owner's capital",
  transaction_date: "2026-10-01", narration: "Owner's capital", reference: "", journal_id: null, branch_name: "Lekki",
  approval_state: "REJECTED", ...over,
});
const transfer = (over: Partial<BankTransferDocument> = {}): BankTransferDocument => ({
  id: 8, document_number: "TR-0008", status: "DRAFT", branch_id: 2, from_account_id: 3, from_account_name: "Lekki current",
  to_account_id: 4, to_account_name: "Lekki savings", amount: 200_000_000, transfer_date: "2026-10-01", narration: "To savings",
  reference: "", journal_id: null, branch_name: "Lekki", approval_state: "NOT_SUBMITTED", ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  for (const fn of [mocks.update, mocks.submit, mocks.cancel, mocks.updateTransfer, mocks.submitTransfer, mocks.cancelTransfer]) fn.mockReset();
  mocks.held = new Set([P.FIN_VIEW_BANK_TRANSACTIONS, P.FIN_VIEW_BANK_TRANSFERS, P.FIN_CREATE_BANK_TRANSACTION, P.FIN_CREATE_BANK_TRANSFER]);
  mocks.transaction = transaction();
  mocks.transfer = transfer();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const drawer = (title: string) => document.body.querySelector(`section[aria-label="${title}"]`);

function open(kind: "transaction" | "transfer" = "transaction") {
  act(() => root.render(
    <MemoryRouter initialEntries={[`/finance/banking?bank_document=${kind}`]}>
      <BankDocumentsSection entity="BSS" currency="NGN" />
    </MemoryRouter>,
  ));
  act(() => { (container.querySelector("tbody tr") as HTMLTableRowElement).click(); });
}

const setText = (el: HTMLTextAreaElement | HTMLInputElement, value: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});

describe("a rejected bank transaction", () => {
  it("offers its branch's key holder Edit, Send again and Cancel", () => {
    open();
    expect(drawer("BT-0005")?.textContent).toContain("Correct it and send it again, or cancel it");
    expect(button("Edit")).toBeDefined();
    expect(button("Send again")).toBeDefined();
    expect(button("Cancel")).toBeDefined();
  });

  it("sends it again through the same route", async () => {
    open();
    await act(async () => { button("Send again")?.click(); });
    expect(mocks.submit).toHaveBeenCalledWith({ id: 5, entity: "BSS" });
  });

  it("asks before cancelling, then cancels it", async () => {
    open();
    act(() => { button("Cancel")?.click(); });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cancel BT-0005?");
    await act(async () => { button("Cancel it")?.click(); });
    expect(mocks.cancel).toHaveBeenCalledWith({ id: 5, entity: "BSS" });
  });

  it("is corrected by sending only the fields that changed", async () => {
    open();
    act(() => { button("Edit")?.click(); });
    const form = drawer("Correct BT-0005")!;
    expect(form).not.toBeNull();
    setText(form.querySelector("textarea")!, "Owner's capital, second tranche");
    await act(async () => { button("Save changes")?.click(); });
    expect(mocks.update).toHaveBeenCalledWith({ id: 5, entity: "BSS", narration: "Owner's capital, second tranche" });
  });
});

describe("a bank transaction an approver sent back", () => {
  const RETURNED = {
    id: "wf-5", status: "RETURNED", requested_by: 4,
    stage_instances: [{ actions: [{ action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Wrong date", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null }] }],
  };
  beforeEach(() => {
    returned.uid = 4;
    returned.request = RETURNED;
    returned.resume.mockReset();
    mocks.transaction = transaction({ approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-5" });
  });

  it("offers its sender Edit and Resume, not Send again or Cancel", async () => {
    open();
    expect(drawer("BT-0005")?.textContent).toContain("Sent back by Mr Eze");
    expect(button("Edit")).toBeDefined();
    expect(button("Send again")).toBeUndefined();
    expect(button("Cancel")).toBeUndefined();
    await act(async () => { button("Resume")?.click(); });
    expect(returned.resume).toHaveBeenCalledWith("wf-5");
  });

  it("offers anybody else nothing", () => {
    returned.uid = 9;
    open();
    expect(drawer("BT-0005")?.textContent).toContain("Only the person who sent it can correct it and resume it.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

describe("what is not offered", () => {
  it("nothing while its approvers hold it", () => {
    mocks.transaction = transaction({ status: "PENDING_APPROVAL", approval_state: "PENDING" });
    open();
    expect(button("Edit")).toBeUndefined();
    expect(button("Send again")).toBeUndefined();
  });

  it("nothing for another branch's draft", () => {
    mocks.transaction = transaction({ branch_id: 1, branch_name: "Ikeja" });
    open();
    expect(button("Edit")).toBeUndefined();
    expect(button("Cancel")).toBeUndefined();
  });

  it("nothing to a reader without the create key", () => {
    mocks.held.delete(P.FIN_CREATE_BANK_TRANSACTION);
    open();
    expect(button("Send again")).toBeUndefined();
  });

  it("nothing once it is cancelled", () => {
    mocks.transaction = transaction({ status: "CANCELLED" });
    open();
    expect(button("Edit")).toBeUndefined();
  });
});

describe("a transfer whose request was withdrawn", () => {
  it("is sent again and cancelled under the transfer key", async () => {
    open("transfer");
    await act(async () => { button("Send again")?.click(); });
    expect(mocks.submitTransfer).toHaveBeenCalledWith({ id: 8, entity: "BSS" });
    act(() => { button("Cancel")?.click(); });
    await act(async () => { button("Cancel it")?.click(); });
    expect(mocks.cancelTransfer).toHaveBeenCalledWith({ id: 8, entity: "BSS" });
  });

  it("is not offered to a reader who holds only the transaction key", () => {
    mocks.held.delete(P.FIN_CREATE_BANK_TRANSFER);
    open("transfer");
    expect(button("Send again")).toBeUndefined();
  });
});
