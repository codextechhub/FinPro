/**
 * AR Invoices at Bright Star: the status counts ask the summary for the same
 * archived years the list shows, so each tab's count matches its rows. An
 * archived year is out of both until "Show archived years" is ticked.
 *
 * Each state reads one word in the tabs and on the rows: Tunde's half-paid
 * term bill is "Partly paid" under the "Partly paid" tab, Ada's bill waiting
 * on an approver reads "Awaiting approval", and a voided one "Voided", never
 * the raw state the server sends.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoices: vi.fn(), summary: vi.fn(), rows: [] as unknown[] }));

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
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  QuickExportButton: () => null,
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
  mocks.rows = [];
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
