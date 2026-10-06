/**
 * The fiscal close workbench, branch by branch.
 *
 * Re-opening a month: the backend refuses a re-open without a reason, and
 * refuses any month of a closed or locked fiscal year outright. The drawer
 * answers both before the request is sent: its confirm stays disabled until a
 * reason is typed, the reason travels with the request, and a month of a shut
 * year is not offered a Re-open that would only be refused.
 *
 * The calendar is kept per branch. Harbour Primary runs one branch, so nothing
 * about branches is shown and no action names one. Bright Star runs Ikeja and
 * Lekki: with Lekki chosen in the page address the lists read Lekki's own
 * states and every action sends Lekki; under All branches the lists read the
 * school's states and every action asks which branch it is for. A CLOSED year
 * offers Re-open year to a holder of `finance.fiscalyear.reopen` who covers the
 * whole school, never to a branch's own bursar, with a required reason, and a refusal from the server is left to the central
 * handler so it is shown once.
 *
 * Forcing a month's close over a failing check is its own act: offered only to
 * a holder of `finance.period.force_close`, only while a blocking check fails,
 * and sent with `force` and the reason typed. Archiving puts a closed year away
 * for every branch: offered to a whole-school holder of the archive key on the
 * school's own state, refused before it is old enough, and an archived year is
 * unarchived before it can be re-opened. Under All branches each branch's own
 * month and year are listed, so a month held open by one branch says which.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reopen: vi.fn(),
  closePeriod: vi.fn(),
  closeYear: vi.fn(),
  reopenYear: vi.fn(),
  archiveYear: vi.fn(),
  unarchiveYear: vi.fn(),
  retention: null as null | { archive_min_age_years: number },
  checklist: vi.fn(),
  years: vi.fn(),
  periods: vi.fn(),
  yearRows: [] as { id: number; year: number; start_date: string; end_date: string; status: string; is_archived?: boolean; branch_states?: unknown[] }[],
  periodRows: [] as unknown[],
  denied: new Set<string>(),
  wholeSchool: true,
  lens: {
    applies: false,
    pinnedBranch: null as number | null,
    branch: "all" as number | "all",
    choices: [] as { id: number; name: string }[],
    isLoading: false,
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/redux/services/finance/setup-api", () => ({
  useCloseFiscalYearMutation: () => [mocks.closeYear, { isLoading: false }],
  useReopenFiscalYearMutation: () => [mocks.reopenYear, { isLoading: false }],
  useClosePeriodMutation: () => [mocks.closePeriod, { isLoading: false }],
  useGetFiscalYearPeriodsQuery: (...args: unknown[]) => {
    mocks.periods(...args);
    return { data: { data: mocks.periodRows }, isLoading: false, isFetching: false, isError: false };
  },
  useGetPeriodChecklistQuery: (...args: unknown[]) => mocks.checklist(...args),
  useLockPeriodMutation: () => [vi.fn(), { isLoading: false }],
  useReopenPeriodMutation: () => [mocks.reopen, { isLoading: false }],
  useStartFiscalYearMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/redux/services/finance/records-api", () => ({
  useArchiveFiscalYearMutation: () => [mocks.archiveYear, { isLoading: false }],
  useUnarchiveFiscalYearMutation: () => [mocks.unarchiveYear, { isLoading: false }],
  useGetRecordRetentionSettingsQuery: () => ({ data: mocks.retention ? { data: mocks.retention } : undefined }),
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: (...args: unknown[]) => {
    mocks.years(...args);
    return { data: { data: mocks.yearRows }, isLoading: false, isError: false };
  },
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hostBranchLens: () => mocks.lens,
  useBranches: () => ({ data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false }),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import { P } from "../../../permissions";
import { calendarBranchFor } from "./calendar-branch";
import { PeriodCloseDrawer, PeriodsTab } from "./periods-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MARCH = {
  id: 41,
  name: "March 2026",
  period_no: 3,
  start_date: "2026-03-01",
  end_date: "2026-03-31",
  status: "CLOSED",
};

const IKEJA = { id: 1, name: "Ikeja" };
const LEKKI = { id: 2, name: "Lekki" };

const FY = { id: 7, year: 2026, start_date: "2026-01-01", end_date: "2026-12-31" };
const H1 = { id: 51, name: "H1 2026", period_no: 1, fiscal_year: 2026, start_date: "2026-01-01", end_date: "2026-06-30", status: "CLOSED", closed_at: null };
const H2 = { id: 52, name: "H2 2026", period_no: 2, fiscal_year: 2026, start_date: "2026-07-01", end_date: "2026-12-31", status: "CLOSED", closed_at: null };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.reopen.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Re-opened." }) });
  mocks.closePeriod.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Closed.", data: {} }) });
  mocks.closeYear.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Fiscal year 2026 closed.", data: {} }) });
  mocks.reopenYear.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Fiscal year 2026 re-opened." }) });
  mocks.archiveYear.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Fiscal year 2026 archived." }) });
  mocks.unarchiveYear.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Fiscal year 2026 unarchived." }) });
  mocks.retention = null;
  mocks.years.mockReset();
  mocks.periods.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
  mocks.denied = new Set();
  mocks.wholeSchool = true;
  mocks.yearRows = [{ ...FY, status: "OPEN" }];
  mocks.periodRows = [H1, H2];
  mocks.lens = { applies: false, pinnedBranch: null, branch: "all", choices: [{ id: 9, name: "Main" }], isLoading: false };
  mocks.checklist.mockReturnValue({
    data: { data: { period: MARCH, items: [], done: 3, total: 3 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const atBrightStar = () => {
  mocks.lens = { applies: true, pinnedBranch: null, branch: "all", choices: [IKEJA, LEKKI], isLoading: false };
};

async function mountDrawer(yearShut: { year: number; status: string } | null = null) {
  await act(async () => {
    root.render(
      <PeriodCloseDrawer id={MARCH.id} entity="BRIGHTSTAR" finalPeriodOfOpenYear={false} yearShut={yearShut} onClose={() => undefined} />,
    );
  });
}

async function mountWorkbench(entity: string, search = "") {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/finance/setup/periods${search}`]}>
        <PeriodsTab entity={entity} />
      </MemoryRouter>,
    );
  });
}

const button = (label: string, scope: ParentNode = document.body) =>
  Array.from(scope.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);
/** The confirm dialog: the last dialog open, above a drawer when there is one. */
const dialog = () => Array.from(document.body.querySelectorAll<HTMLElement>("[role='dialog']")).at(-1) ?? null;
const pageBranchPicker = () => container.querySelector<HTMLSelectElement>("select[aria-label='Branch']");
const lastArgs = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];
/** The year reads the workbench itself makes, leaving out the archived-years lookup. */
const yearReads = () => mocks.years.mock.calls.map(([args]) => args).filter((args) => args.include_archived !== "true");

async function click(el: HTMLElement | undefined | null) {
  expect(el).toBeTruthy();
  await act(async () => el!.click());
}

async function typeReason(text: string) {
  const field = document.body.querySelector("textarea");
  expect(field).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(field, text);
    field!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pick(select: HTMLSelectElement | null, value: string) {
  expect(select).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(select, value);
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("re-opening a month", () => {
  it("keeps the confirm disabled until a reason is typed", async () => {
    await mountDrawer();
    await click(button("Re-open"));

    expect(button("Re-open period")?.disabled).toBe(true);

    await typeReason("   ");
    expect(button("Re-open period")?.disabled).toBe(true);

    await typeReason("A supplier bill dated in March arrived late");
    expect(button("Re-open period")?.disabled).toBe(false);
  });

  it("sends the typed reason with the re-open", async () => {
    await mountDrawer();
    await click(button("Re-open"));
    await typeReason("  A supplier bill dated in March arrived late  ");
    await click(button("Re-open period"));

    expect(mocks.reopen).toHaveBeenCalledWith({
      id: 41,
      entity: "BRIGHTSTAR",
      reason: "A supplier bill dated in March arrived late",
    });
  });

  it("does not offer a re-open in a closed fiscal year", async () => {
    await mountDrawer({ year: 2026, status: "CLOSED" });

    expect(button("Re-open")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Reopen the fiscal year before re-opening one of its months.");
  });
});

describe("Harbour Primary, a school with one branch", () => {
  it("shows no branch and reads the school's calendar", async () => {
    await mountWorkbench("HARBOUR");

    expect(pageBranchPicker()).toBeNull();
    expect(yearReads().at(-1)).toEqual({ entity: "HARBOUR" });
    expect(lastArgs(mocks.periods)).toEqual({ entity: "HARBOUR", year: 2026 });
    expect(container.textContent).not.toContain("The school's calendar.");
  });

  it("closes the year without naming a branch", async () => {
    await mountWorkbench("HARBOUR");
    await click(button("Close fiscal year", container));

    expect(dialog()?.textContent).toContain("Close fiscal year 2026?");
    expect(dialog()?.querySelector("select")).toBeNull();
    await click(button("Close fiscal year", dialog()!));

    expect(mocks.closeYear).toHaveBeenCalledWith({ id: 7, entity: "HARBOUR" });
  });

  it("re-opens a closed year with the reason alone", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    await mountWorkbench("HARBOUR");
    await click(button("Re-open year"));

    expect(dialog()?.textContent).toContain("Re-open fiscal year 2026?");
    expect(dialog()?.textContent).not.toContain("2026 for");
    await typeReason("June supplier bill arrived late");
    await click(button("Re-open fiscal year", dialog()!));

    expect(mocks.reopenYear).toHaveBeenCalledWith({ id: 7, entity: "HARBOUR", reason: "June supplier bill arrived late" });
  });
});

describe("Bright Star with Lekki chosen", () => {
  beforeEach(atBrightStar);

  it("reads Lekki's own years and months", async () => {
    await mountWorkbench("BRIGHTSTAR", "?branch=2");

    expect(pageBranchPicker()?.value).toBe("2");
    expect(yearReads().at(-1)).toEqual({ entity: "BRIGHTSTAR", branch: 2 });
    expect(lastArgs(mocks.periods)).toEqual({ entity: "BRIGHTSTAR", year: 2026, branch: 2 });
    expect(container.textContent).toContain("Fiscal year 2026 · Lekki");
  });

  it("closes Lekki's year without asking which branch", async () => {
    await mountWorkbench("BRIGHTSTAR", "?branch=2");
    await click(button("Close fiscal year", container));

    expect(dialog()?.textContent).toContain("Close fiscal year 2026 for Lekki?");
    expect(dialog()?.querySelector("select")).toBeNull();
    await click(button("Close fiscal year", dialog()!));

    expect(mocks.closeYear).toHaveBeenCalledWith({ id: 7, entity: "BRIGHTSTAR", branch: 2 });
  });

  it("re-reads the calendar for the branch chosen in the picker", async () => {
    await mountWorkbench("BRIGHTSTAR", "?branch=2");
    await pick(pageBranchPicker(), "1");

    expect(yearReads().at(-1)).toEqual({ entity: "BRIGHTSTAR", branch: 1 });
  });
});

describe("Bright Star under All branches", () => {
  beforeEach(atBrightStar);

  it("reads the school's calendar and says how it follows the branches", async () => {
    await mountWorkbench("BRIGHTSTAR");

    expect(pageBranchPicker()?.value).toBe("all");
    expect(yearReads()).toContainEqual({ entity: "BRIGHTSTAR", include_branches: "true" });
    expect(container.textContent).toContain("The school's calendar.");
  });

  it("asks which branch a year close is for, offering only the reader's branches", async () => {
    await mountWorkbench("BRIGHTSTAR");
    await click(button("Close fiscal year", container));

    const question = dialog()?.querySelector("select") ?? null;
    expect(Array.from(question?.options ?? []).map((o) => o.textContent)).toEqual(["Select branch", "Ikeja", "Lekki"]);
    expect(button("Close fiscal year", dialog()!)?.disabled).toBe(true);

    await pick(question, "1");
    expect(dialog()?.textContent).toContain("Close fiscal year 2026 for Ikeja?");
    expect(button("Close fiscal year", dialog()!)?.disabled).toBe(false);
    await click(button("Close fiscal year", dialog()!));

    expect(mocks.closeYear).toHaveBeenCalledWith({ id: 7, entity: "BRIGHTSTAR", branch: 1 });
  });

  it("asks which branch a month's close is for", async () => {
    mocks.checklist.mockReturnValue({
      data: { data: { period: { ...MARCH, status: "OPEN" }, items: [], done: 3, total: 3 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    await act(async () => {
      root.render(
        <PeriodCloseDrawer
          id={MARCH.id}
          entity="BRIGHTSTAR"
          finalPeriodOfOpenYear={false}
          calendar={calendarBranchFor(mocks.lens, null)}
          onClose={() => undefined}
        />,
      );
    });
    await click(button("Run close steps"));

    expect(button("Run period close")?.disabled).toBe(true);
    await pick(dialog()?.querySelector("select") ?? null, "2");
    await click(button("Run period close"));

    expect(mocks.closePeriod).toHaveBeenCalledWith({ id: 41, entity: "BRIGHTSTAR", soft: false, branch: 2 });
  });
});

describe("a branch's month in the drawer", () => {
  beforeEach(atBrightStar);

  it("acts on the branch's own status rather than the school's", async () => {
    mocks.checklist.mockReturnValue({
      data: { data: { period: { ...MARCH, status: "OPEN" }, items: [], done: 3, total: 3 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    await act(async () => {
      root.render(
        <PeriodCloseDrawer
          id={MARCH.id}
          entity="BRIGHTSTAR"
          finalPeriodOfOpenYear={false}
          calendar={calendarBranchFor(mocks.lens, "2")}
          status="CLOSED"
          onClose={() => undefined}
        />,
      );
    });

    expect(lastArgs(mocks.checklist)).toEqual({ id: 41, entity: "BRIGHTSTAR", branch: 2 });
    expect(button("Run close steps")).toBeUndefined();
    await click(button("Re-open"));
    await typeReason("A Lekki bill dated in March arrived late");
    await click(button("Re-open period"));

    expect(mocks.reopen).toHaveBeenCalledWith({ id: 41, entity: "BRIGHTSTAR", branch: 2, reason: "A Lekki bill dated in March arrived late" });
  });
});

describe("re-opening a fiscal year", () => {
  beforeEach(atBrightStar);

  it("is offered for a year Lekki has closed", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    await mountWorkbench("BRIGHTSTAR", "?branch=2");

    expect(button("Re-open year")).toBeTruthy();
    expect(button("Close fiscal year", container)).toBeUndefined();
  });

  it("is not offered for an open or a locked year", async () => {
    await mountWorkbench("BRIGHTSTAR", "?branch=2");
    expect(button("Re-open year")).toBeUndefined();

    mocks.yearRows = [{ ...FY, status: "LOCKED" }];
    await mountWorkbench("BRIGHTSTAR", "?branch=2");
    expect(button("Re-open year")).toBeUndefined();
  });

  it("is offered to a whole-school holder of the key", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    mocks.wholeSchool = true;
    await mountWorkbench("BRIGHTSTAR", "?branch=2");

    expect(button("Re-open year")).toBeTruthy();
  });

  it("is not offered to a branch's own bursar, even holding the key", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    mocks.wholeSchool = false;
    mocks.lens = { applies: true, pinnedBranch: 2, branch: 2, choices: [LEKKI], isLoading: false };
    await mountWorkbench("BRIGHTSTAR");

    expect(container.textContent).toContain("Fiscal year 2026 is sealed for Lekki");
    expect(button("Re-open year")).toBeUndefined();
  });

  it("is not offered to somebody without the re-open key", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    mocks.denied = new Set([P.FIN_REOPEN_FISCAL_YEAR]);
    await mountWorkbench("BRIGHTSTAR", "?branch=2");

    expect(button("Re-open year")).toBeUndefined();
  });

  it("needs a reason, then sends exactly the branch and the reason", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    await mountWorkbench("BRIGHTSTAR", "?branch=2");
    await click(button("Re-open year"));

    expect(dialog()?.textContent).toContain("Re-open fiscal year 2026 for Lekki?");
    expect(dialog()?.textContent).toContain("Reverses Lekki's year-end closing entry so a month can be corrected");
    expect(button("Re-open fiscal year", dialog()!)?.disabled).toBe(true);
    await typeReason("  A June bill for Lekki arrived late  ");
    expect(button("Re-open fiscal year", dialog()!)?.disabled).toBe(false);
    await click(button("Re-open fiscal year", dialog()!));

    expect(mocks.reopenYear).toHaveBeenCalledWith({ id: 7, entity: "BRIGHTSTAR", branch: 2, reason: "A June bill for Lekki arrived late" });
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("under All branches needs both a branch and a reason", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    await mountWorkbench("BRIGHTSTAR");
    await click(button("Re-open year"));
    await typeReason("A June bill arrived late");

    expect(button("Re-open fiscal year", dialog()!)?.disabled).toBe(true);
    await pick(dialog()?.querySelector("select") ?? null, "1");
    await click(button("Re-open fiscal year", dialog()!));

    expect(mocks.reopenYear).toHaveBeenCalledWith({ id: 7, entity: "BRIGHTSTAR", branch: 1, reason: "A June bill arrived late" });
  });

  it("leaves a refusal to the central handler, so it is shown once", async () => {
    mocks.yearRows = [{ ...FY, status: "CLOSED" }];
    mocks.reopenYear.mockReturnValue({
      unwrap: () => Promise.reject({ status: 400, data: { message: "Fiscal year 2026 is archived. Unarchive it before re-opening it." } }),
    });
    await mountWorkbench("BRIGHTSTAR", "?branch=2");
    await click(button("Re-open year"));
    await typeReason("A June bill arrived late");
    await click(button("Re-open fiscal year", dialog()!));

    expect(mocks.reopenYear).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Re-open fiscal year 2026 for Lekki?");
  });
});

const FAILING_BANK = { name: "trial_balance_balanced", passed: false, blocking: true, detail: "Debits exceed credits by ₦50.00" };

function checklistWith(items: unknown[], status = "OPEN") {
  mocks.checklist.mockReturnValue({
    data: { data: { period: { ...MARCH, status }, items, done: 0, total: items.length } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

describe("opening a new fiscal year", () => {
  beforeEach(atBrightStar);

  it("is offered to a whole-school holder of the key", async () => {
    await mountWorkbench("BRIGHTSTAR");

    expect(button("New fiscal year", container)).toBeTruthy();
  });

  it("is not offered to a branch's own bursar, even holding the key", async () => {
    mocks.wholeSchool = false;
    mocks.lens = { applies: true, pinnedBranch: 2, branch: 2, choices: [LEKKI], isLoading: false };
    await mountWorkbench("BRIGHTSTAR");

    expect(button("New fiscal year", container)).toBeUndefined();
  });

  it("is not offered to somebody without the key", async () => {
    mocks.denied = new Set([P.FIN_CREATE_PERIOD]);
    await mountWorkbench("BRIGHTSTAR");

    expect(button("New fiscal year", container)).toBeUndefined();
  });
});

describe("forcing a month's close over a failing check", () => {
  it("is offered to a holder of the force key while a blocking check fails", async () => {
    checklistWith([FAILING_BANK]);
    await mountDrawer();

    expect(button("Force close")).toBeTruthy();
    expect(document.body.textContent).toContain("You may force the close with a reason.");
  });

  it("is not offered without the force key", async () => {
    checklistWith([FAILING_BANK]);
    mocks.denied = new Set([P.FIN_FORCE_CLOSE_PERIOD]);
    await mountDrawer();

    expect(button("Force close")).toBeUndefined();
    expect(button("Run close steps")).toBeTruthy();
  });

  it("is not offered when every blocking check passes", async () => {
    checklistWith([{ ...FAILING_BANK, passed: true }, { name: "no_draft_journals", passed: false, blocking: false, detail: "" }]);
    await mountDrawer();

    expect(button("Force close")).toBeUndefined();
  });

  it("names the checks it overrides, needs a reason, and sends force with it", async () => {
    checklistWith([FAILING_BANK]);
    await mountDrawer();
    await click(button("Force close"));

    expect(dialog()?.textContent).toContain("Checks you are overriding");
    expect(dialog()?.textContent).toContain("Trial balance balanced: Debits exceed credits by ₦50.00");
    expect(button("Force close", dialog()!)?.disabled).toBe(true);
    await typeReason("  The accountant agreed the March bank balance  ");
    await click(button("Force close", dialog()!));

    expect(mocks.closePeriod).toHaveBeenCalledWith({
      id: 41, entity: "BRIGHTSTAR", soft: false, force: true,
      reason: "The accountant agreed the March bank balance",
    });
  });
});

describe("work the close does itself", () => {
  const DEPRECIATION_DUE = {
    name: "depreciation_posted", passed: true, blocking: true, done_by_close: true,
    detail: "6 depreciation charges are due; closing the period posts them.",
  };

  it("reads as done by the close, not as a check that blocks it", async () => {
    checklistWith([DEPRECIATION_DUE]);
    await mountDrawer();

    expect(document.body.textContent).toContain("Done by the close");
    expect(document.body.textContent).not.toContain("Blocks the close");
    expect(document.body.textContent).not.toContain("must pass before this period can close");
    expect(document.body.textContent).toContain("closing the period posts them.");
    expect(button("Force close")).toBeUndefined();
  });
});

describe("months closing in order", () => {
  const AUGUST_OPEN = {
    name: "earlier_periods_closed", passed: false, blocking: true, done_by_close: false,
    detail: "Close August 2026 first. Months close in order, so September 2026 can close once every earlier month is closed.",
  };

  it("shows the month in the way as a blocker that force close cannot get past", async () => {
    checklistWith([AUGUST_OPEN, FAILING_BANK]);
    await mountDrawer();

    expect(document.body.textContent).toContain("Earlier months closed");
    expect(document.body.textContent).toContain("Close August 2026 first.");
    expect(document.body.textContent).toContain("Blocks the close");
    expect(button("Force close")).toBeUndefined();
    expect(document.body.textContent).not.toContain("You may force the close with a reason.");
  });
});

describe("archiving a closed year", () => {
  const CLOSED_2026 = { ...FY, status: "CLOSED", is_archived: false };

  it("is offered to a whole-school holder of the key once the year is old enough", async () => {
    mocks.yearRows = [{ ...CLOSED_2026, id: 6, year: 2020, start_date: "2020-01-01", end_date: "2020-12-31" }];
    mocks.retention = { archive_min_age_years: 2 };
    await mountWorkbench("HARBOUR");
    await click(button("Archive year"));

    expect(dialog()?.textContent).toContain("Archive fiscal year 2020?");
    expect(dialog()?.querySelector("select")).toBeNull();
    expect(button("Archive year", dialog()!)?.disabled).toBe(true);
    await typeReason("FY 2020 is audited and finished");
    await click(button("Archive year", dialog()!));

    expect(mocks.archiveYear).toHaveBeenCalledWith({ id: 6, entity: "HARBOUR", reason: "FY 2020 is audited and finished" });
  });

  it("says when a year too recent may be archived, and does not offer it yet", async () => {
    mocks.yearRows = [CLOSED_2026];
    mocks.retention = { archive_min_age_years: 50 };
    await mountWorkbench("HARBOUR");

    expect(button("Archive year")?.disabled).toBe(true);
    expect(container.textContent).toMatch(/FY 2026 can be archived from .*2076/);
  });

  it("is not offered to a branch's own bursar, nor without the key", async () => {
    mocks.yearRows = [CLOSED_2026];
    mocks.wholeSchool = false;
    await mountWorkbench("HARBOUR");
    expect(button("Archive year")).toBeUndefined();

    mocks.wholeSchool = true;
    mocks.denied = new Set([P.FIN_ARCHIVE_FISCAL_YEAR]);
    await mountWorkbench("HARBOUR");
    expect(button("Archive year")).toBeUndefined();

  });

  it("is not offered on one branch's view, because the year it archives is the school's", async () => {
    mocks.yearRows = [CLOSED_2026];
    atBrightStar();
    await mountWorkbench("BRIGHTSTAR", "?branch=2");

    expect(button("Archive year")).toBeUndefined();
  });

  it("unarchives an archived year with a reason, and holds its re-open until then", async () => {
    mocks.yearRows = [{ ...CLOSED_2026, is_archived: true }];
    await mountWorkbench("HARBOUR");

    expect(container.textContent).toContain("Fiscal year 2026 is archived");
    expect(button("Re-open year")?.disabled).toBe(true);
    await click(button("Unarchive year"));
    await typeReason("The tax office is reviewing FY 2026");
    await click(button("Unarchive year", dialog()!));

    expect(mocks.unarchiveYear).toHaveBeenCalledWith({ id: 7, entity: "HARBOUR", reason: "The tax office is reviewing FY 2026" });
  });

  it("reads archived years and their months once Show archived years is ticked", async () => {
    mocks.yearRows = [{ ...CLOSED_2026, is_archived: true }];
    await mountWorkbench("HARBOUR", "?archived=1");

    expect(yearReads()).toEqual([]);
    expect(lastArgs(mocks.years)).toEqual({ entity: "HARBOUR", include_archived: "true" });
    expect(lastArgs(mocks.periods)).toEqual({ entity: "HARBOUR", year: 2026, include_archived: "true" });
    expect(container.textContent).toContain("FY 2026 · Closed · Archived");
  });
});

describe("each branch's state under All branches", () => {
  beforeEach(atBrightStar);

  const STATES = [
    { branch: 1, branch_name: "Ikeja", status: "CLOSED", closed_at: "2026-10-05T09:00:00Z" },
    { branch: 2, branch_name: "Lekki", status: "OPEN", closed_at: null },
  ];

  it("lists each branch's year beside the school's, from the one year list", async () => {
    mocks.yearRows = [{ ...FY, status: "OPEN", branch_states: STATES }];
    await mountWorkbench("BRIGHTSTAR");

    expect(yearReads()).toEqual([{ entity: "BRIGHTSTAR", include_branches: "true" }]);
    expect(lastArgs(mocks.periods)).toEqual({ entity: "BRIGHTSTAR", year: 2026, include_branches: "true" });
    expect(container.textContent).toContain("Each branch's year:");
    expect(container.textContent).toContain("Ikeja");
  });

  it("lists each branch's own state for a month in the drawer, with no request per branch", async () => {
    mocks.periodRows = [{ ...H1, status: "OPEN" }];
    checklistWith([], "OPEN");
    await act(async () => {
      root.render(
        <MemoryRouter>
          <PeriodCloseDrawer
            id={H1.id}
            entity="BRIGHTSTAR"
            finalPeriodOfOpenYear={false}
            calendar={calendarBranchFor(mocks.lens, null)}
            branchStates={STATES}
            onClose={() => undefined}
          />
        </MemoryRouter>,
      );
    });

    expect(mocks.periods).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Each branch");
    expect(document.body.textContent).toContain("Lekki");
  });

  it("is not shown with one branch chosen, and not asked for", async () => {
    mocks.yearRows = [{ ...FY, status: "OPEN", branch_states: STATES }];
    await mountWorkbench("BRIGHTSTAR", "?branch=2");

    expect(yearReads().at(-1)).toEqual({ entity: "BRIGHTSTAR", branch: 2 });
    expect(container.textContent).not.toContain("Each branch's year:");
  });
});
