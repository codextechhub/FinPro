/**
 * A vendor bill an approver sent back is corrected and resumed by whoever sent it.
 *
 * Mrs Bello (user 4) sends Ade Stationers' ₦90,000 bill and Mr Eze returns it
 * asking for the supplier's own invoice number. Her drawer offers Edit and
 * Resume, but not Run Match or Submit; correcting the number sends it alone,
 * and Resume posts to the request's resubmit route, where the bill is matched
 * again. Mr Ade (user 9) sees the note but neither button. While the bill is
 * with Mr Eze, nobody sees Edit or Resume.
 */
import { act } from "react";
import { MemoryRouter } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorInvoice } from "@/redux/services/procurement/procurement-types";

const mocks = vi.hoisted(() => {
  const state = {
    held: new Set<string>(),
    uid: 4,
    doc: null as unknown,
    exported: undefined as unknown,
    workflow: undefined as unknown,
    update: (() => undefined) as (body: unknown) => void,
    resume: (() => undefined) as (id: unknown) => void,
  };
  const query = () => ({ data: undefined, currentData: undefined, isLoading: false, isFetching: false, isError: false, refetch: () => undefined });
  const mutation = (spy?: (body: unknown) => void) => () => [
    (body: unknown) => { spy?.(body); return { unwrap: async () => ({ message: "Done.", data: { id: 9 } }) }; }, { isLoading: false },
  ];
  /** Every hook an RTK Query module exports, answering empty unless named in `own`. */
  const api = (own: Record<string, unknown>) => new Proxy(own, {
    has: () => true,
    get: (target, key) => {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      if (key.startsWith("useLazy")) return () => [() => ({ unwrap: async () => ({ data: {} }) }), {}];
      if (key.endsWith("Mutation")) return mutation();
      if (key.startsWith("use")) return query;
      return undefined;
    },
  });
  return { state, query, mutation, api };
});

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.state.held.has(code),
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { user: { id: mocks.state.uid }, tenant: {}, permissions: [] } }),
  useAppDispatch: () => () => undefined,
}));
vi.mock("../../lib/display-prefs", () => ({
  useDates: () => ({ day: (value: string) => String(value).slice(0, 10), dateTime: String, time: String, today: () => "2026-10-06" }),
}));
vi.mock("../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("../../lib/host-routes", () => ({ useServesPath: () => () => false }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRaisingBranchChoice: () => ({ ready: true, body: () => ({}) }),
  RaisingBranchChoiceField: () => null,
  useActiveEntity: () => ({ code: "BSS", currency: "NGN", entity: null, isLoading: false }),
  useReaderBranchLens: () => ({ applies: false }),
  PostingDateField: () => null,
  BankAccountPicker: () => null,
  TaxCodePicker: () => null,
}));
vi.mock("@/redux/services/finance/setup-api", () => mocks.api({}));
vi.mock("./procurement-shell", () => ({ ProcurementShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  QuickExportButton: (props: { params?: unknown }) => { mocks.state.exported = props.params; return null; },
}));
vi.mock("@/components/finance-ui/no-approver-prompt", () => ({ useNoApproverPrompt: () => ({ promptIfParked: () => undefined, noApproverDialog: null }) }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("./pickers", () => ({ VendorPicker: () => null, PurchaseOrderPicker: () => null }));
vi.mock("./document-attachments", () => ({ DocumentAttachments: () => null, useDocumentAttachmentRows: () => [] }));
vi.mock("@/redux/services/procurement/procurement-api", () => mocks.api({
  useGetVendorInvoiceQuery: () => ({ ...mocks.query(), data: { data: mocks.state.doc } }),
  useUpdateVendorInvoiceMutation: mocks.mutation((body) => mocks.state.update(body)),
}));
vi.mock("@/redux/services/procurement/payables-corrections-api", () => mocks.api({}));
vi.mock("@/redux/services/dashboard/workflow-api", () => mocks.api({
  useGetWorkflowInstanceQuery: () => ({ ...mocks.query(), data: mocks.state.workflow }),
  useResubmitWorkflowInstanceMutation: mocks.mutation((id) => mocks.state.resume(id)),
}));

import { P } from "../../permissions";
import VendorInvoicesPage, { InvoiceDrawer } from "./vendor-invoices";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BILL = {
  id: 14, document_number: "VI-0014", status: "DRAFT", approval_state: "PENDING", approval_returned: true,
  match_status: "NOT_MATCHED", payment_status: "UNPAID", display_status: "PENDING_APPROVAL", is_overdue: false,
  vendor_id: 1, vendor_code: "V-001", vendor_name: "Ade Stationers", purchase_order_id: 3, purchase_order_number: "PO-0003",
  invoice_date: "2026-10-03", due_date: "2026-11-02", vendor_reference: "TBC", narration: "", subtotal: 9_000_000,
  tax_total: 0, total: 9_000_000, total_naira: "90,000.00", amount_paid: 0, balance_due: 9_000_000, journal_id: null,
  workflow_instance_id: "wf-14",
  lines: [{ id: 61, po_line_id: 51, description: "A4 paper", expense_code: "5100", quantity: "20.0000", unit_price: 450_000, net_amount: 9_000_000, tax_amount: 0 }],
} as unknown as VendorInvoice;
const RETURNED = {
  id: "wf-14", status: "RETURNED", requested_by: 4, audit_logs: [],
  stage_instances: [{ id: "s1", stage_label: "Bursar", status: "RETURNED", attempt: 1, eligible_approvers: [], actions: [
    { id: "a1", action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Add the supplier's invoice number", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null, attempt: 1 },
  ] }],
};

let container: HTMLDivElement;
let root: Root;
const update = vi.fn();
const resume = vi.fn();
const button = (label: string) => [...document.body.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label).pop();
const field = (label: string) => [...document.body.querySelectorAll("label")].find((l) => l.querySelector("span")?.textContent?.replace(" *", "") === label)?.querySelector("input, textarea") as HTMLInputElement;
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
beforeEach(() => {
  mocks.state.held = new Set([P.PROC_UPDATE_VENDOR_INVOICE, P.PROC_SUBMIT_VENDOR_INVOICE, P.PROC_MATCH_VENDOR_INVOICE]);
  mocks.state.uid = 4;
  mocks.state.doc = BILL;
  mocks.state.workflow = RETURNED;
  update.mockReset();
  resume.mockReset();
  mocks.state.update = update;
  mocks.state.resume = resume;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<MemoryRouter><InvoiceDrawer id={14} entity="BSS" currency="NGN" onClose={() => undefined} /></MemoryRouter>));

describe("a vendor bill an approver sent back", () => {
  it("offers its sender Edit and Resume, and not Run Match or Submit", async () => {
    render();
    expect(document.body.textContent).toContain("Sent back by Mr Eze on 2026-10-03: Add the supplier's invoice number");
    expect(document.body.textContent).toContain("Sent back");
    expect(button("Run Match")).toBeUndefined();
    expect(button("Submit for Approval")).toBeUndefined();
    expect(button("Edit")).toBeDefined();
    await act(async () => { button("Resume")!.click(); });
    expect(resume).toHaveBeenCalledWith("wf-14");
  });

  it("sends the corrected invoice number alone", async () => {
    render();
    act(() => button("Edit")!.click());
    expect(button("Create & Submit")).toBeUndefined();
    act(() => type(field("Vendor invoice #"), "ADE-7781"));
    await act(async () => { button("Save changes")!.click(); });
    expect(update).toHaveBeenCalledWith({ id: 14, entity: "BSS", vendor_reference: "ADE-7781" });
  });

  it("offers neither to a colleague who did not send it", () => {
    mocks.state.uid = 9;
    render();
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

describe("a vendor bill with its approver", () => {
  it("offers no Edit or Resume, and says it is with the approver", () => {
    mocks.state.doc = { ...BILL, approval_returned: false };
    mocks.state.workflow = { ...RETURNED, status: "IN_PROGRESS" };
    render();
    expect(document.body.textContent).toContain("With the approver.");
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});

/**
 * The bill list's export carries the tab as the list reads it: Overdue as
 * display_status (a stored `status` of OVERDUE is refused), and Sent back as
 * approval=returned.
 */
describe("the vendor bill export", () => {
  it("sends the tab as display_status, and Sent back as approval=returned", () => {
    mocks.state.held = new Set([P.PROC_VIEW_VENDOR_INVOICES]);
    act(() => root.render(<MemoryRouter><VendorInvoicesPage /></MemoryRouter>));
    const tab = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
    expect(mocks.state.exported).toEqual({ search: "" });
    act(() => tab("Overdue").click());
    expect(mocks.state.exported).toEqual({ display_status: "OVERDUE", search: "" });
    act(() => tab("Sent back").click());
    expect(mocks.state.exported).toEqual({ approval: "returned", search: "" });
  });
});
