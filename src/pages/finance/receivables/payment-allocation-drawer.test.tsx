/**
 * Ada Okafor's receipt RCT-0007 (N50,000, unallocated) under Field Access.
 *
 * The receipt detail carries the customer's open bills and debit notes, which
 * are the `finance.customer` lists of the same names, and each item's balance
 * follows the customer balance. A typed split needs both lists and every
 * balance; a role missing any of them is offered the automatic allocation only,
 * with nothing summed that it cannot see.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ detail: null as unknown, allocate: vi.fn() }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DocumentEmailAction: () => null,
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetPaymentDetailQuery: () => ({ data: { data: mocks.detail }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAllocatePaymentMutation: () => [(body: unknown) => {
    mocks.allocate(body);
    return { unwrap: () => Promise.resolve({ message: "Receipt allocated." }) };
  }, { isLoading: false }],
}));
vi.mock("./document-void-action", () => ({ DocumentVoidAction: () => null }));

import { PaymentAllocationDrawer, openAllocationTargets } from "./payment-allocation-drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const money = (kobo: number) => ({ kobo, naira: (kobo / 100).toFixed(2) });
const PAYMENT = {
  id: 7, document_number: "RCT-0007", customer_name: "Ada Okafor", amount: 5_000_000, status: "POSTED",
  unallocated_amount: 5_000_000, allocation_status: "UNALLOCATED",
};
const INVOICES = [
  { id: 1, document_number: "INV-0001", due_date: "2026-09-30", balance: money(3_000_000) },
  { id: 2, document_number: "INV-0002", due_date: "2026-10-30", balance: money(4_000_000) },
];
const DEBIT_NOTES = [{ id: 3, document_number: "DN-0001", note_date: "2026-09-10", balance: money(500_000) }];
const without = <T extends object>(rows: T[], key: string) => rows.map((r) => {
  const copy = { ...r } as Record<string, unknown>;
  delete copy[key];
  return copy;
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.allocate.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const render = (detail: Record<string, unknown>) => {
  mocks.detail = { payment: PAYMENT, allocations: [], gl_postings: [], ...detail };
  act(() => root.render(<PaymentAllocationDrawer id={7} entity="BSS" currency="NGN" onClose={() => undefined} />));
};
const text = () => document.body.textContent ?? "";
const inputs = () => [...document.body.querySelectorAll<HTMLInputElement>("input[type=number]")];
const apply = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Apply allocation"));

describe("openAllocationTargets", () => {
  it("offers a typed split only when both lists arrive with every balance", () => {
    expect(openAllocationTargets({ open_invoices: INVOICES, open_debit_notes: DEBIT_NOTES }).manual).toBe(true);
    expect(openAllocationTargets({ open_invoices: INVOICES, open_debit_notes: [] }).manual).toBe(true);
    expect(openAllocationTargets({ open_invoices: INVOICES }).manual).toBe(false);
    expect(openAllocationTargets({ open_debit_notes: DEBIT_NOTES }).manual).toBe(false);
    expect(openAllocationTargets({ open_invoices: without(INVOICES, "balance") as never, open_debit_notes: [] }).manual).toBe(false);
    expect(openAllocationTargets(undefined)).toEqual({ items: [], manual: false });
  });
});

describe("the receipt allocation drawer", () => {
  it("fills the open items oldest first with their balances when everything is readable", () => {
    render({ open_invoices: INVOICES, open_debit_notes: DEBIT_NOTES });
    expect(inputs()).toHaveLength(3);
    expect(inputs().map((i) => i.value)).toEqual(["30000.00", "20000.00", ""]);
    expect(text()).toContain("Allocation summary");
    expect(text()).toContain("bal");
    expect(document.body.querySelector("[data-testid=allocation-automatic]")).toBeNull();
  });

  it("lists the items without balances and allocates automatically when the balance is hidden", () => {
    render({ open_invoices: without(INVOICES, "balance"), open_debit_notes: without(DEBIT_NOTES, "balance") });
    expect(text()).toContain("INV-0001");
    expect(text()).toContain("DN-0001");
    expect(text()).not.toContain("bal ");
    expect(inputs()).toHaveLength(0);
    expect(text()).not.toContain("Allocation summary");
    expect(document.body.querySelector("[data-testid=allocation-automatic]")).not.toBeNull();
    expect(text()).not.toMatch(/NaN|undefined/);
    act(() => apply()!.click());
    expect(mocks.allocate).toHaveBeenCalledWith({ entity: "BSS", id: 7, auto_allocate: true, allocation_strategy: "oldest" });
  });

  it("offers only the automatic allocation, with no list at all, when both lists are hidden", () => {
    render({});
    expect(text()).not.toContain("INV-0001");
    expect(text()).not.toContain("No open items");
    expect(inputs()).toHaveLength(0);
    expect(text()).not.toContain("Allocation summary");
    expect(document.body.querySelector("[data-testid=allocation-automatic]")).not.toBeNull();
    expect((apply() as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows only the list it may read, and does not offer a typed split against half the items", () => {
    render({ open_invoices: INVOICES });
    expect(text()).toContain("INV-0002");
    expect(text()).not.toContain("DN-0001");
    expect(inputs()).toHaveLength(0);
    expect(text()).toContain("Allocated automatically");
  });
});
