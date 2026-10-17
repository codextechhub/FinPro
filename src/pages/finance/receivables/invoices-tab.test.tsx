/**
 * Invoices at Bright Star: the status counts ask the summary for the same
 * archived years the list shows, so each tab's count matches its rows. An
 * archived year is out of both until "Show archived years" is ticked.
 *
 * Each state reads one word in the tabs and on the rows: Tunde's half-paid
 * term bill is "Partly paid" under the "Partly paid" tab, Ada's bill waiting
 * on an approver reads "Awaiting approval", and a voided one "Voided", never
 * the raw state the server sends.
 *
 * Mrs Bello, bursar for Ikeja and Lekki, switches the sidebar to Lekki and picks
 * FY 2015: the list, the figures above it and the exported file all answer for
 * Lekki's 2015 invoices, and the page offers no branch picker of its own.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NO_LENS = { applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false };
const mocks = vi.hoisted(() => ({
  invoices: vi.fn(), summary: vi.fn(), exported: vi.fn(), rows: [] as unknown[],
  lens: { applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false } as unknown,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("@/components/finance-ui/archived-years", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ShowArchivedToggle: () => null,
}));
vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  QuickExportButton: (props: { params?: unknown }) => { mocks.exported(props.params); return null; },
  hostBranchLens: () => mocks.lens,
}));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: { data: [
    { id: 1, year: 2015, start_date: "2014-09-01", end_date: "2015-08-31", is_archived: false },
    { id: 2, year: 2016, start_date: "2015-09-01", end_date: "2016-08-31", is_archived: false },
  ] } }),
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetInvoicesQuery: (args: unknown) => {
    mocks.invoices(args);
    return { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  useGetInvoiceSummaryQuery: (args: unknown) => {
    mocks.summary(args);
    return { data: undefined };
  },
  useWriteOffInvoiceMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("./invoice-detail-drawer", () => ({ InvoiceDetailDrawer: () => null }));
vi.mock("./batch-generate-modal", () => ({ BatchGenerateModal: () => null }));
vi.mock("./new-invoice-drawer", () => ({ NewInvoiceDrawer: () => null }));

import { InvoicesTab } from "./invoices-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.invoices.mockReset();
  mocks.summary.mockReset();
  mocks.exported.mockReset();
  mocks.rows = [];
  mocks.lens = NO_LENS;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(path: string) {
  act(() => root.render(<MemoryRouter initialEntries={[path]}><InvoicesTab entity="BSS" currency="NGN" /></MemoryRouter>));
}

describe("the invoice counts", () => {
  it("leave archived years out with the list", () => {
    mount("/finance/receivables/invoices");
    expect(mocks.invoices.mock.lastCall?.[0]).not.toHaveProperty("include_archived");
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS" });
  });

  it("take archived years in with the list once they are shown", () => {
    mount("/finance/receivables/invoices?archived=1");
    expect(mocks.invoices.mock.lastCall?.[0]).toMatchObject({ include_archived: "true" });
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS", include_archived: "true" });
    expect(mocks.exported.mock.lastCall?.[0]).toMatchObject({ include_archived: "true" });
  });
});

const invoice = (id: number, name: string, status: string, paymentStatus: string) => ({
  id, document_number: `INV-000${id}`, customer_id: id, customer_code: `C-00${id}`, customer_name: name,
  invoice_date: "2026-09-01", due_date: null, status, payment_status: paymentStatus,
  subtotal: 4_000_000, tax_total: 0, total: 4_000_000, total_naira: "40,000.00", amount_paid: 0,
  amount_credited: 0, settled_amount: 0, balance_due: 4_000_000, reference: "", narration: "",
});

describe("the invoice states", () => {
  it("read one word each in the tabs and on the rows", () => {
    mocks.rows = [
      invoice(1, "Tunde Bakare", "POSTED", "PARTIAL"),
      invoice(2, "Ada Okafor", "PENDING_APPROVAL", "UNPAID"),
      invoice(3, "Chidi Eze", "REVERSED", "UNPAID"),
    ];
    mount("/finance/receivables/invoices");

    const tabs = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(tabs.some((t) => t.startsWith("Partly paid"))).toBe(true);
    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows.find((t) => t.includes("INV-0001"))).toContain("Partly paid");
    expect(rows.find((t) => t.includes("INV-0002"))).toContain("Awaiting approval");
    expect(rows.find((t) => t.includes("INV-0003"))).toContain("Voided");
    expect(container.textContent).not.toContain("Partially Paid");
    expect(container.textContent).not.toContain("PENDING_APPROVAL");
    expect(container.textContent).not.toContain("REVERSED");
  });
});

describe("the invoice export", () => {
  it("asks for the tab the list shows, as bucket", () => {
    mount("/finance/receivables/invoices");
    const tab = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Overdue"))!;
    act(() => tab.click());
    expect(mocks.invoices.mock.lastCall?.[0]).toMatchObject({ bucket: "overdue" });
    expect(mocks.exported.mock.lastCall?.[0]).toMatchObject({ bucket: "overdue" });
  });
});

describe("the invoice list's branch and year", () => {
  const LEKKI = { applies: true, pinnedBranch: null, branch: 2, choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false };
  const year = () => container.querySelector<HTMLSelectElement>('select[aria-label="Year"]')!;
  const pick = (el: HTMLSelectElement, value: string) => act(() => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  it("opens on All years and asks the list and its figures for no period", () => {
    mount("/finance/receivables/invoices");
    expect(year().value).toBe("all");
    expect(mocks.invoices.mock.lastCall?.[0]).not.toHaveProperty("fiscal_year");
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS" });
  });

  it("asks the list and its figures for the switcher's branch and the year picked", () => {
    mocks.lens = LEKKI;
    mount("/finance/receivables/invoices");
    expect(container.querySelector('select[aria-label="Branch"]')).toBeNull();
    pick(year(), "2015");
    expect(mocks.invoices.mock.lastCall?.[0]).toMatchObject({ entity: "BSS", page: 1, branch: 2, fiscal_year: 2015 });
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS", branch: 2, fiscal_year: 2015 });
  });

  it("sends custom dates as a range and never with a year", () => {
    mount("/finance/receivables/invoices?year=custom&from=2015-03-01&to=2015-05-31");
    expect(mocks.invoices.mock.lastCall?.[0]).toMatchObject({ date_from: "2015-03-01", date_to: "2015-05-31" });
    expect(mocks.summary.mock.lastCall?.[0]).not.toHaveProperty("fiscal_year");
  });

  it("exports the branch and period the list shows, beside its tab", () => {
    mocks.lens = LEKKI;
    mount("/finance/receivables/invoices?year=2015");
    expect(mocks.exported.mock.lastCall?.[0]).toEqual({ bucket: "", search: "", branch: 2, fiscal_year: 2015 });
  });
});
