/**
 * The returns list and Void, at Bright Star (Ikeja and Lekki).
 *
 * Under All branches each return names its fund and branch; with Lekki picked
 * the server is asked for Lekki's returns only and the branch column goes.
 * Opening a return shows the count against the books, where the cash went and
 * who counted and raised it, by the names the server sent. Void is offered only to
 * a holder of `finance.pettycash.reverse`; an older return while a later one of
 * the same fund stands is not sent, and says which return to void first.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  list: vi.fn(),
  voidReturn: vi.fn(),
  denied: new Set<string>(),
  fieldAccess: {} as Record<string, { hidden?: string[]; read_only?: string[] }>,
  toast: { success: vi.fn(), error: vi.fn() },
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
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: returned.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetPettyCashReturnsQuery: (...args: unknown[]) => {
    mocks.list(...args);
    return { data: { data: mocks.rows, pagination: { totalItems: mocks.rows.length } }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useGetPettyCashReturnQuery: () => ({ data: undefined }),
  useVoidPettyCashReturnMutation: () => [mocks.voidReturn, { isLoading: false }],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import type { PettyCashFund, PettyCashReturn } from "@/redux/services/finance/ops-types";
import { P } from "../../../permissions";
import { pettyCashBranchFor } from "./petty-cash-branch";
import { PettyCashReturnsList } from "./petty-cash-returns-list";
import { PETTY_CASH_RETURN } from "./petty-cash-returns";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NAIRA = 100;
const LENS = { applies: true, pinnedBranch: null, branch: "all" as const, choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false };
const fund = (id: number, branch_id: number, over: Partial<PettyCashFund> = {}): PettyCashFund => ({
  id, branch_id, name: id === 1 ? "Ikeja front desk" : "Lekki float", gl_account: "1150", gl_account_id: id, custodian_id: null,
  custodian_name: "", custodian_label: "", float_amount: 60_000 * NAIRA, float_amount_naira: "", current_balance: 0,
  current_balance_naira: "", shortfall: 0, currency: "NGN", last_replenished_at: null, is_active: true, state: "ACTIVE", ...over,
});
const ret = (over: Partial<PettyCashReturn>): PettyCashReturn => ({
  id: 10, document_number: "PCR-0010", status: "POSTED", kind: "REDUCE", kind_label: "Reduce the float",
  branch_id: 1, fund_id: 1, fund_name: "Ikeja front desk", bank_account_id: 3, bank_account_name: "Ikeja GTBank",
  return_date: "2026-10-01", counted_amount: 98_500 * NAIRA, book_balance: 100_000 * NAIRA, difference: -1_500 * NAIRA,
  shortage: 1_500 * NAIRA, overage: 0, difference_reason: "coins missing", amount: 38_500 * NAIRA, amount_naira: "",
  cash_left: 60_000 * NAIRA, previous_float_amount: 100_000 * NAIRA, new_float_amount: 60_000 * NAIRA,
  counted_by_id: 7, narration: "", reference: "", journal_id: 5, created_by_id: 7,
  branch_name: "Ikeja", counted_by_name: "Mrs Eze", created_by_name: "Mrs Bello", ...over,
});

const FUNDS = [fund(1, 1), fund(2, 2, { state: "CLOSED", is_active: false, float_amount: 0 })];
const IKEJA_REDUCE = ret({});
const LEKKI_CLOSE = ret({
  id: 11, document_number: "PCR-0011", kind: "CLOSE", kind_label: "Close the fund", branch_id: 2, branch_name: "Lekki", fund_id: 2,
  fund_name: "Lekki float", shortage: 0, difference: 0, amount: 20_000 * NAIRA, new_float_amount: 0, difference_reason: "",
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.rows = [LEKKI_CLOSE, IKEJA_REDUCE];
  mocks.denied = new Set();
  mocks.fieldAccess = {};
  mocks.list.mockReset();
  mocks.voidReturn.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Petty cash return PCR-0011 voided." }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const tableRows = () => [...container.querySelectorAll("tbody tr")];
const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent);
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim().includes(text));

describe("petty cash returns", () => {
  it("lists every return and closure with its fund, branch, amount, difference and status", () => {
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    expect(headers()).toEqual(["Return no.", "Fund", "Branch", "Kind", "Date", "Banked", "Difference", "Status"]);
    expect(tableRows()).toHaveLength(2);
    const ikeja = tableRows()[1].textContent ?? "";
    expect(ikeja).toContain("PCR-0010");
    expect(ikeja).toContain("Ikeja");
    expect(ikeja).toContain("Float reduced");
    expect(ikeja).toContain("₦38,500.00");
    expect(ikeja).toContain("₦1,500.00 short");
    expect(tableRows()[0].textContent).toContain("Fund closed");
    expect(mocks.list).toHaveBeenCalledWith({ entity: "BSS", page_size: 100 });
  });

  it("asks the server for the picked branch's returns, without a branch column", () => {
    mocks.rows = [LEKKI_CLOSE];
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, "2")} />));
    expect(mocks.list).toHaveBeenCalledWith({ entity: "BSS", page_size: 100, branch: 2 });
    expect(headers()).not.toContain("Branch");
    expect(tableRows().map((r) => r.querySelector("td")?.textContent)).toEqual(["PCR-0011"]);
  });

  it("names a branch and the people as the server sent them, marking who has left", () => {
    mocks.rows = [ret({ branch_id: 3, branch_name: "Victoria Island", counted_by_is_exited: true })];
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    expect(tableRows()[0].textContent).toContain("Victoria Island");
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(document.body.textContent).toContain("Counted byMrs Eze (left)");
    expect(document.body.textContent).toContain("Raised byMrs Bello");
  });

  it("voids a closure, which reopens the fund", async () => {
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(document.body.textContent).toContain("Raised byMrs Bello");
    act(() => button("Void")!.click());
    expect(document.body.textContent).toContain("the fund reopens");
    await act(async () => button("Void return")!.click());
    expect(mocks.voidReturn).toHaveBeenCalledWith({ id: 11, entity: "BSS" });
    expect(mocks.toast.success).toHaveBeenCalledWith("Petty cash return PCR-0011 voided.");
  });

  it("does not send a void the server would refuse for a later return", () => {
    mocks.rows = [ret({ id: 12, document_number: "PCR-0012" }), IKEJA_REDUCE];
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    act(() => (tableRows()[1] as HTMLElement).click());
    act(() => button("Void")!.click());
    expect(document.body.querySelector("[role=alert]")?.textContent).toBe("Return PCR-0012 of this fund came after PCR-0010. Void it first.");
    expect(button("Void return")!.disabled).toBe(true);
  });

  it("reads Sent back on a return an approver sent back, offers its sender Resume, and no Cancel return", async () => {
    returned.uid = 4;
    returned.request = { id: "wf-10", status: "RETURNED", requested_by: 4, stage_instances: [] };
    mocks.rows = [{ ...IKEJA_REDUCE, status: "DRAFT", approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-10" }];
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    expect(tableRows()[0].textContent).toContain("Sent back");
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(button("Cancel return")).toBeUndefined();
    expect(document.body.textContent).toContain("Withdrawing it from your approvals cancels it");
    await act(async () => button("Resume")!.click());
    expect(returned.resume).toHaveBeenCalledWith("wf-10");
  });

  it("asks for what was sent back when the Status filter says Sent back", () => {
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    const select = container.querySelector('select[aria-label="Status"]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["All statuses", "Sent back"]);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "SENT_BACK");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.list).toHaveBeenLastCalledWith({ entity: "BSS", page_size: 100, approval: "returned" });
  });

  it("keeps Draft and Cancel return on a draft no approver holds", () => {
    mocks.rows = [{ ...IKEJA_REDUCE, status: "DRAFT", approval_state: "REJECTED", approval_returned: false }];
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    expect(tableRows()[0].textContent).toContain("Draft");
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(button("Cancel return")).toBeDefined();
  });

  it("offers no Void without the reverse key", () => {
    mocks.denied = new Set([P.FIN_REVERSE_PETTY_CASH]);
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(button("Void")).toBeUndefined();
  });
});

/**
 * Field Access on the returns list and its detail, told as a reader whose role
 * may not see some fields of a return. The server leaves a hidden field out of
 * every row, so the rows below omit it too.
 */
describe("Field Access on petty cash returns", () => {
  const restrict = (hidden: string[]) => { mocks.fieldAccess = { [PETTY_CASH_RETURN]: { hidden } }; };
  const omit = (row: PettyCashReturn, ...keys: string[]) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k))) as unknown as PettyCashReturn;
  const render = (view = pettyCashBranchFor(LENS, null)) => act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={view} />));
  const cellCounts = () => tableRows().map((r) => r.querySelectorAll("td").length);

  it("drops a hidden column with its header, row by row", () => {
    restrict(["amount", "amount_naira", "difference", "shortage", "overage", "kind", "kind_label"]);
    mocks.rows = [omit(LEKKI_CLOSE, "amount", "amount_naira", "difference", "shortage", "overage", "kind", "kind_label"), omit(IKEJA_REDUCE, "amount", "amount_naira", "difference", "shortage", "overage", "kind", "kind_label")];
    render();
    expect(headers()).toEqual(["Return no.", "Fund", "Branch", "Date", "Status"]);
    expect(cellCounts()).toEqual([5, 5]);
    expect(container.textContent).not.toContain("₦38,500.00");
    expect(container.textContent).not.toContain("short");
  });

  it("keeps header and cell counts equal for every combination of one hidden field", () => {
    for (const hidden of ["return_date", "status"]) {
      restrict([hidden]);
      render();
      expect(cellCounts()).toEqual(tableRows().map(() => headers().length));
      act(() => root.render(<div />));
    }
  });

  it("always shows the Fund column and filter, and sends the fund picked, however the map is restricted", () => {
    restrict(["fund_id", "fund_name", "kind", "kind_label", "return_date", "amount", "status"]);
    render();
    expect(headers()).toContain("Fund");
    const select = container.querySelector('select[aria-label="Fund"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "2");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.list).toHaveBeenLastCalledWith({ entity: "BSS", page_size: 100, fund: 2 });
  });

  it("removes the Status filter, the Status column and the sent-back request when the status is hidden", () => {
    restrict(["status", "approval_state", "approval_returned"]);
    render();
    expect(container.querySelector('select[aria-label="Status"]')).toBeNull();
    expect(headers()).not.toContain("Status");
    for (const call of mocks.list.mock.calls) {
      expect(call[0]).not.toHaveProperty("status");
      expect(call[0]).not.toHaveProperty("approval");
    }
  });

  it("shows the number and the branch, and asks for the picked branch, whatever the map lists", () => {
    restrict(["document_number", "branch_id", "branch_name"]);
    render();
    expect(headers()).toEqual(expect.arrayContaining(["Return no.", "Branch"]));
    act(() => root.render(<div />));
    render(pettyCashBranchFor(LENS, "2"));
    expect(mocks.list).toHaveBeenLastCalledWith({ entity: "BSS", page_size: 100, branch: 2 });
  });

  it("keeps the filters and the branch request for a reader who can read them", () => {
    mocks.fieldAccess = { [PETTY_CASH_RETURN]: { read_only: ["reference"] } };
    render(pettyCashBranchFor(LENS, "2"));
    expect(mocks.list).toHaveBeenLastCalledWith({ entity: "BSS", page_size: 100, branch: 2 });
    expect(container.querySelector('select[aria-label="Fund"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Status"]')).not.toBeNull();
  });

  it("leaves out the detail rows, and the sentences, of hidden fields", () => {
    const hidden = ["book_balance", "difference", "shortage", "overage", "previous_float_amount", "counted_by_id", "counted_by_name", "counted_by_is_exited"];
    restrict(hidden);
    mocks.rows = [omit(IKEJA_REDUCE, ...hidden)];
    render();
    act(() => (tableRows()[0] as HTMLElement).click());
    const text = document.body.textContent ?? "";
    for (const gone of ["Books said", "Difference", "Counted by", "Float before", "₦1,000.00"]) expect(text).not.toContain(gone);
    expect(text).toContain("Float after");
    expect(text).toContain("Raised byMrs Bello");
    expect(text).toContain("Banked");
  });

  it("leaves only the fund and the branch in the detail section when every other field is hidden", () => {
    const hidden = ["kind", "kind_label", "return_date", "counted_amount", "book_balance", "difference", "shortage", "overage",
      "difference_reason", "amount", "amount_naira", "bank_account_id", "bank_account_name", "cash_left", "previous_float_amount", "new_float_amount",
      "counted_by_id", "counted_by_name", "counted_by_is_exited", "created_by_id", "created_by_name", "created_by_is_exited", "reference", "narration"];
    restrict(hidden);
    mocks.rows = [omit(IKEJA_REDUCE, ...hidden)];
    render();
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(document.body.querySelector("dl")?.textContent).toBe("FundIkeja front deskBranchIkeja");
  });

  it("offers Void by neutral words, naming the number, when the kind and status are hidden", async () => {
    const hidden = ["kind", "kind_label", "status", "approval_state", "approval_returned"];
    restrict(["document_number", ...hidden]);
    mocks.rows = [omit(LEKKI_CLOSE, ...hidden)];
    render();
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(document.body.textContent).toContain("PCR-0011");
    act(() => button("Void")!.click());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Void PCR-0011?");
    expect(text).toContain("A return that reached the books is reversed; one that never did is cancelled.");
    expect(text).not.toContain("the fund reopens");
    await act(async () => button("Void return")!.click());
    expect(mocks.voidReturn).toHaveBeenCalledWith({ id: 11, entity: "BSS" });
  });

  it("does not describe a closure in the void dialog when only the kind is hidden", () => {
    restrict(["kind", "kind_label"]);
    mocks.rows = [omit(LEKKI_CLOSE, "kind", "kind_label")];
    render();
    act(() => (tableRows()[0] as HTMLElement).click());
    act(() => button("Void")!.click());
    expect(document.body.textContent).toContain("Void PCR-0011?");
    expect(document.body.textContent).toContain("a fund it closed reopens");
    expect(document.body.textContent).not.toContain("Reverses the closure");
  });

  it("names a later return by its number whatever the map lists", () => {
    restrict(["document_number"]);
    mocks.rows = [ret({ id: 12, document_number: "PCR-0012" }), IKEJA_REDUCE];
    render();
    act(() => (tableRows()[1] as HTMLElement).click());
    act(() => button("Void")!.click());
    expect(document.body.querySelector("[role=alert]")?.textContent).toBe("Return PCR-0012 of this fund came after PCR-0010. Void it first.");
  });
});
