/**
 * The receivable account picker reads the tagged chart, not the balances.
 *
 * Chukwuemeka, the Holy Cross bursar, may add customers but not open the chart
 * of accounts. The chart with balances refuses him, so a picker built on it was
 * empty. The tagged chart names the control accounts without any balance and
 * is readable on any finance key; the picker must use it and offer only the
 * postable asset accounts tagged CONTROL.
 *
 * The bank account picker offers, for a document of a branch, only that
 * branch's accounts and the school-wide ones: Mrs Okafor covers Ikeja and Lekki,
 * and paying an Ikeja claim from Lekki's account is refused by the server.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  options: [] as { value: string; label: string }[],
  taggedCalls: 0,
  chartCalls: 0,
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
  useGetBankAccountsQuery: () => ({
    isLoading: false,
    data: { data: [bank(1, "Ikeja Collections", 10), bank(2, "Lekki Collections", 20), bank(3, "GTBank Operations", null)] },
  }),
}));

import { BankAccountPicker, ReceivableAccountPicker } from "./pickers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.taggedCalls = 0;
  mocks.chartCalls = 0;
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

  it("offers a branch's document its own branch's accounts and the school-wide ones", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={10} />));

    expect(offered()).toEqual(["Ikeja Collections", "GTBank Operations"]);
  });

  it("offers a school-wide document every account", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchId={null} />));

    expect(offered()).toEqual(["Ikeja Collections", "Lekki Collections", "GTBank Operations"]);
  });
});

describe("BankAccountPicker for a batch", () => {
  const offered = () => mocks.options.map((o) => o.label);

  it("offers lines of one branch that branch's accounts and the school-wide ones", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchIds={[10, null, 10]} />));

    expect(offered()).toEqual(["Ikeja Collections", "GTBank Operations"]);
  });

  it("offers lines of two branches only the school-wide accounts", () => {
    act(() => root.render(<BankAccountPicker entity="CORONA" value="" onChange={() => undefined} documentBranchIds={[10, 20]} />));

    expect(offered()).toEqual(["GTBank Operations"]);
  });
});
