/**
 * Finance Settings > Fiscal calendar: the next-year rule and record keeping.
 *
 * Bright Star opens its next fiscal year automatically, 60 days ahead, by
 * default. Mrs Bello, who covers the whole school, changes the lead to 90 days;
 * 5 and 200 are outside the 7 to 180 the server accepts and are not sent.
 * Records are kept for CodeX's floor of six years: she lengthens Bright Star's
 * to eight, four is refused because it is shorter than the floor, and a blank
 * goes back to the floor. Mrs Adeyemi, the bursar for Lekki only, holds the
 * update key and reads both panels without a Save, because they bind every
 * branch.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calendar: null as unknown,
  records: null as unknown,
  updateCalendar: vi.fn(),
  updateRecords: vi.fn(),
  wholeSchool: true,
  denied: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/redux/services/finance/records-api", () => ({
  useGetFinanceCalendarSettingsQuery: () => ({ data: { data: mocks.calendar }, isLoading: false }),
  useGetRecordRetentionSettingsQuery: () => ({ data: { data: mocks.records }, isLoading: false }),
  useUpdateFinanceCalendarSettingsMutation: () => [mocks.updateCalendar, { isLoading: false }],
  useUpdateRecordRetentionSettingsMutation: () => [mocks.updateRecords, { isLoading: false }],
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import { P } from "../../permissions";
import { CalendarRulePanel, RecordKeepingPanel, validLeadDays, validRetentionYears } from "./settings-records";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.calendar = {
    settings: { next_year_mode: "AUTO_OPEN", next_year_mode_label: "Open the next fiscal year automatically", next_year_lead_days: 60, updated_at: null, updated_by: null },
    consumers: {},
    history: [],
  };
  mocks.records = { statutory_years: 6, retention_years: null, effective_retention_years: 6, archive_min_age_years: 2, history: [] };
  mocks.updateCalendar.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Finance calendar settings saved." }) });
  mocks.updateRecords.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Record retention settings saved." }) });
  mocks.wholeSchool = true;
  mocks.denied = new Set();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.trim() === label);

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

async function type(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const numberInputs = () => Array.from(container.querySelectorAll<HTMLInputElement>("input[type='number']"));

describe("the rules the forms check before sending", () => {
  it("accepts 7 to 180 days ahead", () => {
    expect(validLeadDays("7")).toBe(true);
    expect(validLeadDays("180")).toBe(true);
    expect(validLeadDays("5")).toBe(false);
    expect(validLeadDays("200")).toBe(false);
    expect(validLeadDays("60.5")).toBe(false);
    expect(validLeadDays("")).toBe(false);
  });

  it("accepts a retention period no shorter than the floor, or blank for the floor", () => {
    expect(validRetentionYears("", 6)).toBe(true);
    expect(validRetentionYears("8", 6)).toBe(true);
    expect(validRetentionYears("6", 6)).toBe(true);
    expect(validRetentionYears("4", 6)).toBe(false);
  });
});

describe("opening the next year", () => {
  it("starts on open automatically, 60 days ahead", async () => {
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);

    const auto = container.querySelector<HTMLInputElement>("input[value='AUTO_OPEN']");
    expect(auto?.checked).toBe(true);
    expect(container.textContent).toContain("Open the next year automatically");
    expect(container.textContent).toContain("Warn only");
    expect(numberInputs()[0].value).toBe("60");
  });

  it("saves 90 days and sends only what changed", async () => {
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    expect(button("Save calendar rule")?.disabled).toBe(true);
    await type(numberInputs()[0], "90");
    await act(async () => button("Save calendar rule")!.click());

    expect(mocks.updateCalendar).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", next_year_lead_days: 90 });
  });

  it("does not send 5 or 200 days, and says the range", async () => {
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    await type(numberInputs()[0], "5");
    expect(button("Save calendar rule")?.disabled).toBe(true);
    expect(container.textContent).toContain("Use a whole number from 7 to 180 days.");

    await type(numberInputs()[0], "200");
    expect(button("Save calendar rule")?.disabled).toBe(true);
  });

  it("switches to warn only", async () => {
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    await act(async () => container.querySelector<HTMLInputElement>("input[value='WARN_ONLY']")!.click());
    await act(async () => button("Save calendar rule")!.click());

    expect(mocks.updateCalendar).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", next_year_mode: "WARN_ONLY" });
  });

  it("is read-only for a branch-only bursar who holds the key", async () => {
    mocks.wholeSchool = false;
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);

    expect(button("Save calendar rule")).toBeUndefined();
    expect(numberInputs()[0].disabled).toBe(true);
    expect(container.textContent).toContain("Only a school-wide administrator can change these settings");
  });
});

describe("record keeping", () => {
  it("shows the floor as read-only, the period in force and the archive age", async () => {
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);

    expect(container.textContent).toContain("Statutory floor");
    expect(container.textContent).toContain("6 years");
    expect(container.textContent).toContain("Read-only");
    expect(container.textContent).toContain("Period in force");
    const [years, age] = numberInputs();
    expect(years.value).toBe("");
    expect(years.min).toBe("6");
    expect(age.value).toBe("2");
  });

  it("saves eight years", async () => {
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    await type(numberInputs()[0], "8");
    await act(async () => button("Save record keeping")!.click());

    expect(mocks.updateRecords).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", retention_years: 8 });
  });

  it("refuses four years, shorter than the floor", async () => {
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    await type(numberInputs()[0], "4");

    expect(button("Save record keeping")?.disabled).toBe(true);
    expect(container.textContent).toContain("Keep records for at least 6 years");
  });

  it("goes back to the floor when the school's own period is cleared", async () => {
    mocks.records = { statutory_years: 6, retention_years: 8, effective_retention_years: 8, archive_min_age_years: 2, history: [] };
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    await type(numberInputs()[0], "");
    await act(async () => button("Save record keeping")!.click());

    expect(mocks.updateRecords).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", retention_years: null });
  });

  it("is read-only for a branch-only bursar, and protected without the view key", async () => {
    mocks.wholeSchool = false;
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    expect(button("Save record keeping")).toBeUndefined();
    expect(numberInputs().every((input) => input.disabled)).toBe(true);

    mocks.denied = new Set([P.FIN_VIEW_SETTINGS]);
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    expect(container.textContent).toContain("Finance settings are protected");
  });
});
