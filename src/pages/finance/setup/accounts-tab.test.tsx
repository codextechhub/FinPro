/**
 * The chart of accounts is the school's: every branch posts to it, so the
 * server takes a new account, or an edit to an account no bank backs, only from
 * a reader who covers the whole school. Bright Star's proprietor covers every
 * branch; Mrs Adeyemi keeps Lekki's books and holds the same keys; Corona has
 * one branch, and its bursar, pinned to it, covers the whole school.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  wholeSchool: true,
  branchIds: null as number[] | null,
  held: new Set<string>(),
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
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({
    wholeSchool: mocks.wholeSchool,
    branchIds: mocks.branchIds,
    covers: (ids: number[]) => mocks.wholeSchool || (ids.length > 0 && ids.every((id) => mocks.branchIds?.includes(id))),
  }),
}));
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => v }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ currency: "NGN" }),
}));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetChartOfAccountsQuery: () => ({
    data: { data: [{
      id: 1, code: "4000", name: "Fees income", account_type: "INCOME", normal_balance: "CREDIT", is_contra: false,
      is_postable: true, is_active: true, parent_id: null, parent_code: null, subtype: "", balance: null, tag: null,
    }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useCreateAccountMutation: () => [vi.fn(), { isLoading: false }],
  useGetAccountDetailQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useGetAccountActivityQuery: () => ({ data: undefined, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useUpdateAccountMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../../permissions";
import type { Account } from "@/redux/services/finance/setup-types";
import { AccountSettings, AccountsTab } from "./accounts-tab";

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
  });

  it("are read-only without the update key, whatever the reach", () => {
    mocks.held = new Set([P.FIN_CREATE_ACCOUNT]);
    act(() => root.render(<AccountSettings entity="BSS" account={account(null)} onSaved={vi.fn()} />));
    expect(button("Save changes")).toBeUndefined();
    expect(container.textContent).toContain("permission to edit accounts");
  });
});
