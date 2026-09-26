/**
 * The receivable account picker reads the tagged chart, not the balances.
 *
 * Chukwuemeka, the Holy Cross bursar, may add customers but not open the chart
 * of accounts. The chart with balances refuses him, so a picker built on it was
 * empty. The tagged chart names the control accounts without any balance and
 * is readable on any finance key; the picker must use it and offer only the
 * postable asset accounts tagged CONTROL.
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

import { ReceivableAccountPicker } from "./pickers";

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
