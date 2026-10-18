/**
 * Who may change the reminder policies at Bright Star (Ikeja and Lekki).
 *
 * A policy binds every branch, so the server takes a change from a
 * whole-school reader only. Mrs Bello covers both branches and holding the keys
 * is offered New policy, Edit, the active switch and Configure cadence. Mrs
 * Adeyemi is Lekki's own bursar: holding the same keys she reads the policies,
 * is told why she cannot change them, and is offered nothing the server would
 * refuse. A reader without the keys is offered nothing and told nothing.
 *
 * The reminder queue answers for the branch on the sidebar switcher and the
 * year in the page address. The age buckets follow the branch only: they age
 * what is owed today, so Mrs Bello picking FY 2015 does not move them.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  denied: new Set<string>(),
  wholeSchool: true,
  summary: undefined as unknown,
  summaryArgs: vi.fn(),
  notices: vi.fn(),
  lens: { applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false } as unknown,
}));

const { idle } = vi.hoisted(() => ({ idle: () => [vi.fn(), { isLoading: false }] }));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetDunningSummaryQuery: (args: unknown) => (mocks.summaryArgs(args), { data: mocks.summary === undefined ? undefined : { data: mocks.summary } }),
  useGetDunningPoliciesQuery: () => ({
    data: { data: [{ id: 1, name: "Standard 7/14/30-day", is_active: true, is_default: true, stages: [] }] },
  }),
  useGetDunningNoticesQuery: (args: unknown) => (mocks.notices(args), {
    data: { data: [], pagination: { currentPage: 1, totalPages: 2 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useGenerateDunningMutation: idle,
  useCancelDunningNoticeMutation: idle,
  useSendDunningNoticeMutation: idle,
  useCreateDunningPolicyMutation: idle,
  useUpdateDunningPolicyMutation: idle,
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: { data: [{ id: 1, year: 2015, start_date: "2014-09-01", end_date: "2015-08-31", is_archived: false }] } }),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("../../../host", async () => (await import("../../../host-fake")).fakeHost({
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
  hostBranchLens: () => mocks.lens,
}));

import { P } from "../../../permissions";
import { DunningTab } from "./dunning-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.denied = new Set();
  mocks.wholeSchool = true;
  mocks.summary = undefined;
  mocks.summaryArgs.mockReset();
  mocks.notices.mockReset();
  mocks.lens = { applies: false, pinnedBranch: null, branch: "all", choices: [], isLoading: false };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text));
const toggle = () => container.querySelector<HTMLButtonElement>("button[aria-pressed]");

function openPolicies() {
  act(() => root.render(<MemoryRouter initialEntries={["/finance/receivables/dunning"]}><DunningTab entity="BSS" currency="NGN" /></MemoryRouter>));
  act(() => button("Policies")!.click());
}

describe("the reminder policies", () => {
  it("can be changed by a whole-school holder of the keys", () => {
    openPolicies();
    expect(button("New policy")).toBeTruthy();
    expect(button("Edit")).toBeTruthy();
    expect(toggle()?.disabled).toBe(false);
    expect(button("Configure cadence")).toBeTruthy();
    expect(container.querySelector("[data-testid=dunning-read-only]")).toBeNull();
  });

  it("are read-only for a branch's own bursar holding the keys, who is told why", () => {
    mocks.wholeSchool = false;
    openPolicies();
    expect(button("New policy")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
    expect(toggle()?.disabled).toBe(true);
    expect(button("Configure cadence")).toBeUndefined();
    expect(container.querySelector("[data-testid=dunning-read-only]")?.textContent).toContain("apply to every branch");
  });

  it("offer nothing, and say nothing, to a reader without the keys", () => {
    mocks.denied = new Set([P.FIN_CREATE_DUNNING, P.FIN_UPDATE_DUNNING]);
    openPolicies();
    expect(button("New policy")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
    expect(container.querySelector("[data-testid=dunning-read-only]")).toBeNull();
  });
});

describe("the ageing strip", () => {
  const tiles = () => [...container.querySelectorAll("[data-testid=aging-tile]")];
  const open = () => act(() => root.render(<MemoryRouter initialEntries={["/finance/receivables/dunning"]}><DunningTab entity="BSS" currency="NGN" /></MemoryRouter>));

  it("shows each bucket's amount and invoice count when the balance is readable", () => {
    mocks.summary = {
      due_soon: { amount: 100000, count: 2 }, overdue_1_30: { amount: 250000, count: 1 },
      overdue_31_60: { amount: 0, count: 0 }, overdue_60_plus: { amount: 500000, count: 3 },
    };
    open();
    expect(tiles()).toHaveLength(4);
    expect(tiles()[0].textContent).toContain("2 invoices");
    expect(tiles()[0].textContent).toContain("1,000");
    expect(tiles()[3].textContent).toContain("3 invoices");
  });

  it("shows counts without amounts when the balance is hidden", () => {
    mocks.summary = {
      due_soon: { count: 2 }, overdue_1_30: { count: 1 }, overdue_31_60: { count: 0 }, overdue_60_plus: { count: 3 },
    };
    open();
    expect(tiles()).toHaveLength(4);
    expect(tiles().map((t) => t.querySelectorAll("p").length)).toEqual([2, 2, 2, 2]);
    expect(tiles()[0].textContent).toBe("Due soon (0–7d)2 invoices");
    expect(tiles()[1].textContent).toBe("Overdue 1–30d1 invoice");
    expect(container.textContent).not.toMatch(/NaN|undefined|₦0/);
  });

  it("leaves the strip out when the account status is hidden", () => {
    mocks.summary = {};
    open();
    expect(tiles()).toHaveLength(0);
    expect(container.textContent).not.toContain("Due soon");
  });
});

describe("the reminder queue's branch and year", () => {
  const LEKKI = { applies: true, pinnedBranch: null, branch: 2, choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false };
  const show = (path: string) => act(() => root.render(
    <MemoryRouter initialEntries={[path]}><DunningTab entity="BSS" currency="NGN" /></MemoryRouter>,
  ));
  const year = () => container.querySelector<HTMLSelectElement>('select[aria-label="Year"]')!;

  it("asks the queue for the switcher's branch and the year, and the age buckets for the branch alone", () => {
    mocks.lens = LEKKI;
    show("/finance/receivables/dunning?year=2015");
    expect(container.querySelector('select[aria-label="Branch"]')).toBeNull();
    expect(mocks.notices.mock.lastCall?.[0]).toEqual({ entity: "BSS", page: 1, branch: 2, fiscal_year: 2015 });
    expect(mocks.summaryArgs.mock.lastCall?.[0]).toEqual({ entity: "BSS", branch: 2 });
  });

  it("sends custom dates to the queue as a range and never to the age buckets", () => {
    show("/finance/receivables/dunning?year=custom&from=2015-03-01&to=2015-05-31");
    expect(mocks.notices.mock.lastCall?.[0]).toMatchObject({ date_from: "2015-03-01", date_to: "2015-05-31" });
    expect(mocks.notices.mock.lastCall?.[0]).not.toHaveProperty("fiscal_year");
    expect(mocks.summaryArgs.mock.lastCall?.[0]).toEqual({ entity: "BSS" });
  });

  it("offers the Year picker on the queue and not on the policies", () => {
    show("/finance/receivables/dunning");
    expect(year()).not.toBeNull();
    act(() => button("Policies")!.click());
    expect(container.querySelector('select[aria-label="Year"]')).toBeNull();
  });

  it("goes back to the first page when the year changes", () => {
    show("/finance/receivables/dunning");
    const next = Array.from(container.querySelectorAll("button")).find((b) => /next/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    act(() => next!.click());
    expect(mocks.notices.mock.lastCall?.[0]).toMatchObject({ page: 2 });
    act(() => {
      year().value = "2015";
      year().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.notices.mock.lastCall?.[0]).toMatchObject({ page: 1, fiscal_year: 2015 });
  });
});
