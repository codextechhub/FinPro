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
  toast: { success: vi.fn(), error: vi.fn() },
}));

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
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import type { PettyCashFund, PettyCashReturn } from "@/redux/services/finance/ops-types";
import { P } from "../../../permissions";
import { pettyCashBranchFor } from "./petty-cash-branch";
import { PettyCashReturnsList } from "./petty-cash-returns-list";

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

  it("offers no Void without the reverse key", () => {
    mocks.denied = new Set([P.FIN_REVERSE_PETTY_CASH]);
    act(() => root.render(<PettyCashReturnsList entity="BSS" funds={FUNDS} view={pettyCashBranchFor(LENS, null)} />));
    act(() => (tableRows()[0] as HTMLElement).click());
    expect(button("Void")).toBeUndefined();
  });
});
