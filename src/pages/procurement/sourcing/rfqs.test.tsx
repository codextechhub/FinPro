/**
 * RFQ-0007 at Lagos Prep asks for the 40 chairs and 10 desks of PR-0004, each
 * line linked to the requisition line it came from. The server replaces an
 * RFQ's lines on every save, so a line sent without its link stops holding
 * the requisition line and the chairs read as free to order a second time.
 *
 *   1. The buyer renames the draft and saves: both lines go back with their
 *      links, though nothing about the lines changed.
 *   2. The buyer amends the issued RFQ to 35 chairs: both lines go back with
 *      their links.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), amend: vi.fn() }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
}));
vi.mock("../../../lib/display-prefs", () => ({
  useDates: () => ({ today: () => "2026-10-06", day: (v: string) => v, dateTime: (v: string) => v, zoneFor: () => "Africa/Lagos" }),
}));
vi.mock("@/components/custom/search-select", () => ({ SearchSelect: () => null }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DetailDrawer: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => <div>{children}<footer>{footer}</footer></div>,
  LineEditor: ({ lines, onChange }: { lines: { quantity: number }[]; onChange: (next: unknown[]) => void }) => (
    <button type="button" onClick={() => onChange(lines.map((line, i) => (i === 0 ? { ...line, quantity: 35 } : line)))}>Make it 35 chairs</button>
  ),
  MoneyInput: () => null,
  RaisingBranchChoiceField: () => null,
  useRaisingBranchChoice: () => ({ ready: true, body: () => ({}) }),
  useReaderBranchLens: () => ({ applies: false, isLoading: false }),
}));
vi.mock("@/redux/services/procurement/procurement-ext-api", () => ({
  useCreateRfqMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateRfqMutation: () => [(body: unknown) => { mocks.update(body); return { unwrap: async () => ({ message: "RFQ updated.", data: { id: 7 } }) }; }, { isLoading: false }],
  useIssueRfqMutation: () => [vi.fn(), { isLoading: false }],
  useCreateRfqAmendmentMutation: () => [(body: unknown) => { mocks.amend(body); return { unwrap: async () => ({}) }; }, { isLoading: false }],
  useGetFreeRequisitionLinesQuery: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));
vi.mock("@/redux/services/procurement/procurement-api", () => ({
  useGetRequisitionQuery: () => ({ data: undefined }),
  useGetVendorsQuery: () => ({ data: undefined, isLoading: false }),
  useGetRequisitionsQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { RfqDetail } from "@/redux/services/procurement/procurement-types";
import { RfqAmendmentForm, RfqForm } from "./rfqs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RFQ: RfqDetail = {
  id: 7, document_number: "RFQ-0007", rfq_status: "DRAFT", title: "Classroom furniture", requisition_id: 4,
  requisition_number: "PR-0004", issue_date: "2026-10-01", response_due_date: null, response_due_at: null, version: 1,
  budget_estimate: null, line_count: 2, response_count: 0, invited_count: 1, branch_id: 1, branch_name: "Ikeja",
  shared_sourcing: null, notes: "",
  lines: [
    { id: 11, line_no: 1, description: "Classroom chair", quantity: "40.000", requisition_line_id: 501, expense_account_id: 9, expense_code: "5300", tax_code_id: null },
    { id: 12, line_no: 2, description: "Desk", quantity: "10.000", requisition_line_id: 502, expense_account_id: 9, expense_code: "5300", tax_code_id: null },
  ],
  invitations: [{ id: 1, vendor_id: 3, vendor_code: "V-003", vendor_name: "Ade Furniture", responded: false } as RfqDetail["invitations"][number]],
  quotations: [], amendments: [], activity: [],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.update.mockReset();
  mocks.amend.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

/** Type into a controlled input or textarea the way React hears it. */
function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("saving an RFQ keeps each line's requisition link", () => {
  it("sends both links back when only the draft's title changes", async () => {
    act(() => root.render(<RfqForm entity="BSS" currency="NGN" initial={RFQ} onClose={vi.fn()} />));
    const title = [...container.querySelectorAll("input")].find((i) => i.value === "Classroom furniture")!;
    act(() => type(title, "Classroom furniture, Term 1"));
    await act(async () => { button("Save changes").click(); });

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.lastCall?.[0]).toMatchObject({
      id: 7, title: "Classroom furniture, Term 1",
      lines: [
        { description: "Classroom chair", quantity: 40, requisition_line: 501 },
        { description: "Desk", quantity: 10, requisition_line: 502 },
      ],
    });
  });

  it("sends both links back with an amendment that changes a quantity", async () => {
    act(() => root.render(<RfqAmendmentForm rfq={{ ...RFQ, rfq_status: "ISSUED" }} entity="BSS" onClose={vi.fn()} />));
    act(() => type(container.querySelector("textarea")!, "Five fewer chairs"));
    act(() => { (container.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click(); });
    act(() => button("Make it 35 chairs").click());
    await act(async () => { button("Publish amendment").click(); });

    expect(mocks.amend).toHaveBeenCalledTimes(1);
    expect(mocks.amend.mock.lastCall?.[0].lines).toEqual([
      { description: "Classroom chair", quantity: 35, expense_account: "5300", requisition_line: 501 },
      { description: "Desk", quantity: 10, expense_account: "5300", requisition_line: 502 },
    ]);
  });
});
