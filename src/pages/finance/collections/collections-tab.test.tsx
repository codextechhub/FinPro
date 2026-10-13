/**
 * Collections: which ones a branch desk started.
 *
 * Mrs Adeyemi starts N45,000 for Tunde's fees at Lekki's desk; Mr Okafor pays
 * another bill from the pay link in his email. The list names each one's
 * source, Desk or Online, and can be narrowed to either; a role that may not
 * read the origin sees neither the column nor the filter.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>,
  asked: [] as Record<string, unknown>[],
  exportParams: [] as unknown[],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true, hasModuleAccess: () => true, fieldAccess: mocks.fieldAccess,
  }),
}));

const ROW = (id: number, reference: string, origin?: "DESK" | "STANDARD") => ({
  id, entity_code: "BSS", branch: 2, provider: "PAYSTACK", channel: "CHECKOUT", ...(origin ? { origin } : {}), reference, provider_reference: `ps_${id}`,
  amount: 4_500_000, amount_naira: "45,000.00", status: "PENDING", customer_code: "C-001", customer_name: "Tunde Bakare",
  deposit_account_code: null, deposit_account_name: null, invoice_id: 9, payer_email: "", payer_name: "", narration: "", checkout_url: "https://x", payment_id: null,
  confirmed_at: null, created_at: "2026-10-13T09:00:00Z",
});
let rows: ReturnType<typeof ROW>[] = [];

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetCollectionsQuery: (args: Record<string, unknown>) => {
    mocks.asked.push(args);
    return { data: { data: rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  useGetCollectionsSummaryQuery: () => ({ data: { data: { collected: { kobo: 0 }, pending: { kobo: 0 }, failed: { kobo: 0 }, success_rate: null } } }),
  useInitiateCollectionMutation: () => [vi.fn(), { isLoading: false }],
  useVerifyCollectionMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/redux/services/finance/ar-api", () => ({ useGetInvoicesQuery: () => ({ data: undefined, isFetching: false }) }));
vi.mock("../../../host", () => ({
  QuickExportButton: ({ params }: { params: unknown }) => { mocks.exportParams.push(params); return null; },
  hostBranchLens: () => ({ applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false }),
  useBranches: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../../../lib/display-prefs", () => ({
  useDates: () => ({ day: (v: string) => v, dateTime: (v: string) => String(v).slice(0, 16).replace("T", " "), today: () => "2026-10-13" }),
}));
vi.mock("@/hooks/use-action-param", () => ({ useActionParam: () => undefined }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CollectionsTab } from "./collections-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.asked = [];
  mocks.exportParams = [];
  rows = [ROW(1, "COL-1", "DESK"), ROW(2, "COL-2", "STANDARD")];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<CollectionsTab entity="BSS" currency="NGN" />));
const headers = () => [...container.querySelectorAll("thead th")].map((th) => th.textContent);
const sourceFilter = () => [...container.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.textContent === "All sources")) as HTMLSelectElement | undefined;
const choose = (select: HTMLSelectElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
});

describe("the Source column", () => {
  it("names Desk and Online for each collection", () => {
    render();
    expect(headers()).toContain("Source");
    const cells = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(cells[0]).toContain("Desk");
    expect(cells[1]).toContain("Online");
  });

  it("is absent, with its filter, where Field Access hides the origin", () => {
    mocks.fieldAccess = { "payments.collection": { hidden: ["origin"], read_only: [], open_on_create: ["origin"] } };
    rows = [ROW(1, "COL-1"), ROW(2, "COL-2")];
    render();
    expect(headers()).not.toContain("Source");
    expect(sourceFilter()).toBeUndefined();
  });
});

describe("the origin filter", () => {
  it("asks the server for desk collections only, and for the export to match", () => {
    render();
    expect(mocks.asked.at(-1)).not.toHaveProperty("origin");
    choose(sourceFilter()!, "DESK");
    expect(mocks.asked.at(-1)).toMatchObject({ origin: "DESK", page: 1 });
    expect(mocks.exportParams.at(-1)).toMatchObject({ origin: "DESK" });
  });

  it("asks for the rest as Online", () => {
    render();
    choose(sourceFilter()!, "STANDARD");
    expect(mocks.asked.at(-1)).toMatchObject({ origin: "STANDARD" });
  });
});
