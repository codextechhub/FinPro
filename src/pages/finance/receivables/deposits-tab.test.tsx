/**
 * A deposit reads with one word per state wherever it appears.
 *
 * Tunde's caution deposit was returned when he left. The status filter, the
 * row pill and the drawer all call that "Returned", after the Return deposits
 * action that put it there, so filtering on Returned finds rows that say so.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerDeposit } from "@/redux/services/finance/fees-types";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  mutation: () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {} } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
  hostBranchLens: undefined,
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CustomerPicker: () => <div>customer-picker</div>,
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetDepositsQuery: () => ({ data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetReceivablesSettingsQuery: () => ({ data: undefined }),
  useForfeitDepositsMutation: mocks.mutation,
  useReleaseDepositsMutation: mocks.mutation,
}));

import { DEPOSIT_STATUS, DepositsTab } from "./deposits-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEPOSIT: CustomerDeposit = {
  id: 3, customer_id: 1, customer_code: "C-001", customer_name: "Tunde Okafor", branch_id: 1, branch_name: "Ikeja",
  invoice_id: 9, invoice_number: "INV-0009", amount: 5_000_000, amount_naira: "50,000.00", status: "RELEASED",
  claim_opened_on: "2026-07-31", release_note_number: "CN-0012", forfeiture_id: null,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("deposit states", () => {
  it("calls a released deposit Returned in the filter, the row and the drawer", () => {
    mocks.rows = [DEPOSIT];
    act(() => root.render(<MemoryRouter><DepositsTab entity="BSS" currency="NGN" /></MemoryRouter>));

    const options = [...container.querySelectorAll('select[aria-label="Status"] option')].map((o) => o.textContent);
    expect(options).toEqual(["All", "Held", "Returned", "Forfeited", "Cancelled"]);

    const row = container.querySelector("tbody tr") as HTMLElement;
    expect(row.textContent).toContain("Returned");
    expect(container.textContent).not.toContain("Released");

    act(() => row.click());
    expect(document.body.textContent).toContain("Returned by");
    expect(document.body.textContent).not.toContain("Released");
  });

  it("has a word for every state the backend gives a deposit", () => {
    expect(Object.keys(DEPOSIT_STATUS)).toEqual(["HELD", "RELEASED", "FORFEITED", "CANCELLED"]);
  });
});
