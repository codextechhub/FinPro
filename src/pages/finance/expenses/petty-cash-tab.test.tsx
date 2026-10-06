/**
 * The petty cash workbench.
 *
 * A running fund offers Replenish, Reduce float, New voucher and Close fund to
 * the holders of those keys. A closed fund says when and by whom it was closed
 * and offers only Reopen (and a name or custodian edit). A draft voucher may be
 * cancelled by whoever may raise vouchers. The register tones the categories a
 * return writes. Close fund is told which draft voucher holds it up.
 *
 * Branches: Harbour Primary runs one, so no branch picker shows; Bright Star runs
 * Ikeja and Lekki, so Mrs Bello picks All branches or one, and under All
 * branches each fund names its branch.
 *
 * A journal's link to a return (`?document=<id>`) opens that return over the
 * page.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  funds: [] as unknown[],
  detail: null as unknown,
  vouchers: [] as unknown[],
  returns: [] as unknown[],
  linked: null as unknown,
  cancel: vi.fn(),
  denied: new Set<string>(),
  lens: {
    applies: false,
    pinnedBranch: null as number | null,
    branch: "all" as number | "all",
    choices: [{ id: 1, name: "Main" }] as { id: number; name: string }[],
    isLoading: false,
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { idle } = vi.hoisted(() => ({ idle: () => [vi.fn(), { isLoading: false }] }));
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
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetPettyCashFundsQuery: () => ({ data: { data: mocks.funds }, isLoading: false }),
  useGetPettyCashFundQuery: () => ({ data: mocks.detail ? { data: mocks.detail } : undefined }),
  useGetPettyCashVouchersQuery: () => ({ data: { data: mocks.vouchers }, isFetching: false }),
  useGetPettyCashReturnsQuery: () => ({ data: { data: mocks.returns, pagination: { totalItems: mocks.returns.length } }, isLoading: false, isError: false, refetch: vi.fn() }),
  useGetPettyCashReturnQuery: () => ({ data: mocks.linked ? { data: mocks.linked } : undefined }),
  useGetBankAccountsQuery: () => ({ data: { data: [] } }),
  useCancelPettyCashVoucherMutation: () => [mocks.cancel, { isLoading: false }],
  useCreatePettyCashFundMutation: idle,
  useEstablishPettyCashMutation: idle,
  useReplenishPettyCashMutation: idle,
  useCreatePettyCashVoucherMutation: idle,
  usePostPettyCashVoucherMutation: idle,
  useVoidPettyCashVoucherMutation: idle,
  useReducePettyCashFloatMutation: idle,
  useClosePettyCashFundMutation: idle,
  useReopenPettyCashFundMutation: idle,
  useUpdatePettyCashFundMutation: idle,
  useVoidPettyCashReturnMutation: idle,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hostBranchLens: () => mocks.lens,
  useBranches: () => ({ data: mocks.lens.choices, isLoading: false, isError: false }),
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingRecap: () => null,
  BankAccountPicker: () => null,
  AccountPicker: () => null,
  TaxCodePicker: () => null,
  PostingDateField: () => null,
}));

vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));

vi.mock("./petty-cash-approval-route", () => ({ PettyCashApprovalRouteCard: () => null }));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import type { PettyCashFund } from "@/redux/services/finance/ops-types";
import { P } from "../../../permissions";
import { PettyCashTab } from "./petty-cash-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NAIRA = 100;
const fund = (over: Partial<PettyCashFund> = {}): PettyCashFund => ({
  id: 1, branch_id: 1, name: "Front desk", gl_account: "1150", gl_account_id: 9, custodian_id: null,
  custodian_name: "Mrs Eze", custodian_label: "Mrs Eze", float_amount: 100_000 * NAIRA, float_amount_naira: "",
  current_balance: 100_000 * NAIRA, current_balance_naira: "", shortfall: 0, currency: "NGN",
  last_replenished_at: null, is_active: true, state: "ACTIVE", closed_on: null, closed_by_id: null, ...over,
});
const voucher = (status: string, n: string) => ({
  id: Number(n.slice(-1)), document_number: n, fund_id: 1, voucher_date: "2026-10-01", payee: "", spent_by_id: null,
  narration: "Biscuits", reference: "", status, subtotal: 0, tax_total: 0, total: 2_000 * NAIRA, total_naira: "",
  journal_id: null, expense_account: "5300 · Refreshments",
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.funds = [fund()];
  mocks.detail = null;
  mocks.vouchers = [];
  mocks.returns = [];
  mocks.linked = null;
  mocks.denied = new Set();
  mocks.lens = { applies: false, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Main" }], isLoading: false };
  mocks.cancel.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Petty cash voucher PCV-1 cancelled." }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = (path = "/") => act(() => root.render(
  <MemoryRouter initialEntries={[path]}><PettyCashTab entity="BSS" currency="NGN" /></MemoryRouter>,
));
const actions = () => [...container.querySelectorAll("[data-testid=fund-actions] button")].map((b) => b.textContent?.trim());
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const tab = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;

describe("a running fund", () => {
  it("offers the cash actions to the holders of their keys", () => {
    render();
    expect(actions()).toEqual(["Establish float", "Replenish", "Reduce float", "New voucher", "Close fund", "Edit fund"]);
    expect(container.querySelector("[data-testid=fund-closed]")).toBeNull();
  });

  it("hides Reduce float and Close fund from a reader without those keys", () => {
    mocks.denied = new Set([P.FIN_RETURN_PETTY_CASH, P.FIN_CLOSE_PETTY_CASH]);
    render();
    expect(actions()).not.toContain("Reduce float");
    expect(actions()).not.toContain("Close fund");
  });

  it("tones the register's return categories", () => {
    mocks.detail = {
      ...fund(), spent_this_week: 0,
      register: [
        { id: 1, date: "2026-10-01", description: "Reduce", category: "Returned to bank", in: 0, out: 38_500 * NAIRA, balance: 60_000 * NAIRA },
        { id: 2, date: "2026-10-01", description: "Count", category: "Count short", in: 0, out: 1_500 * NAIRA, balance: 98_500 * NAIRA },
        { id: 3, date: "2026-09-01", description: "Count", category: "Count over", in: 500 * NAIRA, out: 0, balance: 100_000 * NAIRA },
      ],
    };
    render();
    const pill = (text: string) => [...container.querySelectorAll("tbody span")].find((s) => s.textContent === text)!;
    expect(pill("Returned to bank").className).toContain("text-primary");
    expect(pill("Count short").className).toContain("text-destructive");
    expect(pill("Count over").className).toContain("text-green-01");
  });

  it("cancels a draft voucher, which never posts", async () => {
    mocks.vouchers = [voucher("DRAFT", "PCV-1"), voucher("POSTED", "PCV-2")];
    render();
    act(() => tab("Vouchers").click());
    const cancels = [...container.querySelectorAll("tbody button")].filter((b) => b.textContent?.includes("Cancel"));
    expect(cancels).toHaveLength(1);
    act(() => (cancels[0] as HTMLButtonElement).click());
    expect(document.body.textContent).toContain("never posted");
    await act(async () => button("Cancel voucher")!.click());
    expect(mocks.cancel).toHaveBeenCalledWith({ id: 1, entity: "BSS" });
  });

  it("tells Close fund which draft voucher holds it up", () => {
    mocks.vouchers = [voucher("DRAFT", "PCV-1")];
    render();
    act(() => button("Close fund")!.click());
    expect(document.body.querySelector("[data-testid=close-blockers]")?.textContent)
      .toContain("Vouchers not yet posted: PCV-1. Post or cancel them first.");
  });
});

describe("a closed fund", () => {
  beforeEach(() => {
    mocks.funds = [fund({ state: "CLOSED", is_active: false, float_amount: 0, current_balance: 0, closed_on: "2026-10-01", closed_by_id: 7, closed_by_name: "Mrs Bello", closed_by_is_exited: false })];
  });

  it("says when and by whom it closed, and offers only Reopen and Edit", () => {
    render();
    expect(container.querySelector("[data-testid=fund-closed]")?.textContent)
      .toContain("Closed on 1 Oct 2026 by Mrs Bello.");
    expect(actions()).toEqual(["Reopen", "Edit fund"]);
  });

  it("says when the person who closed it has left the school", () => {
    mocks.funds = [fund({ state: "CLOSED", is_active: false, closed_on: "2026-10-01", closed_by_id: 7, closed_by_name: "Mrs Bello", closed_by_is_exited: true })];
    render();
    expect(container.querySelector("[data-testid=fund-closed]")?.textContent).toContain("by Mrs Bello (left).");
  });

  it("hides Reopen from a reader without the reopen key", () => {
    mocks.denied = new Set([P.FIN_REOPEN_PETTY_CASH]);
    render();
    expect(actions()).toEqual(["Edit fund"]);
  });
});

describe("branches", () => {
  it("asks nothing about branches at a school with one", () => {
    render();
    expect(container.querySelector("select[aria-label=Branch]")).toBeNull();
  });

  it("lets a reader of several branches pick, naming each fund's branch under All branches", () => {
    mocks.lens = { applies: true, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false };
    mocks.funds = [fund(), fund({ id: 2, branch_id: 2, name: "Lekki float" })];
    render();
    expect(container.querySelector("select[aria-label=Branch]")).not.toBeNull();
    const options = [...container.querySelectorAll("select[aria-label=Fund] option")].map((o) => o.textContent);
    expect(options).toEqual(["Front desk · Mrs Eze · Ikeja", "Lekki float · Mrs Eze · Lekki"]);
  });

  it("shows only the branch in the page address", () => {
    mocks.lens = { applies: true, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false };
    mocks.funds = [fund(), fund({ id: 2, branch_id: 2, name: "Lekki float" })];
    render("/?branch=2");
    const options = [...container.querySelectorAll("select[aria-label=Fund] option")].map((o) => o.textContent);
    expect(options).toEqual(["Lekki float · Mrs Eze"]);
  });
});

describe("a link to one return", () => {
  it("opens the return the journal names", () => {
    mocks.linked = {
      id: 11, document_number: "PCR-0011", status: "POSTED", kind: "CLOSE", kind_label: "Close the fund",
      branch_id: 1, branch_name: "Main", fund_id: 1, fund_name: "Front desk", bank_account_id: 3, bank_account_name: "GTBank",
      return_date: "2026-10-01", counted_amount: 0, book_balance: 0, difference: 0, shortage: 0, overage: 0,
      difference_reason: "", amount: 0, amount_naira: "", cash_left: 0, previous_float_amount: 0, new_float_amount: 0,
      counted_by_id: 7, counted_by_name: "Mrs Eze", narration: "", reference: "", journal_id: 5, created_by_id: 7, created_by_name: "Mrs Bello",
    };
    render("/?document=11");
    expect(document.body.querySelector("[role=dialog]")?.textContent).toContain("PCR-0011");
    expect(document.body.textContent).toContain("Raised byMrs Bello");
  });

  it("opens nothing without one", () => {
    render();
    expect(document.body.querySelector("[role=dialog]")).toBeNull();
  });
});
