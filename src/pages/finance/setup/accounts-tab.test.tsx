/**
 * The chart of accounts is the school's: every branch posts to it, so the
 * server takes a new account, or an edit to an account no bank backs, only from
 * a reader who covers the whole school. Bright Star's proprietor covers every
 * branch; Mrs Adeyemi keeps Lekki's books and holds the same keys; Corona has
 * one branch, and its bursar, pinned to it, covers the whole school.
 *
 * Ikeja's bank ledger belongs to Ikeja. Mrs Adeyemi, at Lekki, reads that it
 * is Ikeja's to change, not that every branch posts to it.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  wholeSchool: true,
  branchIds: null as number[] | null,
  held: new Set<string>(),
  chart: null as unknown[] | null,
  detail: undefined as unknown,
  activity: undefined as unknown,
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
vi.mock("@/hooks/use-action-param", () => ({ useActionParam: () => undefined }));
vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  useReaderReach: () => ({
    wholeSchool: mocks.wholeSchool,
    branchIds: mocks.branchIds,
    covers: (ids: number[]) => mocks.wholeSchool || (ids.length > 0 && ids.every((id) => mocks.branchIds?.includes(id))),
  }),
  useBranches: () => ({ data: [{ id: 2, name: "Lekki" }, { id: 3, name: "Ikeja" }], isLoading: false, isError: false }),
}));
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => v }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ currency: "NGN" }),
}));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetChartOfAccountsQuery: () => ({
    data: { data: mocks.chart ?? [{
      id: 1, code: "4000", name: "Fees income", account_type: "INCOME", normal_balance: "CREDIT", is_contra: false,
      is_postable: true, is_active: true, parent_id: null, parent_code: null, subtype: "", balance: null, tag: null,
    }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useCreateAccountMutation: () => [vi.fn(), { isLoading: false }],
  useGetAccountDetailQuery: () => ({ data: mocks.detail, isLoading: false, isError: false, refetch: vi.fn() }),
  useGetAccountActivityQuery: () => ({ data: mocks.activity, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useUpdateAccountMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../../permissions";
import type { Account } from "@/redux/services/finance/setup-types";
import { AccountSettings, AccountsTab, accountReadOnlyReason } from "./accounts-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const account = (bank_branch_id: number | null): Account => ({
  id: 7, code: "1210", name: "Lekki bank", account_type: "ASSET", normal_balance: "DEBIT", is_contra: false,
  is_postable: true, is_active: true, parent_id: null, parent_code: null, subtype: "Bank",
  bank_account_id: bank_branch_id == null ? null : 3, bank_branch_id,
});

const asProprietor = () => { mocks.wholeSchool = true; mocks.branchIds = null; };
const asLekkiBursar = () => { mocks.wholeSchool = false; mocks.branchIds = [2]; };
const asCoronaBursar = () => { mocks.wholeSchool = true; mocks.branchIds = [1]; };

beforeEach(() => {
  mocks.chart = null;
  mocks.detail = undefined;
  mocks.activity = undefined;
  asProprietor();
  mocks.held = new Set([P.FIN_CREATE_ACCOUNT, P.FIN_UPDATE_ACCOUNT, P.FIN_VIEW_ACCOUNTS]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

describe("New account", () => {
  it("is offered to a whole-school holder of the create key", () => {
    act(() => root.render(<AccountsTab entity="BSS" />));
    expect(container.textContent).toContain("Fees income");
    expect(button("New account")).toBeDefined();
  });

  it("is not offered to a branch's own bursar, though she holds the key", () => {
    asLekkiBursar();
    act(() => root.render(<AccountsTab entity="BSS" />));
    expect(container.textContent).toContain("Fees income");
    expect(button("New account")).toBeUndefined();
  });

  it("is offered at a one-branch school to a bursar pinned to that branch", () => {
    asCoronaBursar();
    act(() => root.render(<AccountsTab entity="CSS" />));
    expect(button("New account")).toBeDefined();
  });
});

describe("Account settings", () => {
  it("let a whole-school reader edit an account no bank backs", () => {
    act(() => root.render(<AccountSettings entity="BSS" account={account(null)} onSaved={vi.fn()} />));
    expect(button("Save changes")).toBeDefined();
  });

  it("let a branch's bursar edit the ledger account of her own branch's bank", () => {
    asLekkiBursar();
    act(() => root.render(<AccountSettings entity="BSS" account={account(2)} onSaved={vi.fn()} />));
    expect(button("Save changes")).toBeDefined();
  });

  it("keep the rest of the chart read-only for her, and say why", () => {
    asLekkiBursar();
    act(() => root.render(<AccountSettings entity="BSS" account={account(null)} onSaved={vi.fn()} />));
    expect(button("Save changes")).toBeUndefined();
    expect(container.textContent).toContain("Only a school-wide administrator can change this account");
  });

  it("keep another branch's bank account read-only for her", () => {
    asLekkiBursar();
    act(() => root.render(<AccountSettings entity="BSS" account={account(3)} onSaved={vi.fn()} />));
    expect(button("Save changes")).toBeUndefined();
    expect(container.textContent).toContain("This is the ledger account behind Ikeja's own bank account, so only someone who works in Ikeja can change it.");
    expect(container.textContent).not.toContain("every branch posts to it");
  });

  it("are read-only without the update key, whatever the reach", () => {
    mocks.held = new Set([P.FIN_CREATE_ACCOUNT]);
    act(() => root.render(<AccountSettings entity="BSS" account={account(null)} onSaved={vi.fn()} />));
    expect(button("Save changes")).toBeUndefined();
    expect(container.textContent).toContain("permission to edit accounts");
  });
});

describe("accountReadOnlyReason", () => {
  it("names the missing key first, whatever the account", () => {
    expect(accountReadOnlyReason({ holdsKey: false, bankBranchId: 3, bankBranchName: "Ikeja" })).toBe("You don’t have permission to edit accounts.");
  });

  it("names the branch a bank ledger belongs to", () => {
    expect(accountReadOnlyReason({ holdsKey: true, bankBranchId: 3, bankBranchName: "Ikeja" })).toContain("only someone who works in Ikeja can change it");
  });

  it("keeps the whole-chart reason for an account no bank backs", () => {
    expect(accountReadOnlyReason({ holdsKey: true, bankBranchId: null, bankBranchName: null })).toContain("every branch posts to it");
  });
});

/**
 * A bank account's ledger account carries the bank's book balance as its own, so
 * a role that may not read `finance.bankaccount.book_balance` is served that
 * account without `balance`, `running_balance` or the summary figures.
 */
describe("Bank ledger accounts when the book balance is hidden", () => {
  const row = (id: number, code: string, over: Record<string, unknown> = {}) => ({
    id, code, name: `Account ${code}`, account_type: "ASSET", normal_balance: "DEBIT", is_contra: false,
    is_postable: true, is_active: true, parent_id: null, parent_code: null, subtype: "", tag: null,
    balance: { kobo: 500000, naira: "5,000.00" }, ...over,
  });
  const bank = (id: number, code: string) => {
    const { balance: _hidden, ...rest } = row(id, code, { bank_branch_id: 2 });
    return rest;
  };
  const bodyCells = (table: Element) => [...table.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td").length);
  const headCells = (table: Element) => table.querySelectorAll("thead th").length;
  const headers = () => [...document.body.querySelectorAll("th")].map((th) => th.textContent);

  it("shows the Balance column with a dash on the hidden row, cells matching headers", () => {
    mocks.chart = [row(1, "1100"), bank(2, "1210")];
    act(() => root.render(<AccountsTab entity="BSS" />));
    const table = container.querySelector("table")!;
    expect(headers()).toContain("Balance");
    expect(bodyCells(table).every((n) => n === headCells(table))).toBe(true);
    expect(container.textContent).toContain("5,000.00");
    expect(container.textContent).not.toMatch(/undefined|NaN/);
    const hiddenRow = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes("1210"))!;
    expect(hiddenRow.querySelectorAll("td")[5].textContent).toBe("-");
  });

  it("drops the Balance column when no balance is readable", () => {
    mocks.chart = [bank(2, "1210"), bank(3, "1220")];
    act(() => root.render(<AccountsTab entity="BSS" />));
    const table = container.querySelector("table")!;
    expect(headers()).not.toContain("Balance");
    expect(bodyCells(table).every((n) => n === headCells(table))).toBe(true);
    expect(container.textContent).not.toMatch(/0\.00/);
  });

  it("does not state a group total that would leave out a hidden bank balance", () => {
    mocks.chart = [
      row(1, "1000", { is_postable: false, balance: { kobo: 0, naira: "0.00" } }),
      row(2, "1100", { parent_id: 1, parent_code: "1000" }),
      { ...bank(3, "1210"), parent_id: 1, parent_code: "1000" },
    ];
    act(() => root.render(<AccountsTab entity="BSS" />));
    const rows = [...container.querySelectorAll("tbody tr")];
    const group = rows.find((tr) => tr.textContent?.includes("Account 1000"))!;
    expect(group.querySelectorAll("td")[5].textContent).toBe("-");
    const readable = rows.find((tr) => tr.textContent?.includes("Account 1100"))!;
    expect(readable.querySelectorAll("td")[5].textContent).toContain("5,000.00");
  });

  const summary = { line_count: 2, journal_count: 1, fiscal_year_start: "2026-01-01", as_of: "2026-10-12" };
  const line = (n: number, over: Record<string, unknown> = {}) => ({
    date: "2026-10-01", journal_no: `JV-${n}`, source: "Manual", description: "Fee", cost_center: "",
    debit: { kobo: 1000, naira: "10.00" }, credit: { kobo: 0, naira: "0.00" }, ...over,
  });
  const openDetail = (accountRow: Record<string, unknown>) => {
    mocks.chart = [accountRow];
    act(() => root.render(<AccountsTab entity="BSS" />));
    act(() => { (container.querySelector("tbody tr") as HTMLElement).click(); });
  };

  it("serves the detail drawer without balance cards or the running balance column", () => {
    const hidden = bank(7, "1210");
    mocks.detail = { data: {
      account: hidden, type_label: "Asset", summary,
      activity: [line(1), line(2)],
    } };
    openDetail(hidden);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Current balance");
    expect(text).not.toContain("Opening (FY carry-in)");
    expect(text).toContain("Posted YTD");
    expect(text).not.toMatch(/undefined|NaN/);
    const table = document.body.querySelectorAll("table")[1]!;
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Date", "Journal", "Description", "Cost centre", "Debit", "Credit"]);
    expect(bodyCells(table).every((n) => n === headCells(table))).toBe(true);
  });

  it("keeps the balance cards and the running balance column when readable", () => {
    const open = row(7, "1210", { bank_branch_id: 2 });
    mocks.detail = { data: {
      account: open, type_label: "Asset",
      summary: { ...summary, current_balance: { kobo: 700000, naira: "7,000.00" }, opening_balance: { kobo: 100000, naira: "1,000.00" } },
      activity: [line(1, { running_balance: { kobo: 700000, naira: "7,000.00" } }), line(2, { running_balance: { kobo: 600000, naira: "6,000.00" } })],
    } };
    openDetail(open);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Current balance");
    expect(text).toContain("Opening (FY carry-in)");
    const table = document.body.querySelectorAll("table")[1]!;
    expect(headCells(table)).toBe(7);
    expect(bodyCells(table)).toEqual([7, 7]);
    expect(text).toContain("6,000.00");
  });

  it("states the group's consolidated activity without totals when the server omits them", () => {
    const group = row(1, "1000", { is_postable: false });
    mocks.detail = { data: {
      account: group, type_label: "Asset",
      summary: { ...summary, current_balance: { kobo: 0, naira: "0.00" }, opening_balance: { kobo: 0, naira: "0.00" } },
      activity: [],
    } };
    mocks.activity = { data: [], pagination: { currentPage: 1, totalPages: 1 } };
    openDetail(group);
    act(() => { [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("View activity"))!.click(); });
    expect(document.body.textContent).toContain("Consolidated activity");
    expect(document.body.textContent).not.toContain("Total debits");
    expect(document.body.textContent).not.toContain("Net group movement");
  });

  it("serves a group's drawer without balance cards when the server omits both balances", () => {
    const group = row(1, "1000", { is_postable: false });
    mocks.detail = { data: { account: group, type_label: "Asset", summary, activity: [] } };
    openDetail(group);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Group balance");
    expect(text).not.toContain("Opening group balance");
    expect(text).toContain("Posted activity YTD");
    expect(text).toContain("View activity");
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it("lists a group's posting accounts without balance columns when none is readable", () => {
    const group = row(1, "1000", { is_postable: false });
    mocks.chart = [group, { ...bank(2, "1210"), parent_id: 1, parent_code: "1000" }];
    mocks.detail = { data: {
      account: group, type_label: "Asset",
      summary: { ...summary, current_balance: { kobo: 0, naira: "0.00" }, opening_balance: { kobo: 0, naira: "0.00" } },
      activity: [],
    } };
    act(() => root.render(<AccountsTab entity="BSS" />));
    act(() => { (container.querySelector("tbody tr") as HTMLElement).click(); });
    act(() => { [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("View breakdown"))!.click(); });
    expect(document.body.textContent).toContain("Account 1210");
    expect(document.body.textContent).not.toContain("Account balance");
    expect(document.body.textContent).not.toContain("Group contribution");
  });
});
