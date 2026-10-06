/**
 * Journal Entries at Bright Star.
 *
 *   1. The status counts ask the summary for the same archived years the list
 *      shows, so "Posted 12" sits over twelve rows: archived years are left out
 *      of both until "Show archived years" is ticked, and taken in by both after.
 *   2. A journal Mr Eze raised before he left keeps his name, with the dashed
 *      outline and its "No longer on the staff" title.
 *   3. A link from another screen (`?document=501`, an inter-branch transfer's
 *      journal) opens that journal.
 *   4. The export asks for what the list asks for: the Sent back tab exports
 *      the journals sent back (approval=returned), and Drafts the drafts.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ journals: vi.fn(), summary: vi.fn(), exported: vi.fn(), rows: [] as unknown[], opened: [] as (number | null)[] }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("../finance-shell", () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/layout/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveEntity: () => ({ code: "BSS", currency: "NGN", entity: null, isLoading: false }),
}));
vi.mock("@/components/finance-ui/archived-years", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ShowArchivedToggle: () => null,
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  QuickExportButton: (props: { params?: Record<string, unknown> }) => { mocks.exported(props.params); return null; },
  UserAvatar: ({ name, className }: { name?: string; className?: string }) => <span data-avatar={name} className={className} />,
}));
vi.mock("@/redux/services/finance/gl-api", () => ({
  useGetJournalsQuery: (args: unknown) => {
    mocks.journals(args);
    return { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  useGetJournalSummaryQuery: (args: unknown) => {
    mocks.summary(args);
    return { data: undefined };
  },
}));
vi.mock("./direct-entry-drawer", () => ({ DirectEntryDrawer: () => null }));
vi.mock("./journal-detail-drawer", () => ({
  JournalDetailDrawer: ({ journalId }: { journalId: number | null }) => { mocks.opened.push(journalId); return null; },
}));

import GeneralLedgerPage from "./index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JOURNAL = {
  id: 3, document_number: "JE-0003", date: "2026-09-01", period: "Sep 2026", source: "MANUAL", status: "POSTED",
  narration: "Accrual", reference: "", posted_at: "2026-09-01T10:00:00Z", total_debit: 500_000,
  created_by: "Mr Eze", created_by_id: 14, created_by_is_exited: true,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.journals.mockReset();
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

function mount(path = "/finance/ledger") {
  act(() => root.render(<MemoryRouter initialEntries={[path]}><GeneralLedgerPage /></MemoryRouter>));
}

describe("the journal counts", () => {
  it("leave archived years out with the list, and take them in with it", () => {
    mount();
    expect(mocks.journals.mock.lastCall?.[0]).not.toHaveProperty("include_archived");
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS" });

    act(() => root.unmount());
    root = createRoot(container);
    mount("/finance/ledger?archived=1");
    expect(mocks.journals.mock.lastCall?.[0]).toMatchObject({ include_archived: "true" });
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS", include_archived: "true" });
  });
});

describe("who raised a journal", () => {
  it("outlines somebody who has left, and only them", () => {
    mocks.rows = [JOURNAL, { ...JOURNAL, id: 4, document_number: "JE-0004", created_by: "Mrs Bello", created_by_is_exited: false }];
    mount();
    const eze = container.querySelector('[data-avatar="Mr Eze"]');
    const bello = container.querySelector('[data-avatar="Mrs Bello"]');
    expect(eze?.className).toContain("outline-dashed");
    expect(eze?.parentElement?.getAttribute("title")).toBe("No longer on the staff");
    expect(bello?.className).not.toContain("outline-dashed");
  });
});

describe("a link to one journal", () => {
  it("opens the journal its address names", () => {
    mocks.opened = [];
    mount("/finance/ledger?document=501");
    expect(mocks.opened.at(-1)).toBe(501);
  });
});

describe("the journal export", () => {
  const tab = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label))!;

  it("exports what was sent back from the Sent back tab, and the drafts from Drafts", () => {
    mount();
    act(() => tab("Sent back").click());
    expect(mocks.journals.mock.lastCall?.[0]).toMatchObject({ approval: "returned" });
    expect(mocks.exported.mock.lastCall?.[0]).toMatchObject({ approval: "returned" });
    expect(mocks.exported.mock.lastCall?.[0]).not.toHaveProperty("status");

    act(() => tab("Drafts").click());
    expect(mocks.exported.mock.lastCall?.[0]).toMatchObject({ status: "DRAFT" });
    expect(mocks.exported.mock.lastCall?.[0]).not.toHaveProperty("approval");
  });
});
