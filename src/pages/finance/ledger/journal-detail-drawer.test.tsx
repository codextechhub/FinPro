/**
 * A journal an approver sent back is corrected and resumed by whoever sent it.
 *
 * Mrs Bello (user 4) sends a capital entry and the bursar (user 7) returns it:
 * "Wrong date". Her drawer offers Edit, which opens the entry for correction,
 * and Resume; it offers no Submit. A journal a receipt raised is corrected
 * through the receipt, so its sender is offered Resume alone. Mr Ade (user 9)
 * is offered neither.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalDetail } from "@/redux/services/finance/gl-types";

const mocks = vi.hoisted(() => ({ held: new Set<string>(), journal: null as unknown }));
const returned = vi.hoisted(() => ({ uid: 4, request: undefined as unknown, resume: vi.fn() }));
vi.mock("@/redux/services/finance/approval-request-api", () => ({
  useGetDocumentApprovalRequestQuery: () => ({ data: undefined }),
  approvalRequestApi: { util: { invalidateTags: () => ({ type: "test/invalidate" }) } },
}));
vi.mock("@/redux/services/dashboard/workflow-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGetWorkflowInstanceQuery: () => ({ data: returned.request }),
  useResubmitWorkflowInstanceMutation: () => [(id: string) => { returned.resume(id); return { unwrap: async () => ({}) }; }, { isLoading: false }],
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { tenant: {}, user: { id: returned.uid } } }),
  useAppDispatch: () => vi.fn(),
}));
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => String(v).slice(0, 10), today: () => "2026-10-06" }) }));
vi.mock("../../../components/workflow/use-user-directory", () => ({ useUserDirectory: () => ({ name: (id: unknown) => `User ${id}` }) }));
vi.mock("./direct-entry-drawer", () => ({ DirectEntryDrawer: ({ existing }: { existing?: { document_number: string } }) => <p>Correcting {existing?.document_number}</p> }));
vi.mock("@/redux/services/finance/gl-api", () => {
  const mutation = () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }];
  return {
    useGetJournalQuery: () => ({ data: { data: mocks.journal }, isLoading: false, isError: false, refetch: vi.fn() }),
    useSubmitJournalMutation: mutation,
    useReverseJournalMutation: mutation,
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../../permissions";
import { JournalDetailDrawer } from "./journal-detail-drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JOURNAL = {
  id: 40, document_number: "JV-0040", date: "2026-10-01", period: "Oct 2026", source: "MANUAL", status: "DRAFT",
  narration: "Owner's capital", reference: "", posted_at: null, total_debit: 500_000_000, total_credit: 500_000_000,
  created_by: "Mrs Bello", created_by_id: 4, reverses_id: null, reversal_action: null,
  approval_state: "PENDING", approval_returned: true, workflow_instance_id: "wf-40", lines: [],
} as unknown as JournalDetail;
const RETURNED = {
  id: "wf-40", status: "RETURNED", requested_by: 4,
  stage_instances: [{ actions: [{ action: "RETURNED", actor: 7, acted_label: "Mr Eze", comment: "Wrong date", acted_at: "2026-10-03T09:00:00Z", reversed_at: null, is_reversal_of: null }] }],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.held = new Set([P.FIN_POST_DIRECT_ENTRY, P.FIN_SUBMIT_JOURNAL]);
  mocks.journal = JOURNAL;
  returned.uid = 4;
  returned.request = RETURNED;
  returned.resume.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = () => act(() => root.render(<MemoryRouter><JournalDetailDrawer journalId={40} entity="BSS" currency="NGN" onClose={vi.fn()} /></MemoryRouter>));
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

describe("a direct entry an approver sent back", () => {
  it("offers its sender Edit and Resume, and no Submit", async () => {
    render();
    expect(document.body.textContent).toContain("Sent back by Mr Eze on 2026-10-03: Wrong date");
    expect(button("Submit")).toBeUndefined();
    act(() => button("Edit")!.click());
    expect(document.body.textContent).toContain("Correcting JV-0040");
    await act(async () => { button("Resume")!.click(); });
    expect(returned.resume).toHaveBeenCalledWith("wf-40");
  });

  it("offers a journal another document raised Resume alone", () => {
    mocks.journal = { ...JOURNAL, source: "SALES" };
    render();
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeDefined();
    expect(document.body.textContent).toContain("To change it, withdraw it from your approvals");
  });

  it("offers anybody else neither", () => {
    returned.uid = 9;
    render();
    expect(button("Edit")).toBeUndefined();
    expect(button("Resume")).toBeUndefined();
  });
});
