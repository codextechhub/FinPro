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
  fieldAccess: {} as Record<string, { hidden?: string[]; read_only?: string[] }>,
  created: vi.fn(), listArgs: vi.fn(), refuse: null as unknown,
  transaction: null as unknown,
  transfer: null as unknown,
  update: vi.fn(), submit: vi.fn(), cancel: vi.fn(),
  updateTransfer: vi.fn(), submitTransfer: vi.fn(), cancelTransfer: vi.fn(),
}));

const ok = (fn: (args: unknown) => void) => (args: unknown) => {
  fn(args);
  return { unwrap: () => (mocks.refuse ? Promise.reject(mocks.refuse) : Promise.resolve({ message: "Done." })) };
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
    fieldAccess: mocks.fieldAccess,
  }),
}));
vi.mock("../../host", async () => (await import("../../host-fake")).fakeHost({
  useReaderReach: () => ({ wholeSchool: false, branchIds: [2], covers: (ids: number[]) => ids.length > 0 && ids.every((id) => id === 2) }),
}));
vi.mock("../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => v, today: () => "2026-10-05" }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderBranchLens: () => ({ applies: true }),
  DetailDrawer: ({ open, title, children, footer }: { open: boolean; title: string; children?: React.ReactNode; footer?: React.ReactNode }) =>
    open ? <section aria-label={title}><h2>{title}</h2>{children}<footer>{footer}</footer></section> : null,
  AccountPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="counter account" value={value} onChange={(e) => onChange(e.target.value)} />,
  BankAccountPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="bank account" value={value} onChange={(e) => onChange(e.target.value)} />,
  MoneyInput: ({ valueKobo, onChangeKobo }: { valueKobo: number; onChangeKobo: (v: number) => void }) => <input aria-label="amount" value={valueKobo} onChange={(e) => onChangeKobo(Number(e.target.value))} />,
  PostingDateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="date" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetBankAccountsQuery: () => ({ data: { data: [{ id: 3, name: "Lekki current", branch_id: 2 }, { id: 4, name: "Lekki savings", branch_id: 2 }] } }),
  useGetFiscalYearsQuery: () => ({ data: { data: [] } }),
}));
vi.mock("@/redux/services/finance/bank-documents-api", () => {
  const list = (key: "transaction" | "transfer") => (args: unknown) => (mocks.listArgs(key, args), {
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
    useCreateBankTransactionMutation: () => [ok(mocks.created), idle],
    useCreateBankTransferMutation: () => [ok(mocks.created), idle],
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
  mocks.fieldAccess = {};
  mocks.refuse = null;
  mocks.created.mockReset();
  mocks.listArgs.mockReset();
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

const TXN = "finance.banktransaction";
const XFER = "finance.banktransfer";
const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
const cells = () => [...container.querySelectorAll("tbody tr:first-child td")];

function show(kind: "transaction" | "transfer" = "transaction") {
  act(() => root.render(
    <MemoryRouter initialEntries={[`/finance/banking?bank_document=${kind}`]}>
      <BankDocumentsSection entity="BSS" currency="NGN" />
    </MemoryRouter>,
  ));
}

describe("Field Access on the bank transaction list", () => {
  it("shows every column when nothing is closed", () => {
    show();
    expect(headers()).toEqual(["Document", "Date", "Bank account", "Branch", "Other side", "Amount", "Status"]);
    expect(cells()).toHaveLength(7);
  });

  it("removes a hidden column with its header, keeping the document number and branch whatever the map lists", () => {
    mocks.fieldAccess = { [TXN]: { hidden: ["document_number", "branch_id", "branch_name", "bank_account_id", "bank_account_name", "counter_account_id", "counter_account_code", "counter_account_name"] } };
    show();
    expect(headers()).toEqual(["Document", "Date", "Branch", "Amount", "Status"]);
    expect(cells()).toHaveLength(5);
    expect(container.textContent).not.toContain("Lekki current");
    expect(container.textContent).not.toContain("Owner's capital");
  });

  it("shows the amount without a direction arrow when the direction is hidden", () => {
    mocks.fieldAccess = { [TXN]: { hidden: ["direction"] } };
    show();
    expect(container.querySelector("tbody svg")).toBeNull();
    expect(container.querySelector("tbody")?.textContent).toContain("5,000,000");
  });

  it("drops the status column, the sent-back filter and the filter it would send when the status is hidden", () => {
    mocks.fieldAccess = { [TXN]: { hidden: ["status", "approval_state", "approval_returned"] } };
    show();
    expect(headers()).not.toContain("Status");
    expect(container.querySelector('select[aria-label="Status"]')).toBeNull();
    for (const call of mocks.listArgs.mock.calls) expect(call[1]).not.toHaveProperty("approval");
  });

  it("offers the sent-back filter when the status is only read-only", () => {
    mocks.fieldAccess = { [TXN]: { read_only: ["status", "approval_state", "approval_returned"] } };
    show();
    expect(container.querySelector('select[aria-label="Status"]')).not.toBeNull();
  });
});

describe("Field Access on the transfer list", () => {
  it("removes hidden columns and keeps the rest aligned", () => {
    mocks.fieldAccess = { [XFER]: { hidden: ["from_account_id", "from_account_name", "amount"] } };
    show("transfer");
    expect(headers()).toEqual(["Document", "Date", "To", "Branch", "Status"]);
    expect(cells()).toHaveLength(5);
    expect(container.textContent).not.toContain("Lekki current");
  });
});

/**
 * A period is a filter on the document's own date, so a role that may not read
 * that date is offered no Year picker and asks for no period, even one a link
 * carries; one that may only read it keeps the picker.
 */
describe("the bank lists' year under Field Access", () => {
  const showYear = (kind: "transaction" | "transfer") => act(() => root.render(
    <MemoryRouter initialEntries={[`/finance/banking?bank_document=${kind}&year=2015`]}>
      <BankDocumentsSection entity="BSS" currency="NGN" />
    </MemoryRouter>,
  ));
  const year = () => container.querySelector('select[aria-label="Year"]');
  const asked = (kind: string) => mocks.listArgs.mock.calls.filter((call) => call[0] === kind).at(-1)?.[1] as Record<string, unknown>;

  it("drops the picker and the period when the transaction date is hidden", () => {
    mocks.fieldAccess = { [TXN]: { hidden: ["transaction_date"] } };
    showYear("transaction");
    expect(year()).toBeNull();
    expect(asked("transaction")).not.toHaveProperty("fiscal_year");
  });

  it("drops the picker and the period when the transfer date is hidden", () => {
    mocks.fieldAccess = { [XFER]: { hidden: ["transfer_date"] } };
    showYear("transfer");
    expect(year()).toBeNull();
    expect(asked("transfer")).not.toHaveProperty("fiscal_year");
  });

  it("keeps the picker and sends the year when the date is only read-only", () => {
    mocks.fieldAccess = { [TXN]: { read_only: ["transaction_date"] } };
    showYear("transaction");
    expect(year()).not.toBeNull();
    expect(asked("transaction")).toMatchObject({ fiscal_year: 2015 });
  });
});

describe("Field Access on a bank document drawer", () => {
  it("leaves out a hidden fact and always names the document number", () => {
    mocks.fieldAccess = { [TXN]: { hidden: ["document_number", "amount", "narration", "counter_account_id", "counter_account_code", "counter_account_name"] } };
    mocks.transaction = (() => {
      const { amount: _a, narration: _r, counter_account_id: _i, counter_account_code: _c, counter_account_name: _o, ...rest } = transaction();
      return rest;
    })();
    open();
    const text = document.body.querySelector('section[aria-label="BT-0005"]')?.textContent ?? "";
    expect(text).not.toContain("Amount");
    expect(text).not.toContain("Narration");
    expect(text).not.toContain("Other side");
    expect(text).toContain("Bank account");
    act(() => { button("Cancel")?.click(); });
    expect(document.body.textContent).toContain("Cancel BT-0005?");
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("offers no Edit when every correctable field is read-only", () => {
    mocks.fieldAccess = { [TXN]: { read_only: ["bank_account", "bank_account_id", "bank_account_name", "direction", "amount", "counter_account", "counter_account_id", "counter_account_code", "counter_account_name", "transaction_date", "narration", "reference"] } };
    open();
    expect(button("Edit")).toBeUndefined();
    expect(button("Send again")).toBeDefined();
  });
});

describe("Field Access on the bank document forms", () => {
  const field = (name: string) => document.body.querySelector(`[data-field="${name}"]`);

  it("offers no new transaction when the amount cannot be written", () => {
    mocks.fieldAccess = { [TXN]: { read_only: ["amount"] } };
    show();
    expect(button("Bank transaction")).toBeUndefined();
    expect(button("Bank transfer")).toBeDefined();
  });

  it("offers no new transfer when the receiving account is hidden", () => {
    mocks.fieldAccess = { [XFER]: { hidden: ["to_account_id", "to_account_name"], read_only: ["to_account", "to_account_id", "to_account_name"] } };
    show();
    expect(button("Bank transfer")).toBeUndefined();
  });

  it("greys a read-only field and never sends it, naming the aliased account by its response name", async () => {
    mocks.fieldAccess = { [TXN]: { read_only: ["reference", "bank_account", "bank_account_id", "bank_account_name"] } };
    open();
    act(() => { button("Edit")?.click(); });
    expect(field("bank_account_name")?.hasAttribute("disabled")).toBe(true);
    expect(field("reference")?.hasAttribute("disabled")).toBe(true);
    expect(field("narration")?.hasAttribute("disabled")).toBe(false);
    setText(drawer("Correct BT-0005")!.querySelector("textarea")!, "Second tranche");
    await act(async () => { button("Save changes")?.click(); });
    expect(mocks.update).toHaveBeenCalledWith({ id: 5, entity: "BSS", narration: "Second tranche" });
  });

  it("locks the account from the record's own read-only list, though it lists no alias", () => {
    mocks.transaction = { ...transaction(), _read_only_fields: ["bank_account_id", "bank_account_name"] };
    open();
    act(() => { button("Edit")?.click(); });
    expect(field("bank_account_name")?.hasAttribute("disabled")).toBe(true);
    expect(field("amount")?.hasAttribute("disabled")).toBe(false);
  });

  it("removes a hidden field from the form and corrects what is left", async () => {
    mocks.fieldAccess = { [TXN]: { hidden: ["reference"] } };
    mocks.transaction = (() => { const { reference: _r, ...rest } = transaction(); return rest; })();
    open();
    act(() => { button("Edit")?.click(); });
    expect(field("reference")).toBeNull();
    setText(drawer("Correct BT-0005")!.querySelector("textarea")!, "Changed");
    await act(async () => { button("Save changes")?.click(); });
    expect(mocks.update).toHaveBeenCalledWith({ id: 5, entity: "BSS", narration: "Changed" });
  });

  it("shows the server's refusal beside the control it names", async () => {
    mocks.refuse = { status: 403, data: { error: { code: "field_write_denied", detail: { narration: ["You may not change this."] } } } };
    open();
    act(() => { button("Edit")?.click(); });
    setText(drawer("Correct BT-0005")!.querySelector("textarea")!, "Changed");
    await act(async () => { button("Save changes")?.click(); });
    expect(field("narration")?.textContent).toContain("You may not change this.");
  });

  it("raises a new transaction without the fields the reader may not write", async () => {
    mocks.fieldAccess = { [TXN]: { read_only: ["reference"] } };
    show();
    act(() => { button("Bank transaction")?.click(); });
    const form = drawer("Bank transaction")!;
    expect(form.querySelector('[data-field="reference"]')?.hasAttribute("disabled")).toBe(true);
    const fill = (label: string, value: string) => setText(form.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement, value);
    fill("bank account", "3");
    fill("amount", "250000");
    fill("counter account", "3000");
    fill("date", "2026-10-02");
    setText(form.querySelector("textarea")!, "Capital");
    await act(async () => { button("Record")?.click(); });
    expect(mocks.created).toHaveBeenCalledWith({
      entity: "BSS", bank_account: 3, direction: "IN", amount: 250000, counter_account: "3000", transaction_date: "2026-10-02", narration: "Capital",
    });
  });
});
