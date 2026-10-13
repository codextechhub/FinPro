/**
 * The reconciliation workbench for Mrs Bello, under Field Access.
 *
 * Its three balance cards (statement, book, difference) follow the bank
 * account's balance switches, and the difference needs both balances. A hidden
 * figure leaves its card, the warning that repeats it and the printed report;
 * the bank and ledger account leave the line under the title when hidden.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount } from "@/redux/services/finance/ops-types";

const mocks = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  account: null as unknown,
  detail: null as unknown,
  printed: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.access,
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("./finance-shell", () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "HOLYCROSS", currency: "NGN", entity: null, isLoading: false }),
  usePostingWindow: () => ({}),
}));
vi.mock("../../utils/finance-print", () => ({ printBankReconciliation: (input: unknown) => mocks.printed(input) }));
vi.mock("@/redux/services/finance/ops-api", async (importOriginal) => {
  const mutation = () => [vi.fn(), { isLoading: false }];
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useGetBankAccountsQuery: () => ({ data: { data: [mocks.account] } }),
    useGetBankAccountQuery: () => ({ data: { data: mocks.detail } }),
    useGetStatementLinesQuery: () => ({ data: { data: [] } }),
    useGetBookLinesQuery: () => ({ data: { data: [], pagination: undefined } }),
    useAutoReconcileMutation: mutation, useMatchStatementLineMutation: mutation, useAdjustStatementLineMutation: mutation,
    useUnmatchStatementLineMutation: mutation, useCompleteReconciliationMutation: mutation,
    useIgnoreStatementLineMutation: mutation, useGroupMatchStatementLineMutation: mutation, useSplitMatchLineMutation: mutation,
  };
});

import BankReconciliationPage from "./bank-reconciliation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT: BankAccount = { id: 7, name: "GTBank Operations", bank_name: "GTBank", gl_account: "1110", is_primary: true, book_balance: 9_000_000 };
const METRICS = { book_balance: 9_000_000, statement_balance: 8_800_000, unreconciled_diff: 200_000, unreconciled_count: 2 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {}; mocks.account = ACCOUNT; mocks.detail = { ...ACCOUNT, metrics: METRICS, statements: [], reconciliations: [] };
  mocks.printed.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const RESOURCE = "finance.bankaccount";
const without = <T extends object>(source: T, ...keys: string[]) => Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key))) as T;
const restrict = (...names: string[]) => {
  mocks.access = { [RESOURCE]: { hidden: names } };
  mocks.account = without(ACCOUNT, ...names);
  mocks.detail = { ...without(ACCOUNT, ...names), metrics: without(METRICS, ...names), statements: [], reconciliations: [] };
};
const mount = () => act(() => root.render(<BankReconciliationPage />));
const kpis = () => ["Statement balance", "Book balance", "Difference"].filter((label) => container.textContent?.includes(label));
const print = () => act(() => (Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Reconciliation report")) as HTMLElement).click());

describe("the balance cards", () => {
  it("shows the statement, book and difference with full access, and prints them", () => {
    mount();
    expect(kpis()).toEqual(["Statement balance", "Book balance", "Difference"]);
    expect(container.textContent).toContain("Unreconciled difference");
    print();
    expect(mocks.printed.mock.calls.at(-1)?.[0]).toMatchObject({ book: 9_000_000, statement: 8_800_000, difference: 200_000 });
  });

  it("takes the difference, its warning and its printed figure with the book balance", () => {
    restrict("book_balance", "book_balance_naira", "running_balance", "unreconciled_diff", "difference", "difference_naira");
    mount();
    expect(kpis()).toEqual(["Statement balance"]);
    expect(container.textContent).not.toContain("Unreconciled difference");
    print();
    const printed = mocks.printed.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(printed.statement).toBe(8_800_000);
    expect(printed.book).toBeUndefined();
    expect(printed.difference).toBeUndefined();
  });

  it("leaves no balance card when neither balance may be read", () => {
    restrict("book_balance", "book_balance_naira", "statement_balance", "statement_balance_naira", "unreconciled_diff", "difference", "difference_naira");
    mount();
    expect(kpis()).toEqual([]);
    expect(container.textContent).toContain("Match progress");
  });
});

describe("the line under the title", () => {
  it("names the bank and ledger account, and only those the reader may see", () => {
    mount();
    expect(container.textContent).toContain("GTBank · 1110");
    restrict("bank_name", "gl_account");
    act(() => root.render(<BankReconciliationPage />));
    expect(container.textContent).not.toContain("GTBank ·");
    expect(container.textContent).not.toContain("1110");
  });
});
