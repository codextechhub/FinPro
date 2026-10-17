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
 *   4. Each tab's count is the server's count for it: Drafts leaves out the
 *      journals sent back, which the Sent back tab counts.
 *   5. The export asks for what the list asks for: the Sent back tab exports
 *      the journals sent back (approval=returned), and Drafts the drafts.
 *   6. The list has one period control, the Year picker every document list
 *      offers: FY 2015 or a custom range reaches the list, the counts and the
 *      export alike.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ journals: vi.fn(), summary: vi.fn(), exported: vi.fn(), rows: [] as unknown[], summaryData: undefined as unknown, opened: [] as (number | null)[] }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: {} }),
  useAppDispatch: () => () => undefined,
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
vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
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
    return { data: mocks.summaryData };
  },
}));
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: { data: [
    { id: 1, year: 2015, start_date: "2014-09-01", end_date: "2015-08-31", is_archived: false },
  ] } }),
}));
vi.mock("./direct-entry-drawer", () => ({ DirectEntryDrawer: () => null }));
vi.mock("./journal-detail-drawer", () => ({
  JournalDetailDrawer: ({ journalId }: { journalId: number | null }) => { mocks.opened.push(journalId); return null; },
}));

import GeneralLedgerPage from "./index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JOURNAL = {
  id: 3, document_number: "JE-0003", date: "2026-09-01", period: "2026-09", period_label: "September 2026", source: "MANUAL", status: "POSTED",
  narration: "Accrual", reference: "", posted_at: "2026-09-01T10:00:00Z", total_debit: 500_000,
  created_by: "Mr Eze", created_by_id: 14, created_by_is_exited: true,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.journals.mockReset();
  mocks.summary.mockReset();
  mocks.rows = [];
  mocks.summaryData = undefined;
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

describe("the tab counts", () => {
  it("count drafts apart from the journals sent back", () => {
    mocks.summaryData = { data: {
      total: 9, by_status: { DRAFT: 3, POSTED: 4 }, sent_back: 2,
      posted_total: { kobo: 0, naira: "0.00" }, reversed_total: { kobo: 0, naira: "0.00" },
    } };
    mount();
    const tabs = [...container.querySelectorAll("button")].map((b) => b.textContent?.replace(/\s+/g, " ").trim() ?? "");
    expect(tabs).toContain("Drafts 3");
    expect(tabs).toContain("Sent back 2");
  });
});

describe("the Period column", () => {
  it("names a journal's month in words, never by its stored name", () => {
    mocks.rows = [JOURNAL];
    mount();
    expect(container.textContent).toContain("September 2026");
    expect(container.textContent).not.toContain("2026-09");
  });
});

describe("the journal list's period", () => {
  it("is the one Year picker, and the list, counts and export all ask for it", () => {
    mount("/finance/ledger?year=2015");
    expect(container.querySelectorAll('select[aria-label="Year"]')).toHaveLength(1);
    expect(container.querySelector('select[aria-label="Period"]')).toBeNull();
    expect(mocks.journals.mock.lastCall?.[0]).toMatchObject({ fiscal_year: 2015 });
    expect(mocks.summary.mock.lastCall?.[0]).toEqual({ entity: "BSS", fiscal_year: 2015 });
    expect(mocks.exported.mock.lastCall?.[0]).toMatchObject({ fiscal_year: 2015 });
    expect(mocks.exported.mock.lastCall?.[0]).not.toHaveProperty("date_from");
  });

  it("sends custom dates as the range, without a year", () => {
    mount("/finance/ledger?year=custom&from=2015-03-01&to=2015-05-31");
    expect(mocks.journals.mock.lastCall?.[0]).toMatchObject({ date_from: "2015-03-01", date_to: "2015-05-31" });
    expect(mocks.journals.mock.lastCall?.[0]).not.toHaveProperty("fiscal_year");
    expect(mocks.exported.mock.lastCall?.[0]).toMatchObject({ date_from: "2015-03-01", date_to: "2015-05-31" });
  });
});
