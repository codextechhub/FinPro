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
  fieldAccess: {} as Record<string, unknown>,
  create: vi.fn(),
  update: vi.fn(),
  nextCode: "5540",
  nextArgs: [] as unknown[],
  suggestions: [] as unknown[],
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
  useCreateAccountMutation: () => [(arg: unknown) => ({ unwrap: () => mocks.create(arg) }), { isLoading: false }],
  useGetNextAccountCodeQuery: (arg: unknown) => {
    mocks.nextArgs.push(arg);
    return { data: arg && typeof arg === "object" ? { data: { code: mocks.nextCode } } : undefined, isFetching: false, isError: false };
  },
  useGetAccountSuggestionsQuery: (arg: unknown) => ({
    data: arg && typeof arg === "object" ? { data: mocks.suggestions } : undefined, isLoading: false, isError: false,
  }),
  useGetAccountDetailQuery: () => ({ data: mocks.detail, isLoading: false, isError: false, refetch: vi.fn() }),
  useGetAccountActivityQuery: () => ({ data: mocks.activity, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useUpdateAccountMutation: () => [(arg: unknown) => ({ unwrap: () => mocks.update(arg) }), { isLoading: false }],
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
  mocks.fieldAccess = {};
  mocks.create = vi.fn().mockResolvedValue({ message: "Account created." });
  mocks.update = vi.fn().mockResolvedValue({ message: "Account updated." });
  mocks.nextCode = "5540";
  mocks.nextArgs = [];
  mocks.suggestions = [];
  window.localStorage.clear();
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

/**
 * The software posts to most of the chart itself. Where the server classifies
 * accounts, Mrs Adeyemi opens the chart and reads the accounts she uses; the
 * rest wait folded under "Managed by the system". A role that may not read the
 * classification gets the chart exactly as it always was.
 */
describe("Chart split into everyday and system accounts", () => {
  const MOVED = "an invoice, a receipt or a credit note";
  const row = (id: number, code: string, name: string, over: Record<string, unknown> = {}) => ({
    id, code, name, account_type: "ASSET", normal_balance: "DEBIT", is_contra: false,
    is_postable: true, is_active: true, parent_id: null, parent_code: null, subtype: "", tag: null,
    balance: { kobo: 100000, naira: "1,000.00" }, description: "", managed_by: null, ...over,
  });
  const kept = (over: Record<string, unknown> = {}) => ({ keeper: "the receivables ledger", moved_by: MOVED, hand_journals: false, ...over });
  const chart = () => [
    row(1, "1000", "Assets", { is_postable: false }),
    row(2, "1100", "Cash in hand", { parent_id: 1, parent_code: "1000", description: "Notes and coins kept in the bursar's safe." }),
    row(3, "1200", "Fees owed by parents", { parent_id: 1, parent_code: "1000", tag: "CONTROL", managed_by: kept() }),
    row(4, "2195", "Unidentified receipts", { account_type: "LIABILITY", normal_balance: "CREDIT", managed_by: kept({ keeper: "the receipts desk" }) }),
    row(5, "5100", "Salaries", { account_type: "EXPENSE", managed_by: kept({ keeper: "payroll", moved_by: "a payroll run" }) }),
  ];
  const text = () => container.textContent ?? "";
  const sectionButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Managed by the system"))!;
  const typeInto = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    act(() => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("folds the system's accounts into one collapsed section with its count", () => {
    mocks.chart = chart();
    act(() => root.render(<AccountsTab entity="BSS" />));
    expect(text()).toContain("Managed by the system (3)");
    expect(text()).toContain("The software posts to these accounts for you when you record invoices, payments, payroll and stock. You rarely need to open them.");
    expect(text()).toContain("Cash in hand");
    expect(text()).toContain("Assets");
    expect(text()).not.toContain("Fees owed by parents");
    expect(text()).not.toContain("Salaries");
    expect(sectionButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("shows each account's description as a muted line under its name", () => {
    mocks.chart = chart();
    act(() => root.render(<AccountsTab entity="BSS" />));
    expect(text()).toContain("Notes and coins kept in the bursar's safe.");
  });

  it("opens to the system's accounts, grouped by type, each saying what moves it", () => {
    mocks.chart = chart();
    act(() => root.render(<AccountsTab entity="BSS" />));
    act(() => sectionButton().click());
    expect(sectionButton().getAttribute("aria-expanded")).toBe("true");
    expect(text()).toContain("Fees owed by parents");
    expect(text()).toContain("Unidentified receipts");
    expect(text()).toContain(`Moved by ${MOVED}`);
    expect(text()).toContain("Moved by a payroll run");
    expect(text()).toContain("CTRL");
    const headings = [...container.querySelectorAll("th[scope=colgroup]")].map((th) => th.textContent);
    expect(headings).toEqual(["Assets", "Liabilities", "Expenses"]);
  });

  it("keeps balances and opens the drawer from a system row", () => {
    mocks.chart = chart();
    mocks.detail = { data: { account: chart()[2], type_label: "Asset", summary: { line_count: 0, journal_count: 0, fiscal_year_start: "2026-01-01", as_of: "2026-10-12" }, activity: [] } };
    act(() => root.render(<AccountsTab entity="BSS" />));
    act(() => sectionButton().click());
    const systemRow = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes("Fees owed by parents")) as HTMLElement;
    expect(systemRow.textContent).toContain("1,000.00");
    act(() => systemRow.click());
    expect(document.body.textContent).toContain("Managed by the system: kept by the receivables ledger.");
  });

  it("shows the old single tree, with no section and no system wording, when the key is absent", () => {
    mocks.chart = chart().map(({ managed_by: _hidden, ...rest }) => rest);
    act(() => root.render(<AccountsTab entity="BSS" />));
    expect(text()).not.toContain("Managed by the system");
    expect(text()).not.toContain("Moved by");
    for (const name of ["Cash in hand", "Fees owed by parents", "Unidentified receipts", "Salaries"]) expect(text()).toContain(name);
  });

  it("finds a system account by search and opens the section for it", () => {
    mocks.chart = chart();
    act(() => root.render(<AccountsTab entity="BSS" />));
    typeInto(container.querySelector("input[placeholder^='Search']") as HTMLInputElement, "unidentified");
    expect(text()).toContain("Managed by the system (1 of 3)");
    expect(text()).toContain("Unidentified receipts");
    expect(text()).not.toContain("Cash in hand");
    expect(sectionButton().getAttribute("aria-expanded")).toBe("true");
  });

  it("finds an account by what it is for", () => {
    mocks.chart = chart().map((r) => (r.code === "5100" ? { ...r, description: "Monthly pay for teachers and staff." } : r));
    act(() => root.render(<AccountsTab entity="BSS" />));
    typeInto(container.querySelector("input[placeholder^='Search']") as HTMLInputElement, "teachers");
    expect(text()).toContain("Salaries");
  });

  it("remembers how the viewer left the section", () => {
    mocks.chart = chart();
    act(() => root.render(<AccountsTab entity="BSS" />));
    act(() => sectionButton().click());
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<AccountsTab entity="BSS" />));
    expect(sectionButton().getAttribute("aria-expanded")).toBe("true");
  });

  it("remembers which groups the viewer closed", () => {
    mocks.chart = chart();
    act(() => root.render(<AccountsTab entity="BSS" />));
    act(() => (container.querySelector("button[aria-label='Collapse']") as HTMLElement).click());
    expect(text()).not.toContain("Cash in hand");
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<AccountsTab entity="BSS" />));
    expect(text()).not.toContain("Cash in hand");
  });

  it("works when the browser's storage throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    let touched = 0;
    Object.defineProperty(window, "localStorage", { configurable: true, get() { touched += 1; throw new Error("blocked"); } });
    try {
      mocks.chart = chart();
      act(() => root.render(<AccountsTab entity="BSS" />));
      act(() => sectionButton().click());
      expect(text()).toContain("Fees owed by parents");
      expect(touched).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });

  describe("Field Access", () => {
    const headers = () => [...container.querySelectorAll("thead")].map((t) => [...t.querySelectorAll("th")].map((th) => th.textContent));

    it("hides the same columns, tags and lines in the system section as in the main table", () => {
      mocks.fieldAccess = { "finance.account": { hidden: ["subtype", "is_active", "tag", "description", "balance"] } };
      mocks.chart = chart();
      act(() => root.render(<AccountsTab entity="BSS" />));
      act(() => sectionButton().click());
      const [main, system] = headers();
      expect(main).toEqual(["Account", "Type", "Normal", "Currency"]);
      expect(system).toEqual(main);
      expect(text()).not.toContain("CTRL");
      expect(text()).not.toContain("Notes and coins kept");
      expect(text()).toContain(`Moved by ${MOVED}`);
      const cells = [...container.querySelectorAll("tbody tr")].filter((tr) => tr.querySelector("td")).map((tr) => tr.querySelectorAll("td").length);
      expect(cells.every((n) => n === 4)).toBe(true);
      const heading = container.querySelector("th[scope=colgroup]") as HTMLElement;
      expect(heading.getAttribute("colspan")).toBe("4");
    });

    it("shows one plain tree when the classification is hidden by its switch", () => {
      mocks.fieldAccess = { "finance.account": { hidden: ["managed_by"] } };
      mocks.chart = chart();
      act(() => root.render(<AccountsTab entity="BSS" />));
      expect(text()).not.toContain("Managed by the system");
      expect(text()).not.toContain("Moved by");
      expect(text()).toContain("Salaries");
    });
  });

  describe("detail drawer", () => {
    const summary = { line_count: 0, journal_count: 0, fiscal_year_start: "2026-01-01", as_of: "2026-10-12" };
    const open = (account: Record<string, unknown>) => {
      mocks.chart = [account];
      mocks.detail = { data: { account, type_label: "Asset", summary, activity: [] } };
      act(() => root.render(<AccountsTab entity="BSS" />));
      if (!container.querySelector("tbody tr.cursor-pointer")) act(() => sectionButton().click());
      act(() => { (container.querySelector("tbody tr.cursor-pointer") as HTMLElement).click(); });
    };

    it("says what the account is for and, for a system account, who keeps it", () => {
      open(row(3, "1200", "Fees owed by parents", { description: "What parents still owe the school.", managed_by: kept() }));
      const body = document.body.textContent ?? "";
      expect(body).toContain("What it's for");
      expect(body).toContain("What parents still owe the school.");
      expect(body).toContain(`Managed by the system: kept by the receivables ledger. Record it with ${MOVED}.`);
      expect(body).toContain("Typed journals cannot post to this account.");
    });

    it("leaves out the typed-journal line when a typed journal is allowed", () => {
      open(row(3, "1200", "Fees owed by parents", { managed_by: kept({ hand_journals: true }) }));
      const body = document.body.textContent ?? "";
      expect(body).toContain("Managed by the system: kept by");
      expect(body).not.toContain("Typed journals cannot post");
    });

    it("leaves out the purpose and the system panel when their switches are hidden", () => {
      mocks.fieldAccess = { "finance.account": { hidden: ["description", "managed_by"] } };
      const hiddenRow = (() => { const { description: _d, managed_by: _m, ...rest } = row(3, "1200", "Fees owed by parents"); return rest; })();
      mocks.chart = [hiddenRow];
      mocks.detail = { data: { account: hiddenRow, type_label: "Asset", summary, activity: [] } };
      act(() => root.render(<AccountsTab entity="BSS" />));
      act(() => { (container.querySelector("tbody tr.cursor-pointer") as HTMLElement).click(); });
      const body = document.body.textContent ?? "";
      expect(body).not.toContain("What it's for");
      expect(body).not.toContain("Managed by the system");
    });

    it("shows no system panel for an everyday account", () => {
      open(row(2, "1100", "Cash in hand", { description: "Notes and coins." }));
      expect(document.body.textContent).not.toContain("Managed by the system");
    });

    it("edits the description in Settings and sends only what changed", () => {
      const account = row(2, "1100", "Cash in hand", { description: "Notes and coins." });
      act(() => root.render(<AccountSettings entity="BSS" account={account as unknown as Account} onSaved={vi.fn()} />));
      const box = container.querySelector("textarea") as HTMLTextAreaElement;
      expect(box.value).toBe("Notes and coins.");
      expect(button("Save changes")!.hasAttribute("disabled")).toBe(true);
      typeInto(box, "Notes and coins in the bursar's safe.");
      expect(button("Save changes")!.hasAttribute("disabled")).toBe(false);
      act(() => button("Save changes")!.click());
      expect(mocks.update).toHaveBeenCalledWith({
        entity: "BSS", id: 2, name: "Cash in hand", subtype: "", is_active: true, description: "Notes and coins in the bursar's safe.",
      });
    });

    it("greys the description when its Field Access switch is read-only", () => {
      mocks.fieldAccess = { "finance.account": { read_only: ["description"] } };
      const account = row(2, "1100", "Cash in hand", { description: "Notes and coins." });
      act(() => root.render(<AccountSettings entity="BSS" account={account as unknown as Account} onSaved={vi.fn()} />));
      const box = container.querySelector("fieldset[data-field=description]");
      expect(box?.hasAttribute("disabled")).toBe(true);
      expect(button("Save changes")!.hasAttribute("disabled")).toBe(true);
    });
  });

  describe("Add an account", () => {
    const findButton = (label: string, within: ParentNode = document.body) =>
      [...within.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) as HTMLButtonElement | undefined;
    const kind = (label: string) =>
      [...document.body.querySelectorAll("[role=radio]")].find((b) => b.textContent?.startsWith(label)) as HTMLButtonElement;
    const openDrawer = () => {
      mocks.chart = chart();
      act(() => root.render(<AccountsTab entity="BSS" />));
      act(() => findButton("New account", container)!.click());
    };
    const nameInput = () => document.body.querySelector("input[placeholder='e.g. Science lab supplies']") as HTMLInputElement;
    const created = () => mocks.create.mock.calls.map((c) => c[0] as Record<string, unknown>);

    it("asks what the account is for in plain words, not for a code", () => {
      openDrawer();
      const body = document.body.textContent ?? "";
      expect(body).toContain("What is this account for?");
      for (const label of ["Money coming in", "Money going out", "Something we own", "Something we owe", "Owner's capital or reserves"]) expect(body).toContain(label);
      expect(document.body.querySelector("#new-account-code")).toBeNull();
      expect(body).not.toContain("chosen for you");
    });

    it("shows the code chosen for the type and creates without a code or a parent", async () => {
      openDrawer();
      act(() => kind("Money going out").click());
      expect(document.body.textContent).toContain("Code 5540, chosen for you.");
      expect(mocks.nextArgs.at(-1)).toEqual({ entity: "BSS", account_type: "EXPENSE" });
      typeInto(nameInput(), "Science lab supplies");
      typeInto(document.body.querySelector("textarea") as HTMLTextAreaElement, "Chemicals bought for the lab");
      await act(async () => { findButton("Create account")!.click(); });
      expect(created()).toEqual([{ entity: "BSS", account_type: "EXPENSE", name: "Science lab supplies", description: "Chemicals bought for the lab" }]);
      expect(created()[0]).not.toHaveProperty("code");
      expect(created()[0]).not.toHaveProperty("parent");
    });

    it("cannot be created before a type and a name are given", () => {
      openDrawer();
      expect(findButton("Create account")!.disabled).toBe(true);
      act(() => kind("Money going out").click());
      expect(findButton("Create account")!.disabled).toBe(true);
      typeInto(nameInput(), "Science lab supplies");
      expect(findButton("Create account")!.disabled).toBe(false);
    });

    it("sends the accountant's own code, with the checks they always had", async () => {
      openDrawer();
      act(() => kind("Money going out").click());
      act(() => findButton("Choose my own code")!.click());
      const code = document.body.querySelector("#new-account-code") as HTMLInputElement;
      typeInto(nameInput(), "Science lab supplies");
      typeInto(code, "5100");
      expect(document.body.textContent).toContain("This account code already exists.");
      expect(findButton("Create account")!.disabled).toBe(true);
      typeInto(code, "4200");
      expect(document.body.textContent).toContain("is for \"Money coming in\" accounts");
      expect(findButton("Create account")!.disabled).toBe(true);
      typeInto(code, "5200");
      expect(findButton("Create account")!.disabled).toBe(false);
      await act(async () => { findButton("Create account")!.click(); });
      expect(created()).toEqual([{ entity: "BSS", code: "5200", name: "Science lab supplies", is_postable: true, is_contra: false }]);
    });

    it("never sends a read-only or hidden option from the accountant's panel", async () => {
      mocks.fieldAccess = { "finance.account": { read_only: ["is_contra", "parent_id"], hidden: ["subtype"] } };
      openDrawer();
      act(() => kind("Money going out").click());
      act(() => findButton("Choose my own code")!.click());
      expect(document.body.querySelector("fieldset[data-field=is_contra]")?.hasAttribute("disabled")).toBe(true);
      expect(document.body.querySelector("fieldset[data-field=subtype]")).toBeNull();
      typeInto(nameInput(), "Science lab supplies");
      typeInto(document.body.querySelector("#new-account-code") as HTMLInputElement, "5200");
      await act(async () => { findButton("Create account")!.click(); });
      const body = created()[0];
      expect(body).not.toHaveProperty("is_contra");
      expect(body).not.toHaveProperty("parent");
      expect(body).not.toHaveProperty("subtype");
      expect(body).toMatchObject({ code: "5200", is_postable: true });
    });

    it("goes back to a chosen code from the accountant's panel", () => {
      openDrawer();
      act(() => kind("Money going out").click());
      act(() => findButton("Choose my own code")!.click());
      act(() => findButton("Let the system choose the code")!.click());
      expect(document.body.querySelector("#new-account-code")).toBeNull();
      expect(document.body.textContent).toContain("Code 5540, chosen for you.");
    });

    it("shows a 400 from the server inline", async () => {
      const message = "Code 2195 is kept for the system account Unidentified Receipts. Use 2196 instead.";
      mocks.create = vi.fn().mockRejectedValue({ status: 400, data: { message } });
      openDrawer();
      act(() => kind("Something we owe").click());
      typeInto(nameInput(), "Deposits");
      await act(async () => { findButton("Create account")!.click(); });
      expect(document.body.querySelector("[role=alert]")?.textContent).toBe(message);
    });

    describe("common accounts", () => {
      const suggestion = (key: string, over: Record<string, unknown> = {}) => ({
        key, name: "Electricity and water", account_type: "EXPENSE", description: "Power and water bills.", ifrs_line: "Utilities", already_added: false, ...over,
      });

      it("adds one in a single click, without a code", async () => {
        mocks.suggestions = [suggestion("utilities"), suggestion("tuition", { name: "Tuition fees", account_type: "INCOME", description: "Fees parents pay each term." })];
        openDrawer();
        const body = document.body.textContent ?? "";
        expect(body).toContain("Common accounts");
        expect(body.indexOf("Money coming in")).toBeLessThan(body.indexOf("Money going out"));
        await act(async () => { findButton("Add Electricity and water")!.click(); });
        expect(created()).toEqual([{ entity: "BSS", account_type: "EXPENSE", name: "Electricity and water", description: "Power and water bills." }]);
        expect(created()[0]).not.toHaveProperty("ifrs_line");
      });

      it("shows an account already in the chart as Added and cannot add it again", () => {
        mocks.suggestions = [suggestion("utilities", { already_added: true })];
        openDrawer();
        const added = findButton("Added")!;
        expect(added.disabled).toBe(true);
        act(() => added.click());
        expect(mocks.create).not.toHaveBeenCalled();
        expect(findButton("Add Electricity and water")).toBeUndefined();
      });

      it("leaves the description out of the body when its switch is read-only", async () => {
        mocks.fieldAccess = { "finance.account": { read_only: ["description"] } };
        mocks.suggestions = [suggestion("utilities")];
        openDrawer();
        expect(document.body.querySelector("fieldset[data-field=description]")?.hasAttribute("disabled")).toBe(true);
        await act(async () => { findButton("Add Electricity and water")!.click(); });
        expect(created()).toEqual([{ entity: "BSS", account_type: "EXPENSE", name: "Electricity and water" }]);
      });
    });
  });
});
