/**
 * A concession reads with one word per state wherever it appears.
 *
 * Mrs Bello's scholarship for Tunde waits for a second person, and last
 * term's discount for Ada was voided. The status filter, the row pill and the
 * drawer all say "Awaiting approval" for the first and "Voided" for the
 * second, so a bursar who filters on a word finds rows wearing that same word.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Concession } from "@/redux/services/finance/ar-types";

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
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({
  useNoApproverPrompt: () => ({ promptIfParked: vi.fn(), noApproverDialog: null }),
}));
vi.mock("./use-adjustment-gate", () => ({
  useAdjustmentGate: () => ({ rule: { kind: "none" }, isLoading: false }),
}));
vi.mock("./document-void-action", () => ({ DocumentVoidAction: () => null }));
vi.mock("./income-given-back", () => ({ IncomeGivenBack: () => null }));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetConcessionsQuery: () => ({ data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetConcessionSummaryQuery: () => ({ data: undefined }),
  useGetInvoicesQuery: () => ({ data: undefined }),
  useCreateConcessionMutation: mocks.mutation,
  usePostConcessionMutation: mocks.mutation,
  useSubmitConcessionMutation: mocks.mutation,
}));

import { CONCESSION_FILTER_STATUSES, ConcessionsTab } from "./concessions-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const concession = (id: number, name: string, status: string): Concession => ({
  id, document_number: `CON-000${id}`, kind: "SCHOLARSHIP", customer_id: id, customer_code: `C-00${id}`,
  customer_name: name, invoice_id: 40 + id, invoice_number: `INV-004${id}`, concession_date: "2026-10-01",
  status, amount: 5_000_000, amount_naira: "50,000.00", allowance_account: "4910", reason: "Scholarship",
  reference: "",
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("concession states", () => {
  it("names each state with the same word in the filter, the row and the drawer", () => {
    mocks.rows = [concession(1, "Tunde Bakare", "PENDING_APPROVAL"), concession(2, "Ada Okafor", "REVERSED")];
    act(() => root.render(<MemoryRouter><ConcessionsTab entity="BSS" currency="NGN" /></MemoryRouter>));

    const options = [...container.querySelectorAll('select[aria-label="Status"] option')].map((o) => o.textContent);
    expect(options).toEqual(["All statuses", "Draft", "Awaiting approval", "Posted", "Voided"]);

    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows.find((t) => t.includes("CON-0001"))).toContain("Awaiting approval");
    expect(rows.find((t) => t.includes("CON-0002"))).toContain("Voided");
    expect(container.textContent).not.toContain("Pending Approval");
    expect(container.textContent).not.toContain("Reversed");

    act(() => (container.querySelector("tbody tr") as HTMLElement).click());
    expect(document.body.textContent).toContain("Awaiting approval");
    expect(document.body.textContent).not.toContain("Pending Approval");
  });

  it("filters on the states the backend gives a concession", () => {
    expect([...CONCESSION_FILTER_STATUSES]).toEqual(["DRAFT", "PENDING_APPROVAL", "POSTED", "REVERSED"]);
  });
});
