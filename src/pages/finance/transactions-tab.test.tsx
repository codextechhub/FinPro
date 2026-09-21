/**
 * The money movements feed carries a payout's beneficiary name and account as
 * `party` and `beneficiary_account`, under Field Access on `payments.payout`.
 * For a user who cannot read them the backend leaves the keys out, and the feed
 * must then show nothing in their place: no dash, no bullets, and no
 * Beneficiary section in the drawer. A collection's party is its customer and
 * stays.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fieldAccess: {} as Record<string, unknown> }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.fieldAccess,
  }),
}));

const ROWS = [
  {
    kind: "collection", gateway_id: 1, reference: "COL-1", created_at: "2026-09-20T09:00:00Z", direction: "in",
    party: "Tunde Bello", provider: "PAYSTACK", amount: 250000, amount_naira: "2,500.00", status: "SUCCEEDED",
    narration: "", provider_reference: null, confirmed_at: null, linked_id: null, email: "", account_code: null, account_name: null,
  },
  {
    kind: "payout", gateway_id: 2, reference: "PO-2", created_at: "2026-09-20T10:00:00Z", direction: "out",
    provider: "PAYSTACK", amount: 500000, amount_naira: "5,000.00", status: "PAID",
    narration: "", provider_reference: null, confirmed_at: null, linked_id: null, email: "", account_code: null, account_name: null,
  },
];

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetMovementsQuery: () => ({ data: { data: ROWS, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetMovementsSummaryQuery: () => ({ data: undefined }),
}));

vi.mock("../../host", () => ({ QuickExportButton: () => null }));

import { TransactionsTab } from "./transactions-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fieldAccess = {
    "payments.payout": { hidden: ["beneficiary_account_number", "beneficiary_name"], read_only: ["beneficiary_bank_code"], open_on_create: [] },
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const row = (reference: string) => [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(reference)) as HTMLTableRowElement;
const partyHeader = () => [...container.querySelectorAll("thead th")].findIndex((th) => th.textContent === "Party");

describe("Movements feed under Field Access", () => {
  it("shows a collection's customer and nothing for a hidden beneficiary", () => {
    act(() => root.render(<TransactionsTab entity="COD" />));
    const party = partyHeader();
    expect(row("COL-1").cells[party].textContent).toBe("Tunde Bello");
    expect(row("PO-2").cells[party].textContent).toBe("");
  });

  it("leaves the Beneficiary section out of a payout's drawer", () => {
    act(() => root.render(<TransactionsTab entity="COD" />));
    act(() => row("PO-2").click());
    expect(document.body.textContent).toContain("Payout out");
    expect(document.body.textContent).not.toContain("Beneficiary");
  });
});
