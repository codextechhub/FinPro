/**
 * Finance Settings > Fiscal calendar: the next-year rule and record keeping.
 *
 * Bright Star opens its next fiscal year automatically, 60 days ahead, by
 * default. Mrs Bello, who covers the whole school, changes the lead to 90 days;
 * 5 and 200 are outside the 7 to 180 the server accepts and are not sent.
 * Records are kept for CodeX's floor of six years: she lengthens Bright Star's
 * to eight, four is refused because it is shorter than the floor, and a blank
 * goes back to the floor. Bright Star's months close in order by default; Mrs
 * Bello turns that off and only the switch is sent. Mrs Adeyemi, the bursar
 * for Lekki only, holds the update key and reads every panel without a Save,
 * because they bind every branch.
 *
 * Every value but the floor is a `finance.settings` field with its own Read
 * and Write switch. A hidden value leaves its panel and a panel with nothing
 * left goes; a read-only one is greyed and never sent; a refusal shows under
 * the value it names.
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
  access: {} as Record<string, unknown>,
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
    fieldAccess: mocks.access,
  }),
}));

vi.mock("../../host", async () => (await import("../../host-fake")).fakeHost({
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
    settings: { next_year_mode: "AUTO_OPEN", next_year_mode_label: "Open the next fiscal year automatically", next_year_mode_options: [{ value: "AUTO_OPEN", label: "Open the next fiscal year automatically" }, { value: "WARN_ONLY", label: "Warn finance staff only" }], next_year_lead_days: 60, periods_close_in_order: true, updated_at: null, updated_by: null },
    consumers: {},
    history: [],
  };
  mocks.records = { statutory_years: 6, retention_years: null, effective_retention_years: 6, archive_min_age_years: 2, history: [] };
  mocks.updateCalendar.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Finance calendar settings saved." }) });
  mocks.updateRecords.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ message: "Record retention settings saved." }) });
  mocks.wholeSchool = true;
  mocks.denied = new Set();
  mocks.access = {};
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

describe("closing months in order", () => {
  const toggle = () => container.querySelector<HTMLButtonElement>("button[aria-label='Close months in order']");

  it("starts on, and saves only the switch when it is turned off", async () => {
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(button("Save close order")?.disabled).toBe(true);

    await act(async () => toggle()!.click());
    await act(async () => button("Save close order")!.click());

    expect(mocks.updateCalendar).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", periods_close_in_order: false });
  });

  it("is read without a Save by a bursar who covers one branch", async () => {
    mocks.wholeSchool = false;
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);

    expect(toggle()?.disabled).toBe(true);
    expect(button("Save close order")).toBeUndefined();
  });
});

describe("opening the next year", () => {
  it("starts on open automatically, 60 days ahead", async () => {
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);

    const auto = container.querySelector<HTMLInputElement>("input[value='AUTO_OPEN']");
    expect(auto?.checked).toBe(true);
    expect(container.textContent).toContain("Open the next fiscal year automatically");
    expect(container.textContent).toContain("Warn finance staff only");
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

  it("is read-only for a branch-only bursar, and absent without the view key", async () => {
    mocks.wholeSchool = false;
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    expect(button("Save record keeping")).toBeUndefined();
    expect(numberInputs().every((input) => input.disabled)).toBe(true);

    mocks.denied = new Set([P.FIN_VIEW_SETTINGS]);
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    expect(container.textContent).toBe("");
  });
});

const refusal = (detail: Record<string, string[]>) => ({ status: 403, data: { error: { code: "field_write_denied", detail } } });
const field = (name: string) => container.querySelector(`[data-field="${name}"]`);
type CalendarPayload = { settings: Record<string, unknown> };
const hideCalendar = (...names: string[]) => {
  mocks.access = { "finance.settings": { hidden: names } };
  const settings = (mocks.calendar as CalendarPayload).settings;
  for (const name of names) {
    for (const key of Object.keys(settings)) if (key === name || key.startsWith(`${name}_`)) delete settings[key];
  }
};

describe("the fiscal calendar under Field Access", () => {
  it("drops the next-year panel when both of its rules are hidden, and keeps the close order", async () => {
    hideCalendar("next_year_mode", "next_year_lead_days");
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    expect(container.textContent).not.toContain("Opening the next year");
    expect(field("periods_close_in_order")).not.toBeNull();
  });

  it("keeps the lead days when only the mode is hidden, and sends only the lead", async () => {
    hideCalendar("next_year_mode");
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    expect(field("next_year_mode")).toBeNull();
    await type(field("next_year_lead_days")!.querySelector("input"), "90");
    await act(async () => button("Save calendar rule")!.click());
    expect(mocks.updateCalendar).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", next_year_lead_days: 90 });
  });

  it("drops the close-order panel when its switch is hidden", async () => {
    hideCalendar("periods_close_in_order");
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    expect(container.textContent).not.toContain("Closing months");
    expect(container.textContent).toContain("Opening the next year");
  });

  it("greys a read-only rule and leaves it out of the save", async () => {
    (mocks.calendar as CalendarPayload).settings._read_only_fields = ["next_year_lead_days", "periods_close_in_order"];
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    expect(field("next_year_lead_days")?.getAttribute("data-read-only")).toBe("true");
    expect((field("next_year_lead_days")!.querySelector("input") as HTMLInputElement).disabled).toBe(true);
    expect(button("Save close order")).toBeUndefined();
    await act(async () => (container.querySelector("input[value='WARN_ONLY']") as HTMLInputElement).click());
    await act(async () => button("Save calendar rule")!.click());
    expect(mocks.updateCalendar).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", next_year_mode: "WARN_ONLY" });
  });

  it("shows a refusal under the rule it names", async () => {
    mocks.updateCalendar.mockReturnValue({ unwrap: () => Promise.reject(refusal({ next_year_lead_days: ["You may not change the days ahead."] })) });
    await render(<CalendarRulePanel entityCode="BRIGHTSTAR" />);
    await type(field("next_year_lead_days")!.querySelector("input"), "90");
    await act(async () => button("Save calendar rule")!.click());
    expect(field("next_year_lead_days")?.querySelector("[role=alert]")?.textContent).toBe("You may not change the days ahead.");
  });
});

describe("record keeping under Field Access", () => {
  it("hides the school's period and the period in force together, keeping the floor and the archive age", async () => {
    mocks.access = { "finance.settings": { hidden: ["retention_years"] } };
    mocks.records = { statutory_years: 6, archive_min_age_years: 2, history: [] };
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    expect(container.textContent).toContain("Statutory floor");
    expect(container.textContent).not.toContain("Period in force");
    expect(field("retention_years")).toBeNull();
    expect(field("archive_min_age_years")).not.toBeNull();
  });

  it("shows only the floor when both school values are hidden, with nothing to save", async () => {
    mocks.access = { "finance.settings": { hidden: ["retention_years", "archive_min_age_years"] } };
    mocks.records = { statutory_years: 6, history: [] };
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    expect(container.textContent).toContain("Statutory floor");
    expect(button("Save record keeping")).toBeUndefined();
    expect(numberInputs()).toHaveLength(0);
  });

  it("greys a read-only value and sends only the other", async () => {
    mocks.records = { ...(mocks.records as object), _read_only_fields: ["retention_years", "effective_retention_years"] };
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    expect((field("retention_years")!.querySelector("input") as HTMLInputElement).disabled).toBe(true);
    await type(field("archive_min_age_years")!.querySelector("input"), "3");
    await act(async () => button("Save record keeping")!.click());
    expect(mocks.updateRecords).toHaveBeenCalledWith({ entity: "BRIGHTSTAR", archive_min_age_years: 3 });
  });

  it("shows a refusal under the value it names", async () => {
    mocks.updateRecords.mockReturnValue({ unwrap: () => Promise.reject(refusal({ retention_years: ["You may not change how long records are kept."] })) });
    await render(<RecordKeepingPanel entityCode="BRIGHTSTAR" />);
    await type(field("retention_years")!.querySelector("input"), "8");
    await act(async () => button("Save record keeping")!.click());
    expect(field("retention_years")?.querySelector("[role=alert]")?.textContent).toBe("You may not change how long records are kept.");
  });
});

describe("what the fiscal calendar says on the page and behind each ⓘ", () => {
  const LEAD_IMPACT = "Sets how many days before the calendar ends the next year is opened or the warning starts.";
  const hint = (label: string) => container.querySelector<HTMLElement>(`[aria-label="About ${label}"]`);
  const page = () => document.body.textContent ?? "";

  beforeEach(() => {
    (mocks.calendar as { consumers: unknown }).consumers = {
      next_year_mode: { service: "Fiscal calendar rollover", impact: "Decides whether the next fiscal year is opened automatically or finance staff are only warned." },
      next_year_lead_days: { service: "Fiscal calendar rollover and runway warning", impact: LEAD_IMPACT },
    };
  });

  it("shows Days ahead with its box and chip, and neither of its explanations", async () => {
    await render(<CalendarRulePanel entityCode="BSS" />);
    expect(container.textContent).toContain("Days ahead");
    expect(container.textContent).toContain("Used by Fiscal calendar rollover and runway warning");
    expect(page()).not.toContain("How many days before the calendar ends");
    expect(page()).not.toContain(LEAD_IMPACT);
    expect(page()).not.toContain("What happens as the last fiscal year comes to its end");
  });

  it("opens Days ahead to its range, then what it changes, said once", async () => {
    await render(<CalendarRulePanel entityCode="BSS" />);
    await act(async () => hint("Days ahead")!.click());
    expect(page()).toContain("A whole number from 7 to 180.");
    expect(page().split(LEAD_IMPACT).length - 1).toBe(1);
  });

  it("keeps one line under each next-year choice, and the whole of each in the ⓘ above them", async () => {
    await render(<CalendarRulePanel entityCode="BSS" />);
    expect(container.textContent).toContain("Nothing opens by itself. Someone opens the next year by hand.");
    expect(page()).not.toContain("weekly and then daily in the last week");
    await act(async () => hint("When the year nears its end")!.click());
    expect(page()).toContain("Warn finance staff only: nothing opens by itself.");
    expect(page()).toContain("weekly and then daily in the last week");
  });

  it("drops the audit-history line from an editable form's footer", async () => {
    await render(<CalendarRulePanel entityCode="BSS" />);
    expect(page()).not.toContain("Only changed values are written to audit history.");
  });
});
