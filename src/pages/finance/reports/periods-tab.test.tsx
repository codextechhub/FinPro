/**
 * Re-opening a month from the close workbench.
 *
 * The backend refuses a re-open without a reason, and refuses any month of a
 * closed or locked fiscal year outright. The drawer answers both before the
 * request is sent: its confirm stays disabled until a reason is typed, the
 * reason travels with the request, and a month of a shut year is not offered
 * a Re-open that would only be refused.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reopen: vi.fn(),
  checklist: vi.fn(),
}));

vi.mock("@/redux/services/finance/setup-api", () => ({
  useCloseFiscalYearMutation: () => [vi.fn(), { isLoading: false }],
  useClosePeriodMutation: () => [vi.fn(), { isLoading: false }],
  useGetFiscalYearPeriodsQuery: () => ({ data: undefined }),
  useGetPeriodChecklistQuery: (...args: unknown[]) => mocks.checklist(...args),
  useLockPeriodMutation: () => [vi.fn(), { isLoading: false }],
  useReopenPeriodMutation: () => [mocks.reopen, { isLoading: false }],
  useStartFiscalYearMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PeriodCloseDrawer } from "./periods-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MARCH = {
  id: 41,
  name: "March 2026",
  period_no: 3,
  start_date: "2026-03-01",
  end_date: "2026-03-31",
  status: "CLOSED",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.reopen.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Re-opened." }) });
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

async function mount(yearShut: { year: number; status: string } | null = null) {
  await act(async () => {
    root.render(
      <PeriodCloseDrawer id={MARCH.id} entity="BRIGHTSTAR" finalPeriodOfOpenYear={false} yearShut={yearShut} onClose={() => undefined} />,
    );
  });
}

const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);

async function typeReason(text: string) {
  const field = document.body.querySelector("textarea");
  expect(field).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(field, text);
    field!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("re-opening a month", () => {
  it("keeps the confirm disabled until a reason is typed", async () => {
    await mount();
    await act(async () => button("Re-open")!.click());

    expect(button("Re-open period")?.disabled).toBe(true);

    await typeReason("   ");
    expect(button("Re-open period")?.disabled).toBe(true);

    await typeReason("A supplier bill dated in March arrived late");
    expect(button("Re-open period")?.disabled).toBe(false);
  });

  it("sends the typed reason with the re-open", async () => {
    await mount();
    await act(async () => button("Re-open")!.click());
    await typeReason("  A supplier bill dated in March arrived late  ");
    await act(async () => button("Re-open period")!.click());

    expect(mocks.reopen).toHaveBeenCalledWith({
      id: 41,
      entity: "BRIGHTSTAR",
      reason: "A supplier bill dated in March arrived late",
    });
  });

  it("does not offer a re-open in a closed fiscal year", async () => {
    await mount({ year: 2026, status: "CLOSED" });

    expect(button("Re-open")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Reopen the fiscal year before re-opening one of its months.");
  });
});
