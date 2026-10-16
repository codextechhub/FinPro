/**
 * Procurement approvals keeps completed decisions beside the live queue.
 *
 * Tunde can filter decisions he made before, while a decision from a branch he
 * no longer reaches stays a narrow receipt and never prints its amount,
 * requester or title.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  args: {} as Record<string, unknown>,
  history: [] as Record<string, unknown>[],
}));

vi.mock("./procurement-shell", () => ({ ProcurementShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./screen-help", () => ({ ProcurementPageHeader: ({ title, description }: { title: string; description?: React.ReactNode }) => <div><h1>{title}</h1>{description}</div> }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../lib/display-prefs", () => ({
  useDates: () => ({ day: String, dateTime: (value: string) => value, time: String, today: () => "2026-10-13" }),
}));
vi.mock("@/components/finance-ui", () => ({
  useActiveEntity: () => ({ code: "BSS", currency: "NGN" }),
  TabStrip: ({ items, value, onChange }: { items: { value: string; label: React.ReactNode }[]; value: string; onChange: (value: string) => void }) => <div>{items.map((item) => <button key={item.value} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>,
  DataTable: ({ columns, rows }: { columns: { header: string; cell: (row: Record<string, unknown>) => React.ReactNode }[]; rows: Record<string, unknown>[] }) => <div><div>{columns.map((column, index) => <strong key={`${column.header}-${index}`}>{column.header}</strong>)}</div>{rows.map((row) => <div key={String(row.action_id ?? row.id)}>{columns.map((column, index) => <span key={`${column.header}-${index}`}>{column.cell(row)}</span>)}</div>)}</div>,
  StatusPill: ({ status }: { status: string }) => <span>{status}</span>,
  DetailDrawer: () => null,
  EmptyState: () => null,
  ErrorState: () => null,
  LoadingState: () => null,
  ConfirmActionModal: () => null,
}));
vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useGetProcurementApprovalsQuery: (args: Record<string, unknown>) => {
    mocks.args = args;
    return {
      data: { data: args.view === "history" ? mocks.history : [], pagination: { totalItems: args.view === "history" ? 1 : 0 } },
      isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
    };
  },
  useGetProcurementApprovalQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useRecordProcurementApprovalActionMutation: () => [vi.fn(), { isLoading: false }],
}));

import ProcurementApprovalsPage from "./approvals";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.args = {};
  mocks.history = [{
    id: "wf-1", action_id: "act-1", document_type: "procurement.requisition",
    document_type_label: "Purchase Requisition", reference: "REQ-1042",
    decision: "APPROVED", stage: "Manager approval", decided_at: "2026-10-10T09:00:00Z",
    on_behalf_of: null, reversed_at: null, receipt_only: true,
  }];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<MemoryRouter><ProcurementApprovalsPage /></MemoryRouter>));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === label)!;
const setInput = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Procurement decision history", () => {
  it("shows a former branch decision as a minimal receipt", () => {
    act(() => button("My decisions").click());
    expect(mocks.args.view).toBe("history");
    expect(container.textContent).toContain("REQ-1042");
    expect(container.textContent).toContain("APPROVED");
    expect(container.textContent).toContain("Manager approval");
    expect(container.textContent).toContain("Receipt only");
    expect(container.textContent).not.toContain("Tunde Bello");
    expect(container.textContent).not.toContain("250,000");
  });

  it("sends the decision filters with the history query", () => {
    act(() => button("My decisions").click());
    const selects = [...container.querySelectorAll("select")];
    act(() => {
      selects[0].value = "procurement.requisition";
      selects[0].dispatchEvent(new Event("change", { bubbles: true }));
      selects[1].value = "APPROVED";
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    const dates = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
    act(() => {
      setInput(dates[0], "2026-10-01");
    });
    act(() => {
      setInput(dates[1], "2026-10-13");
    });
    expect(mocks.args).toMatchObject({
      view: "history", document_type: "procurement.requisition", outcome: "APPROVED",
      decided_from: "2026-10-01", decided_to: "2026-10-13",
    });
  });

  it("removes fields and their headings when Field Access closes them", () => {
    mocks.history = [{
      id: "wf-1", action_id: "act-1", document_type: "procurement.requisition",
      document_type_label: "Purchase Requisition", reference: "REQ-1042",
      receipt_only: true,
    }];
    act(() => button("My decisions").click());
    expect(container.textContent).toContain("REQ-1042");
    expect(container.textContent).not.toContain("Decision");
    expect(container.textContent).not.toContain("Stage");
    expect(container.textContent).not.toContain("Decided");
    expect(container.textContent).not.toContain("Acting as");
    expect(container.textContent).not.toContain("Reversed");
  });
});
