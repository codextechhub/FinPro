/**
 * The receivable account picker reads the tagged chart, not the balances.
 *
 * Chukwuemeka, the Holy Cross bursar, may add customers but not open the chart
 * of accounts. The chart with balances refuses him, so a picker built on it was
 * empty. The tagged chart names the control accounts without any balance and
 * is readable on any finance key; the picker must use it and offer only the
 * postable asset accounts tagged CONTROL.
 *
 * The bank account picker offers a document only its own branch's accounts:
 * Mrs Okafor covers Ikeja and Lekki, and the server refuses to pay an Ikeja
 * claim from Lekki's account or from an account not yet given a branch. At a
 * school with one branch every account is that branch's, so all are offered.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  options: [] as { value: string; label: string }[],
  taggedCalls: 0,
  chartCalls: 0,
  branches: [] as { id: number; name: string }[] | undefined,
  banks: [] as { id: number; name: string; bank_name: string; branch_id: number | null; is_active: boolean }[],
}));

vi.mock("../../host", () => ({
  useBranches: () => ({ data: mocks.branches, isLoading: false, isError: mocks.branches === undefined }),
}));

vi.mock("@/components/custom/search-select", () => ({
  SearchSelect: ({ options }: { options: { value: string; label: string }[] }) => {
    mocks.options = options;
    return null;
  },
}));

const account = (code: string, name: string, account_type: string, tag: string | null, is_postable = true) =>
  ({ id: Number(code), code, name, account_type, tag, is_postable, is_active: true, balance: null });

vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetAccountsQuery: () => ({ data: undefined, isLoading: false }),
  useGetCurrenciesQuery: () => ({ data: undefined, isLoading: false }),
  useGetTaxCodesQuery: () => ({ data: undefined, isLoading: false }),
  useGetCostCentersQuery: () => ({ data: undefined, isLoading: false }),
  useGetChartOfAccountsQuery: () => {
    mocks.chartCalls += 1;
    return { data: undefined, isLoading: false };
  },
  useGetTaggedAccountsQuery: () => {
    mocks.taggedCalls += 1;
    return {
      isLoading: false,
      data: {
        data: [
          account("1200", "Accounts Receivable", "ASSET", "CONTROL"),
          account("1100", "Bank", "ASSET", "CASH"),
          account("2100", "Accounts Payable", "LIABILITY", "CONTROL"),
          account("1000", "Assets", "ASSET", "CONTROL", false),
        ],
      },
    };
  },
}));

const bank = (id: number, name: string, branch_id: number | null) =>
  ({ id, name, bank_name: "", branch_id, is_active: true });

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetTaxObligationsQuery: () => ({ data: undefined, isLoading: false }),
  useGetPettyCashFundsQuery: () => ({ data: undefined, isLoading: false }),
  useGetBankAccountsQuery: () => ({ isLoading: false, data: { data: mocks.banks } }),
}));

import { BankAccountPicker, ReceivableAccountPicker } from "./pickers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.taggedCalls = 0;
  mocks.chartCalls = 0;
  mocks.branches = [{ id: 10, name: "Ikeja Branch" }, { id: 20, name: "Lekki Branch" }];
  mocks.banks = [bank(1, "Ikeja Collections", 10), bank(2, "Lekki Collections", 20), bank(3, "GTBank Operations", null)];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ReceivableAccountPicker", () => {
  it("reads the tagged chart and never the one with balances", () => {
    act(() => root.render(<ReceivableAccountPicker entity="HOLYCROSS" value="" onChange={() => undefined} />));

    expect(mocks.taggedCalls).toBeGreaterThan(0);
    expect(mocks.chartCalls).toBe(0);
  });

  it("offers only postable asset accounts tagged CONTROL", () => {
    act(() => root.render(<ReceivableAccountPicker entity="HOLYCROSS" value="" onChange={() => undefined} />));

    expect(mocks.options).toEqual([{ value: "1200", label: "1200 · Accounts Receivable" }]);
  });
});

describe("BankAccountPicker", () => {
  const offered = () => mocks.options.map((o) => o.label);

  it("offers a branch's document only its own branch's accounts", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={10} />));

    expect(offered()).toEqual(["Ikeja Collections"]);
  });

  it("offers a document not yet given a branch only the accounts not yet given one", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={null} />));

    expect(offered()).toEqual(["GTBank Operations"]);
  });

  it("offers every account while the document's branch is not known", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} />));

    expect(offered()).toEqual(["Ikeja Collections", "Lekki Collections", "GTBank Operations"]);
  });

  it("offers every account at a school with one branch", () => {
    mocks.branches = [{ id: 10, name: "Main Branch" }];
    mocks.banks = [bank(1, "Main Collections", 10), bank(3, "GTBank Operations", null)];
    act(() => root.render(<BankAccountPicker entity="HARBOUR" value="" onChange={() => undefined} documentBranchId={10} />));

    expect(offered()).toEqual(["Main Collections", "GTBank Operations"]);
  });

  it("still narrows when the branch list cannot be read but the accounts span two branches", () => {
    mocks.branches = undefined;
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={20} />));

    expect(offered()).toEqual(["Lekki Collections"]);
  });
});

describe("BankAccountPicker for a batch", () => {
  const offered = () => mocks.options.map((o) => o.label);

  it("offers lines of one branch that branch's accounts", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchIds={[10, undefined, 10]} />));

    expect(offered()).toEqual(["Ikeja Collections"]);
  });

  it("offers lines of two branches no account at all", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchIds={[10, 20]} />));

    expect(offered()).toEqual([]);
  });
});
