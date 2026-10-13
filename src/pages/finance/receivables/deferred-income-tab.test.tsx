/**
 * Bright Star's deferred income. September's release posted one journal at
 * Ikeja and one at Lekki and its month is open; August's is closed; a July
 * release was already reversed. The undo form offers September alone, with
 * what it holds, and the list follows the branch picked. When Lekki has closed
 * its own September while the school's is still open, the undo (which
 * reverses Ikeja's and Lekki's releases together) would be refused, and the
 * server says so on both rows: the form lists September greyed out with the
 * server's reason, and the release list shows it under the rows.
 *
 * Field Access: each figure, column and filter is a `finance.deferredincome`
 * field. A role that may not read one sees the screen without it, its header and
 * its filter; the release run submits `up_to` and the undo submits `period`, the
 * two writable fields.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(), releases: vi.fn(), rows: [] as unknown[],
  access: {} as Record<string, unknown>,
  summaryData: {} as Record<string, unknown>,
  release: vi.fn(), reverse: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.access,
  }),
}));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingDateField: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <label>{label}<input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /></label>
  ),
}));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: true, branchIds: null, covers: () => true }),
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  hostBranchLens: () => ({ applies: true, pinnedBranch: null, branch: "all", choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false }),
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetDeferredIncomeQuery: (args: unknown) => {
    mocks.summary(args);
    return { data: { data: mocks.summaryData }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useGetDeferredIncomeReleasesQuery: (args: unknown) => {
    mocks.releases(args);
    return { data: { data: mocks.rows, pagination: { currentPage: 1, totalPages: 1 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() };
  },
  useReleaseDeferredIncomeMutation: () => [mocks.release, { isLoading: false }],
  useReverseDeferredIncomeMutation: () => [mocks.reverse, { isLoading: false }],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { DeferredIncomeReleaseRow } from "@/redux/services/finance/fees-types";
import { DeferredIncomeTab, undoableMonths } from "./deferred-income-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (over: Partial<DeferredIncomeReleaseRow>): DeferredIncomeReleaseRow => ({
  id: 1, branch_id: 1, branch_name: "Ikeja", date: "2026-09-30", month: "2026-09", period_id: 9, period_name: "2026-09", period_label: "September 2026",
  period_status: "OPEN", branch_period_status: "OPEN", amount: 1_000_000, journal_id: 400, journal_number: "JE-0400",
  reversed: false, reversed_at: null, can_reverse: true, reverse_blocked_reason: null, ...over,
});
const ROWS = [
  row({}),
  row({ id: 2, branch_id: 2, branch_name: "Lekki", amount: 500_000, journal_id: 401, journal_number: "JE-0401" }),
  row({
    id: 3, date: "2026-08-31", month: "2026-08", period_id: 8, period_name: "2026-08", period_label: "August 2026", period_status: "CLOSED",
    branch_period_status: "CLOSED", can_reverse: false, reverse_blocked_reason: "August 2026 is closed; its deferred income releases belong to the closed month. Reopen the month first.",
  }),
  row({ id: 4, date: "2026-07-31", month: "2026-07", period_id: 7, period_name: "2026-07", period_label: "July 2026", reversed: true, can_reverse: false }),
];

const SHARED_REASON = "Lekki has closed September 2026, and the undo reverses every branch's release of the month together.";
/** Lekki has closed its own September; the school's month is still open. */
const LEKKI_CLOSED_SEPTEMBER = [
  row({ can_reverse: false, reverse_blocked_reason: SHARED_REASON }),
  row({
    id: 2, branch_id: 2, branch_name: "Lekki", amount: 500_000, journal_id: 401, journal_number: "JE-0401",
    branch_period_status: "CLOSED", can_reverse: false,
    reverse_blocked_reason: "Lekki has closed September 2026; its release cannot be undone while that month is closed.",
  }),
  ...ROWS.slice(2),
];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.summary.mockReset();
  mocks.releases.mockReset();
  mocks.rows = ROWS;
  mocks.access = {};
  mocks.summaryData = { pending: 3_000_000, released: 1_000_000, by_month: [{ month: "2026-10", amount: 2_000_000 }] };
  mocks.release.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Released.", data: { releases: [] } }) });
  mocks.reverse.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Undone.", data: {} }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the months a release can be undone in", () => {
  it("are the open months with a release not yet reversed, each once with its total", () => {
    expect(undoableMonths(ROWS)).toEqual([{ periodId: 9, name: "September 2026", amount: 1_500_000, journals: 2, blockedReason: null }]);
  });

  it("carry the server's reason when a branch has closed an open month, from the row that names it", () => {
    expect(undoableMonths(LEKKI_CLOSED_SEPTEMBER)).toEqual([
      { periodId: 9, name: "September 2026", amount: 1_500_000, journals: 2, blockedReason: SHARED_REASON },
    ]);
    const lekkiOnly = LEKKI_CLOSED_SEPTEMBER.filter((r) => r.branch_id === 2);
    expect(undoableMonths(lekkiOnly)[0].blockedReason).toBe("Lekki has closed September 2026; its release cannot be undone while that month is closed.");
  });
});

describe("the deferred income tab", () => {
  it("lists the releases posted, and follows the branch picked", () => {
    act(() => root.render(<MemoryRouter initialEntries={["/finance/receivables/deferred-income?branch=2"]}><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
    expect(mocks.summary).toHaveBeenLastCalledWith({ entity: "BSS", branch: 2 });
    expect(mocks.releases).toHaveBeenCalledWith({ entity: "BSS", page: 1, branch: 2 });
    expect(container.textContent).toContain("JE-0401");
  });

  it("offers in the undo form only the months that can be undone", async () => {
    act(() => root.render(<MemoryRouter><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
    const undo = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Undo a month"));
    await act(async () => { undo?.click(); });
    expect(mocks.releases).toHaveBeenCalledWith({ entity: "BSS", reversed: "false", page_size: 100 });
    const options = Array.from(document.body.querySelectorAll('select[aria-label="Month"] option')).map((o) => o.textContent);
    expect(options).toEqual(["Select a month", "September 2026: ₦15,000.00 in 2 journals"]);
    expect(options.join(" ")).not.toContain("2026-09");
  });

  it("names a release's month in words in the list, never by its stored name", () => {
    act(() => root.render(<MemoryRouter><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
    expect(container.textContent).toContain("September 2026");
    expect(container.textContent).not.toContain("2026-09");
  });

  it("greys out a month one branch has closed, gives the server's reason, and says it under the rows", async () => {
    mocks.rows = LEKKI_CLOSED_SEPTEMBER;
    act(() => root.render(<MemoryRouter><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
    const undo = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Undo a month"));
    await act(async () => { undo?.click(); });
    const september = Array.from(document.body.querySelectorAll<HTMLOptionElement>('select[aria-label="Month"] option'))
      .find((o) => o.value === "9");
    expect(september?.textContent).toBe("September 2026: cannot be undone");
    expect(september?.disabled).toBe(true);
    expect(document.body.querySelector("[role=dialog]")?.textContent ?? document.body.textContent).toContain(SHARED_REASON);
    expect(container.textContent).toContain("its release cannot be undone while that month is closed");
    expect(container.textContent).not.toContain("August 2026 is closed");
  });
});

const RESOURCE = "finance.deferredincome";

/** A payload as the server sends it to a role that may not read these keys. */
const served = <T extends object>(row: T, keys: string[]): Partial<T> =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key))) as Partial<T>;

/** Restricts the role and feeds the screen the rows and figures the server would send it. */
const restrict = (restrictions: { hidden?: string[]; read_only?: string[] }) => {
  mocks.access = { [RESOURCE]: restrictions };
  const hidden = restrictions.hidden ?? [];
  mocks.rows = (mocks.rows as DeferredIncomeReleaseRow[]).map((r) => served(r, hidden));
  mocks.summaryData = served(mocks.summaryData, hidden);
};

const mount = (path = "/finance/receivables/deferred-income") => {
  act(() => root.render(<MemoryRouter initialEntries={[path]}><DeferredIncomeTab entity="BSS" currency="NGN" /></MemoryRouter>));
};
const button = (text: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(text));
const headers = () => Array.from(container.querySelectorAll("table")).map((t) => Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent?.trim()));
const text = () => container.textContent ?? "";

/** Every table has as many cells in its first row as it has headers. */
const alignedTables = () => Array.from(container.querySelectorAll("table")).every((t) => {
  const head = t.querySelectorAll("thead th").length;
  const first = t.querySelector("tbody tr");
  return !first || first.querySelectorAll("td").length === head;
});

describe("deferred income under Field Access", () => {
  it("shows every column and card when nothing is restricted", () => {
    mount();
    expect(headers()[1]).toEqual(["Date", "Branch", "Month", "Journal", "Released", "Status"]);
    expect(text()).toContain("Waiting to be released");
    expect(text()).toContain("Released to income");
    expect(text()).toContain("Due by month");
    expect(alignedTables()).toBe(true);
  });

  it("keeps the branch picker and column whatever the map lists", () => {
    restrict({ hidden: ["branch_id", "branch_name"] });
    mount();
    expect(container.querySelector('select[aria-label="Branch"]')).not.toBeNull();
    expect(headers()[1]).toEqual(["Date", "Branch", "Month", "Journal", "Released", "Status"]);
    expect(alignedTables()).toBe(true);
  });

  it("removes the cards and the month table whose figures are hidden", () => {
    restrict({ hidden: ["pending", "released", "by_month"] });
    mount();
    expect(text()).not.toContain("Waiting to be released");
    expect(text()).not.toContain("Released to income");
    expect(text()).not.toContain("Due by month");
    expect(headers()).toHaveLength(1);
  });

  it("keeps the other card when one figure is hidden", () => {
    restrict({ hidden: ["pending"] });
    mount();
    expect(text()).not.toContain("Waiting to be released");
    expect(text()).toContain("Released to income");
  });

  it("drops the columns whose fields are hidden, header and cell together", () => {
    restrict({ hidden: ["amount", "journal_id", "journal_number", "date"] });
    mount();
    expect(headers()[1]).toEqual(["Branch", "Month", "Status"]);
    expect(alignedTables()).toBe(true);
    expect(text()).not.toContain("JE-0400");
  });

  it("names the month from the release date when the accounting period is hidden", () => {
    restrict({ hidden: ["period", "period_id", "period_name", "period_label", "period_status", "branch_period_status"] });
    mount();
    expect(headers()[1]).toContain("Month");
    expect(text()).toContain("Sep 2026");
    expect(text()).not.toContain("September 2026");
    expect(text()).not.toContain("2026-09");
    expect(button("Undo a month")).toBeUndefined();
  });

  it("leaves out the Month column when neither the period nor the release date is readable", () => {
    restrict({ hidden: ["period_label", "month"] });
    mount();
    expect(headers()[1]).not.toContain("Month");
    expect(alignedTables()).toBe(true);
  });

  it("drops the Status column when both the reversal state and the blocked reason are hidden", () => {
    restrict({ hidden: ["reversed", "reversed_at", "can_reverse", "reverse_blocked_reason"] });
    mount();
    expect(headers()[1]).not.toContain("Status");
    expect(alignedTables()).toBe(true);
  });

  it("keeps the blocked reason under a row when only the state is hidden", () => {
    mocks.rows = LEKKI_CLOSED_SEPTEMBER;
    restrict({ hidden: ["reversed", "reversed_at", "can_reverse"] });
    mount();
    expect(text()).toContain("its release cannot be undone while that month is closed");
    expect(headers()[1]).toContain("Status");
  });

  it("hides the reason but keeps the state when only the reason is hidden", () => {
    mocks.rows = LEKKI_CLOSED_SEPTEMBER;
    restrict({ hidden: ["reverse_blocked_reason"] });
    mount();
    expect(headers()[1]).toContain("Status");
    expect(text()).not.toContain("cannot be undone while that month is closed");
  });

  it("offers no undo to a role that may not write the period or read the reversal state", () => {
    mount();
    expect(button("Undo a month")).toBeDefined();
    restrict({ read_only: ["period", "period_id", "period_name", "period_label", "period_status", "branch_period_status"] });
    mount();
    expect(button("Undo a month")).toBeUndefined();
    restrict({ hidden: ["reversed", "reversed_at", "can_reverse"] });
    mount();
    expect(button("Undo a month")).toBeUndefined();
  });

  it("still offers the release when the date may not be written", () => {
    restrict({ read_only: ["up_to", "date", "month"] });
    mount();
    expect(button("Release due income")).toBeDefined();
  });

  it("lists the months without amounts when the release amount is hidden", async () => {
    restrict({ hidden: ["amount"] });
    mount();
    await act(async () => { button("Undo a month")?.click(); });
    const options = Array.from(document.body.querySelectorAll('select[aria-label="Month"] option')).map((o) => o.textContent);
    expect(options).toEqual(["Select a month", "September 2026: 2 journals"]);
  });

  it("sends the undo with the period it was given", async () => {
    mount();
    await act(async () => { button("Undo a month")?.click(); });
    const select = document.body.querySelector<HTMLSelectElement>('select[aria-label="Month"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "9");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { button("Undo release")?.click(); });
    expect(mocks.reverse).toHaveBeenCalledWith({ entity: "BSS", period: 9 });
  });

  it("shows the refusal beside the month when the server refuses the period", async () => {
    mocks.reverse.mockReturnValue({ unwrap: async () => { throw { status: 403, data: { error: { code: "field_write_denied", detail: { period: ["You do not have permission to change this field."] } } } }; } });
    mount();
    await act(async () => { button("Undo a month")?.click(); });
    const select = document.body.querySelector<HTMLSelectElement>('select[aria-label="Month"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "9");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { button("Undo release")?.click(); });
    expect(document.body.querySelector('[data-field="period"] [role=alert]')?.textContent).toContain("do not have permission");
  });
});

describe("the release run under Field Access", () => {
  const run = async () => {
    await act(async () => { button("Release due income")?.click(); });
    await act(async () => { Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Release")?.click(); });
  };

  it("submits the release date when it may be written", async () => {
    mount();
    await run();
    expect(mocks.release).toHaveBeenCalledWith({ entity: "BSS", up_to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(document.body.querySelector('[data-field="up_to"]')).toBeNull();
  });

  it("shows the date greyed and does not send it when it is read-only", async () => {
    restrict({ read_only: ["up_to", "date", "month"] });
    mount();
    await act(async () => { button("Release due income")?.click(); });
    expect(document.body.querySelector('[data-field="up_to"]')?.getAttribute("data-read-only")).toBe("true");
    await act(async () => { Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Release")?.click(); });
    expect(mocks.release).toHaveBeenCalledWith({ entity: "BSS" });
  });

  it("leaves the date out and releases up to today when it is hidden", async () => {
    restrict({ hidden: ["up_to", "date", "month"] });
    mount();
    await act(async () => { button("Release due income")?.click(); });
    expect(document.body.querySelector('[data-field="up_to"]')).toBeNull();
    expect(document.body.textContent).toContain("due by today");
    await act(async () => { Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Release")?.click(); });
    expect(mocks.release).toHaveBeenCalledWith({ entity: "BSS" });
  });

  it("drops the hidden columns from the table of what the run posted", async () => {
    restrict({ hidden: ["journal_id", "amount"] });
    mocks.release.mockReturnValue({ unwrap: async () => ({ message: "Released.", data: { releases: [{ id: 7, branch_id: 1, date: "2026-10-12" }] } }) });
    mount();
    await run();
    expect(text()).toContain("This release posted 1 journal");
    expect(headers().at(-2)).toEqual(["Branch", "Date"]);
    expect(alignedTables()).toBe(true);
  });

  it("shows the refusal beside the date", async () => {
    mocks.release.mockReturnValue({ unwrap: async () => { throw { status: 403, data: { error: { code: "field_write_denied", detail: { up_to: ["You do not have permission to change this field."] } } } }; } });
    mount();
    await run();
    expect(document.body.querySelector('[data-field="up_to"] [role=alert]')?.textContent).toContain("do not have permission");
  });
});
