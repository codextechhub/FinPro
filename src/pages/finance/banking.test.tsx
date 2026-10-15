/**
 * The bank account master and its drawer.
 *
 * Mrs Bello, the bursar, sees the list, the drawer, the reconciliation runs and
 * the forms under Field Access on `finance.bankaccount`. An account's name
 * carries no switch. The bank, currency, ledger account and the active, main
 * and collection flags are typed in, each under its own switch; the balances,
 * reconciliation progress, recent ledger activity and provider subaccount are
 * worked out and read-only. The difference between the books and the statement
 * is read only by a role that may read both, so hiding either balance takes the
 * difference with it. Hidden values leave their headings with them; a
 * read-only value is greyed and left out of what is saved.
 *
 * A bank account's number follows the same switches:
 *
 *   1. hidden: the settings form has no Account number field at all;
 *   2. read-only: the field is shown greyed and a save does not send it;
 *   3. a refused save shows the backend's message under the field it names,
 *      not as a generic toast.
 *
 * A bulk-imported statement is corrected from its own row: it offers a
 * rollback while the server names the import that published it, and the
 * rollback goes to that batch and job.
 */

import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bankBalances, bankOptionLabel, cardColumns } from "./bank-account-access";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  update: vi.fn(),
  create: vi.fn(),
  rollback: vi.fn(),
  dispatch: vi.fn(),
  rows: [] as unknown[],
  detail: null as unknown,
  statement: undefined as unknown,
  correct: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

vi.mock("@/redux/services/finance/ops-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUpdateBankAccountMutation: () => [mocks.update, { isLoading: false }],
  useGetBankStatementQuery: () => ({ data: { data: mocks.statement }, isFetching: false }),
  useUpdateBankStatementMutation: () => [mocks.correct, { isLoading: false }],
  useCreateBankAccountMutation: () => [mocks.create, { isLoading: false }],
  useGetBankAccountsQuery: () => ({ data: { data: mocks.rows }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetBankAccountQuery: () => ({ data: { data: mocks.detail } }),
  useAutoReconcileMutation: () => [vi.fn(), { isLoading: false }],
  useGetStatementLinesQuery: () => ({ data: { data: [] }, isFetching: false }),
  useDeleteBankStatementLineMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CurrencyPicker: () => null,
  AccountPicker: () => null,
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN", entity: null, isLoading: false }),
}));

vi.mock("./finance-shell", () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("./bank-documents", () => ({ BankDocumentsSection: () => null }));
vi.mock("./online-payments", () => ({ CollectionSubaccountBlock: () => null }));
vi.mock("./inter-branch/use-inter-branch", () => ({
  useInterBranchReader: () => ({ applies: false, reach: { wholeSchool: false }, keys: {}, branches: [] }),
}));
vi.mock("../../host", async () => (await import("../../host-fake")).fakeHost({
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }], isLoading: false, isError: false }),
  hostBranchLens: () => ({ applies: false, pinnedBranch: 1, branch: 1, choices: [{ id: 1, name: "Ikeja" }], isLoading: false }),
}));

vi.mock("@/redux/services/dashboard/import-api", () => ({
  useCancelImportBatchMutation: () => [vi.fn(), { isLoading: false }],
  useRollbackImportJobMutation: () => [mocks.rollback, { isLoading: false }],
}));
vi.mock("@/redux/store", () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import BankingPage, { SettingsTab, StatementsTab, bankDescription, searchPlaceholder } from "./banking";
import { resolveFieldAccess } from "@/components/finance-ui";
import type { BankAccount, BankAccountDetail, BankStatement } from "@/redux/services/finance/ops-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT: BankAccount = {
  id: 7, name: "GTBank Operations", bank_name: "GTBank", account_number: "0123456789",
  gl_account: "1110", gl_account_id: 3, currency: "NGN", is_active: true, is_primary: true,
  is_primary_collection: false, book_balance: 0, book_balance_naira: "0.00",
  unreconciled_count: 0, last_reconciled_at: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.update.mockReset();
  mocks.rollback.mockReset();
  mocks.dispatch.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const accountNumberField = () => container.querySelector("fieldset[data-field=account_number]");
const saveButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Save changes"))!;

describe("Bank account settings under Field Access", () => {
  it("has no account number field when the user cannot read it", () => {
    mocks.fieldAccess = { "finance.bankaccount": { hidden: ["account_number"] } };
    const { account_number: _hidden, ...withoutNumber } = ACCOUNT;
    void _hidden;
    const record = { ...withoutNumber, _read_only_fields: [] } as BankAccount;
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    expect(accountNumberField()).toBeNull();
    expect(container.textContent).not.toContain("Account number");
    expect(container.textContent).toContain("Bank name");
  });

  it("greys a read-only account number and leaves it out of the save", async () => {
    const record = { ...ACCOUNT, _read_only_fields: ["account_number"] };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Saved." }) });
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    const field = accountNumberField() as HTMLFieldSetElement;
    expect(field.disabled).toBe(true);
    expect(field.querySelector("input")!.value).toBe("0123456789");
    await act(async () => { saveButton().click(); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("account_number");
  });

  it("sends an account number the user may change", async () => {
    const record = { ...ACCOUNT, _read_only_fields: [] };
    mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Saved." }) });
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    await act(async () => { saveButton().click(); });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ account_number: "0123456789" });
  });

  it("shows a field_write_denied refusal under the account number", async () => {
    const record = { ...ACCOUNT, _read_only_fields: [] };
    mocks.update.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 403,
        data: {
          success: false,
          message: "You do not have permission to change: account_number.",
          error: { code: "field_write_denied", detail: { account_number: ["You do not have permission to change this field."] } },
        },
      }),
    });
    act(() => root.render(<SettingsTab account={record} record={record} entity="COD" canEdit />));
    await act(async () => { saveButton().click(); });
    const alert = accountNumberField()!.querySelector("[role=alert]");
    expect(alert?.textContent).toBe("You do not have permission to change this field.");
  });
});

const statement = (over: Partial<BankStatement>): BankStatement => ({
  id: 1, statement_date: "2026-03-31", period_label: "March 2026",
  opening_balance: 0, opening_balance_naira: "0.00",
  closing_balance: 0, closing_balance_naira: "0.00",
  line_count: 2, status: "UPLOADED", status_display: "Uploaded",
  can_edit: false, edit_block_reason: "Bulk-imported statements must be rolled back and re-imported.",
  import_rollback: null,
  ...over,
});

const render = (statements: BankStatement[]) =>
  act(() =>
    root.render(<StatementsTab detail={{ statements }} canEdit onEdit={() => {}} />),
  );

const rollBackButton = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="Roll back statement ${label}"]`);

describe("StatementsTab rollback", () => {
  it("offers a rollback only on a statement the server names an import for", () => {
    render([
      statement({ id: 1, period_label: "March 2026", import_rollback: { batch_id: 40, job_id: 41 } }),
      statement({ id: 2, period_label: "February 2026", can_edit: true, edit_block_reason: null }),
    ]);
    expect(rollBackButton("March 2026")).not.toBeNull();
    expect(rollBackButton("February 2026")).toBeNull();
  });

  it("rolls back the named batch and job with the reason given", async () => {
    mocks.rollback.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render([statement({ import_rollback: { batch_id: 40, job_id: 41 } })]);

    await act(async () => rollBackButton("March 2026")!.click());
    const reason = document.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(reason, "  Imported into the wrong account ");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent === "Roll back statement")!;
    await act(async () => confirm.click());

    expect(mocks.rollback).toHaveBeenCalledWith({
      batchId: 40, jobId: 41, reason: "Imported into the wrong account",
    });
    expect(mocks.dispatch).toHaveBeenCalled();
  });
});

// ── Field Access across the list, drawer and forms ───────────────────────────

const FULL_ACCOUNT: BankAccount = {
  id: 7, branch_id: 1, name: "GTBank Operations", bank_name: "GTBank", account_number: "0123456789",
  gl_account: "1110", gl_account_name: "Bank - GTBank", gl_account_id: 41, currency: "NGN", is_active: true, is_primary: true,
  is_primary_collection: true, book_balance: 90_000_000, book_balance_naira: "900,000.00", unreconciled_count: 3,
  last_reconciled_at: "2026-09-30", _read_only_fields: [],
};
const DETAIL: BankAccountDetail = {
  ...FULL_ACCOUNT,
  metrics: { book_balance: 90_000_000, statement_balance: 88_000_000, unreconciled_diff: 2_000_000, unreconciled_count: 3 },
  transactions: [{ id: 1, date: "2026-09-02", description: "School fees", reference: "RC-1", debit: 100_000, credit: 0, running_balance: 90_000_000, matched: true }],
  statements: [{
    id: 9, statement_date: "2026-09-30", period_label: "September 2026",
    opening_balance: 85_000_000, opening_balance_naira: "850,000.00",
    closing_balance: 88_000_000, closing_balance_naira: "880,000.00",
    line_count: 14, status: "UPLOADED", status_display: "Uploaded",
    can_edit: true, edit_block_reason: null, import_rollback: null,
  }],
  reconciliations: [{
    id: 5, as_of_date: "2026-09-30", book_balance: 90_000_000, book_balance_naira: "", statement_balance: 88_000_000, statement_balance_naira: "",
    difference: 2_000_000, difference_naira: "", matched_count: 12, status: "UNBALANCED", status_display: "Unbalanced", performed_by_name: "Mrs Bello", created_at: "2026-09-30T10:00:00Z",
  }],
};

const without = <T extends object>(source: T, ...keys: string[]) => Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key))) as T;

beforeEach(() => {
  mocks.rows = [FULL_ACCOUNT]; mocks.detail = DETAIL; mocks.create.mockReset();
  mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Bank account updated." }) });
  mocks.create.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Bank account created." }) });
});

const RESOURCE = "finance.bankaccount";
/** Hides names for the role and feeds the screens the payloads the server would send it. */
const hide = (...names: string[]) => {
  mocks.fieldAccess = { [RESOURCE]: { hidden: names } };
  mocks.rows = [without(FULL_ACCOUNT, ...names)];
  const detail = without(DETAIL, ...names) as BankAccountDetail;
  mocks.detail = {
    ...without(detail, "metrics", "transactions", "reconciliations"),
    metrics: detail.metrics && without(detail.metrics, ...names),
    ...(names.includes("transactions") ? {} : { transactions: detail.transactions?.map((t) => without(t, ...names)) }),
    reconciliations: detail.reconciliations.map((r) => without(r, ...names)),
    // The server withholds a statement's opening and closing figures with the statement balance.
    statements: detail.statements.map((s) => (
      names.includes("statement_balance")
        ? without(s, "opening_balance", "opening_balance_naira", "closing_balance", "closing_balance_naira")
        : s
    )),
  };
};
const mount = () => act(() => root.render(<MemoryRouter><BankingPage /></MemoryRouter>));
const page = () => container.textContent ?? "";
const headers = (scope: ParentNode = container) => Array.from(scope.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
const aligned = () => Array.from(container.querySelectorAll("tbody tr")).every((tr) => tr.querySelectorAll("td").length === container.querySelectorAll("thead th").length);
const drawer = () => document.body.querySelector("[role=dialog]") as HTMLElement;
const openDrawer = () => act(() => (container.querySelector("tbody tr") as HTMLElement).click());
const tabButton = (label: string) => Array.from(drawer().querySelectorAll("button")).find((b) => b.textContent?.trim().startsWith(label));
const openTab = (label: string) => act(() => (tabButton(label) as HTMLElement).click());
const cards = (labels: string[], scope: ParentNode = container) => labels.filter((label) => scope.textContent?.includes(label));
const LIST_CARDS = ["Total bank balance", "Active accounts", "Unreconciled lines", "Last reconciled"];
const DRAWER_CARDS = ["Book balance", "Statement balance", "Unreconciled diff"];

describe("the list with full access", () => {
  it("shows every column and card, aligned, and names the searchable columns", () => {
    mount();
    expect(headers()).toEqual(["Account", "GL", "Currency", "Book balance", "Last reconciled", "Status"]);
    expect(aligned()).toBe(true);
    expect(cards(LIST_CARDS)).toEqual(LIST_CARDS);
    expect((container.querySelector("input[placeholder^='Search']") as HTMLInputElement).placeholder).toBe("Search name, bank or GL");
    expect(page()).toContain("Primary");
    expect(page()).toContain("Collection");
  });
});

describe("the list under restrictions", () => {
  it("removes the ledger account, currency and status columns, with the active card, when hidden", () => {
    hide("gl_account", "gl_account_name", "gl_account_id", "currency", "is_active");
    mount();
    expect(headers()).toEqual(["Account", "Book balance", "Last reconciled"]);
    expect(aligned()).toBe(true);
    expect(cards(LIST_CARDS)).toEqual(["Total bank balance", "Unreconciled lines", "Last reconciled"]);
  });

  it("removes the balance column and card with the book balance", () => {
    hide("book_balance", "book_balance_naira", "running_balance");
    mount();
    expect(headers()).toEqual(["Account", "GL", "Currency", "Last reconciled", "Status"]);
    expect(aligned()).toBe(true);
    expect(cards(LIST_CARDS)).not.toContain("Total bank balance");
  });

  it("removes the reconciliation column and cards together", () => {
    hide("unreconciled_count", "last_reconciled_at");
    mount();
    expect(headers()).not.toContain("Last reconciled");
    expect(cards(LIST_CARDS)).toEqual(["Total bank balance", "Active accounts"]);
  });

  it("leaves out the main and collection marks when those flags are hidden", () => {
    hide("is_primary", "is_primary_collection");
    mount();
    expect(page()).not.toContain("Primary");
    expect(page()).not.toContain("Collection");
  });

  it("names only the searchable columns that remain", () => {
    expect(searchPlaceholder(true, true)).toBe("Search name, bank or GL");
    expect(searchPlaceholder(false, true)).toBe("Search name or GL");
    expect(searchPlaceholder(false, false)).toBe("Search name");
    hide("bank_name", "gl_account", "gl_account_name", "gl_account_id");
    mount();
    expect((container.querySelector("input[placeholder^='Search']") as HTMLInputElement).placeholder).toBe("Search name");
  });
});

describe("the drawer with full access", () => {
  it("shows the three balance cards, the activity with its balance, and the runs with every balance", () => {
    mount(); openDrawer();
    expect(cards(DRAWER_CARDS, drawer())).toEqual(DRAWER_CARDS);
    expect(drawer().textContent).toContain("GTBank · 1110 · 0123456789");
    expect(headers(drawer())).toEqual(["Date", "Description", "Reference", "Debit", "Credit", "Balance", ""]);
    openTab("Reconciliations");
    expect(headers(drawer())).toEqual(["Date", "Book", "Statement", "Diff", "Matched", "Status", "By"]);
    expect(drawer().querySelector("tbody tr")?.querySelectorAll("td").length).toBe(7);
  });
});

describe("the drawer under restrictions", () => {
  it("takes the difference with either balance, in the cards and in every run", () => {
    hide("book_balance", "book_balance_naira", "running_balance", "unreconciled_diff", "difference", "difference_naira");
    mount(); openDrawer();
    expect(cards(DRAWER_CARDS, drawer())).toEqual(["Statement balance"]);
    expect(headers(drawer())).toEqual(["Date", "Description", "Reference", "Debit", "Credit", ""]);
    openTab("Reconciliations");
    expect(headers(drawer())).toEqual(["Date", "Statement", "Matched", "Status", "By"]);
    expect(drawer().querySelector("tbody tr")?.querySelectorAll("td").length).toBe(5);
  });

  it("removes the statement balance and the difference when the statement balance is hidden", () => {
    hide("statement_balance", "statement_balance_naira", "unreconciled_diff", "difference", "difference_naira");
    mount(); openDrawer();
    expect(cards(DRAWER_CARDS, drawer())).toEqual(["Book balance"]);
    openTab("Reconciliations");
    expect(headers(drawer())).toEqual(["Date", "Book", "Matched", "Status", "By"]);
  });

  it("shows a statement's opening and closing with the statement balance, edit enabled", () => {
    mount(); openDrawer(); openTab("Statements");
    expect(headers(drawer())).toEqual(["Statement date", "Period", "Opening", "Closing", "Lines", "Status", ""]);
    expect(drawer().querySelector("tbody tr")?.querySelectorAll("td").length).toBe(7);
    expect(drawer().textContent).toContain("850,000.00");
    expect(drawer().textContent).toContain("880,000.00");
    expect(drawer().querySelector<HTMLButtonElement>("button[aria-label^='Edit statement']")?.disabled).toBe(false);
  });

  it("takes a statement's opening and closing columns with the statement balance, and leaves the edit open", () => {
    hide("statement_balance", "statement_balance_naira", "unreconciled_diff", "difference", "difference_naira");
    mount(); openDrawer(); openTab("Statements");
    expect(headers(drawer())).toEqual(["Statement date", "Period", "Lines", "Status", ""]);
    expect(drawer().querySelector("tbody tr")?.querySelectorAll("td").length).toBe(5);
    expect(drawer().textContent).toContain("September 2026");
    expect(drawer().textContent).not.toMatch(/undefined|NaN/);
    expect(drawer().textContent).not.toContain("850,000.00");
    expect(drawer().textContent).not.toContain("880,000.00");
    const edit = drawer().querySelector<HTMLButtonElement>("button[aria-label^='Edit statement']")!;
    expect(edit.disabled).toBe(false);
    expect(edit.title).toBe("Edit statement");
  });

  it("keeps a statement's figures when only the book balance is hidden", () => {
    hide("book_balance", "book_balance_naira", "running_balance", "unreconciled_diff", "difference", "difference_naira");
    mount(); openDrawer(); openTab("Statements");
    expect(headers(drawer())).toEqual(["Statement date", "Period", "Opening", "Closing", "Lines", "Status", ""]);
    expect(drawer().textContent).toContain("880,000.00");
  });

  it("removes every card when no balance may be read", () => {
    hide("book_balance", "book_balance_naira", "running_balance", "statement_balance", "statement_balance_naira", "unreconciled_diff", "difference", "difference_naira");
    mount(); openDrawer();
    expect(cards(DRAWER_CARDS, drawer())).toEqual([]);
  });

  it("drops the activity tab when the recent activity is hidden and opens the next section", () => {
    hide("transactions");
    mount(); openDrawer();
    expect(tabButton("Transactions")).toBeUndefined();
    expect(drawer().textContent).toContain("No statement lines");
  });

  it("describes the account with only the values the role may read", () => {
    const described = (...hidden: string[]) => {
      const record = without(FULL_ACCOUNT, ...hidden);
      return bankDescription(resolveFieldAccess({ [RESOURCE]: { hidden } }, RESOURCE, record), record);
    };
    expect(described()).toBe("GTBank · 1110 · 0123456789");
    expect(described("account_number")).toBe("GTBank · 1110");
    expect(described("bank_name", "gl_account", "account_number")).toBe("");
  });

  it("drops the status pill from the footer when the active flag is hidden", () => {
    hide("is_active");
    mount(); openDrawer();
    expect(drawer().textContent).not.toContain("Active");
  });
});

describe("the settings tab", () => {
  const mountSettings = (record: BankAccount, canEdit = true) =>
    act(() => root.render(<SettingsTab account={record} record={record} entity="HOLYCROSS" canEdit={canEdit} />));
  const field = (name: string) => container.querySelector(`[data-field="${name}"]`) as HTMLElement | null;
  const typeInto = (el: Element | null | undefined, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = () => act(async () => { (Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Save changes")) as HTMLElement).click(); });

  it("sends the writable values and the name", async () => {
    mountSettings(FULL_ACCOUNT);
    typeInto(field("bank_name")?.querySelector("input"), "Guaranty Trust");
    await save();
    expect(mocks.update.mock.calls.at(-1)?.[0]).toMatchObject({
      id: 7, name: "GTBank Operations", bank_name: "Guaranty Trust", account_number: "0123456789", currency: "NGN",
      is_active: true, is_primary: true, is_primary_collection: true,
    });
  });

  it("greys a read-only value and never sends it", async () => {
    const record: BankAccount = { ...FULL_ACCOUNT, _read_only_fields: ["bank_name", "is_primary_collection"] };
    mountSettings(record);
    expect(field("bank_name")?.getAttribute("data-read-only")).toBe("true");
    expect(field("is_primary_collection")?.getAttribute("data-read-only")).toBe("true");
    await save();
    const body = mocks.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("bank_name");
    expect(body).not.toHaveProperty("is_primary_collection");
    expect(body).toHaveProperty("is_active", true);
  });

  it("removes a hidden currency and the whole flags row once every flag is hidden", async () => {
    mocks.fieldAccess = { [RESOURCE]: { hidden: ["currency", "is_active", "is_primary", "is_primary_collection"] } };
    mountSettings(without(FULL_ACCOUNT, "currency", "is_active", "is_primary", "is_primary_collection"));
    expect(container.textContent).not.toContain("Currency");
    expect(container.textContent).not.toContain("Collection");
    await save();
    const body = mocks.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    for (const key of ["currency", "is_active", "is_primary", "is_primary_collection"]) expect(body).not.toHaveProperty(key);
  });

  it("shows a refusal beside the field it names", async () => {
    mocks.update.mockReturnValue({ unwrap: () => Promise.reject({ status: 403, data: { error: { code: "field_write_denied", detail: { bank_name: ["You may not change the bank."] } } } }) });
    mountSettings(FULL_ACCOUNT);
    await save();
    expect(field("bank_name")?.textContent).toContain("You may not change the bank.");
  });
});

describe("the new account form", () => {
  const openCreate = () => act(() => (Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("New bank account")) as HTMLElement).click());
  const form = () => document.body.querySelector("[role=dialog]") as HTMLElement;
  const field = (name: string) => form().querySelector(`[data-field="${name}"]`) as HTMLElement | null;

  it("offers every field to a role with full access", () => {
    mount(); openCreate();
    for (const name of ["bank_name", "account_number", "gl_account", "currency", "is_active", "is_primary", "is_primary_collection"]) expect(field(name)).not.toBeNull();
  });

  it("removes the hidden bank, currency and flags, and keeps the ledger account open on create", () => {
    mocks.fieldAccess = { [RESOURCE]: {
      hidden: ["bank_name", "currency", "is_active", "is_primary", "is_primary_collection", "gl_account", "gl_account_name", "gl_account_id"],
      open_on_create: ["gl_account", "gl_account_name", "gl_account_id"],
    } };
    mount(); openCreate();
    for (const name of ["bank_name", "currency", "is_active", "is_primary", "is_primary_collection"]) expect(field(name)).toBeNull();
    expect(field("gl_account")).not.toBeNull();
    expect(field("gl_account")?.getAttribute("data-read-only")).toBeNull();
  });
});

describe("the helpers", () => {
  it("reads the difference only when both balances are readable", () => {
    const shown = (hidden: string[]) => bankBalances(resolveFieldAccess({ [RESOURCE]: { hidden } }, RESOURCE));
    expect(shown([])).toEqual({ book: true, statement: true, difference: true });
    expect(shown(["book_balance"])).toEqual({ book: false, statement: true, difference: false });
    expect(shown(["statement_balance"])).toEqual({ book: true, statement: false, difference: false });
    expect(shown(["difference"])).toEqual({ book: true, statement: true, difference: false });
  });

  it("labels a collection account option with only what its role may read", () => {
    expect(bankOptionLabel({ name: "GTBank Operations", bank_name: "GTBank", currency: "NGN" })).toBe("GTBank Operations · GTBank · NGN");
    expect(bankOptionLabel({ name: "GTBank Operations" })).toBe("GTBank Operations");
  });

  it("stacks summary cards on a phone and spreads them from sm up", () => {
    expect(cardColumns(1)).toBe("grid-cols-1");
    expect(cardColumns(3)).toBe("grid-cols-1 sm:grid-cols-3");
    expect(cardColumns(4)).toContain("lg:grid-cols-4");
  });
});

/**
 * Mrs Bello corrects September's statement for GTBank Operations. A reader of
 * the statement balance sees the opening balance and the recalculated closing
 * balance, and the correction sends the opening balance. Mr Eze, an auditor
 * whose role may not read statement balances, corrects the same statement's
 * lines: the form has no opening balance and the request carries none, so the
 * server keeps the stored one. A refusal of the opening balance shows beside it.
 */
describe("correcting a statement", () => {
  const FULL_STATEMENT = {
    ...DETAIL.statements[0],
    lines: [{
      id: 31, bank_account_id: 7, statement_id: 9, txn_date: "2026-09-03", description: "School fees", reference: "RC-1",
      amount: 100_000, amount_naira: "1,000.00", status: "UNMATCHED", matched_line_id: null, adjusting_journal_id: null,
      match_source: "", match_source_display: "", matched_reference: null, external_id: "", reconciled_at: null,
      can_delete: true, delete_block_reason: null,
    }],
  };
  const HIDDEN_BALANCES = ["statement_balance", "statement_balance_naira", "unreconciled_diff", "difference", "difference_naira"];

  beforeEach(() => {
    mocks.correct.mockReset();
    mocks.correct.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Bank statement corrected." }) });
    mocks.statement = FULL_STATEMENT;
  });

  const editDrawer = () => [...document.body.querySelectorAll<HTMLElement>("[role=dialog]")].find((d) => d.textContent?.includes("Correct a manually imported statement"))!;
  const openEdit = () => {
    mount(); openDrawer(); openTab("Statements");
    act(() => drawer().querySelector<HTMLButtonElement>("button[aria-label^='Edit statement']")!.click());
  };
  const save = async () => {
    const button = [...editDrawer().querySelectorAll("button")].find((b) => b.textContent?.includes("Save corrections"))!;
    await act(async () => button.click());
  };

  it("offers the opening balance and the closing balance to a reader of the statement balance, and sends it", async () => {
    openEdit();
    expect(editDrawer().textContent).toContain("Opening balance");
    expect(editDrawer().textContent).toContain("Calculated closing balance");
    await save();
    expect(mocks.correct).toHaveBeenCalledTimes(1);
    expect(mocks.correct.mock.calls[0][0]).toMatchObject({ id: 7, statementId: 9, entity: "HOLYCROSS", opening_balance: 85_000_000 });
  });

  it("omits the opening balance for a role that cannot read it, and still saves the lines", async () => {
    hide(...HIDDEN_BALANCES);
    mocks.statement = without(FULL_STATEMENT, "opening_balance", "opening_balance_naira", "closing_balance", "closing_balance_naira");
    openEdit();
    expect(editDrawer().textContent).not.toContain("Calculated closing balance");
    expect(editDrawer().querySelector("input[type=number][value='850000']")).toBeNull();
    expect(editDrawer().textContent).toContain("Your role cannot read this statement");
    expect(editDrawer().textContent).not.toMatch(/undefined|NaN/);
    await save();
    expect(mocks.correct).toHaveBeenCalledTimes(1);
    const body = mocks.correct.mock.calls[0][0];
    expect("opening_balance" in body).toBe(false);
    expect(body.lines).toHaveLength(1);
  });

  it("shows a refused opening balance beside its field", async () => {
    mocks.correct.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 403,
        data: { error: { code: "field_write_denied", detail: { opening_balance: ["You do not have permission to change this field."] } } },
      }),
    });
    openEdit();
    await save();
    const alert = editDrawer().querySelector("label [role=alert]");
    expect(alert?.textContent).toBe("You do not have permission to change this field.");
    expect(alert?.closest("label")?.textContent).toContain("Opening balance");
  });
});
