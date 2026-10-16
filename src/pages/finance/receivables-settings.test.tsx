/**
 * The receivables settings, for Mrs Bello (the whole school) and Mrs Adeyemi
 * (Lekki only), both holding the settings update key.
 *
 * Every one of these settings binds every branch, so Mrs Adeyemi reads them and
 * cannot save; Mrs Bello can. The provision bands default to 25% over 180 days,
 * 50% over 365 and 100% over 730.
 *
 * Field Access: each policy value is a `finance.settings` field with its own
 * Read and Write switch. A value the role may not read is absent and so is its
 * panel, with the Save row moving to the last panel still shown; a value it may
 * read and not change is greyed and left out of the saved body. The credit and
 * concession values are document settings under the same resource and follow
 * their switches the same way.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  wholeSchool: true,
  access: {} as Record<string, unknown>,
  hiddenKeys: [] as string[],
  readOnlyKeys: [] as string[],
  update: vi.fn(),
  updateDocs: vi.fn(),
}));
const holds = (code: PermissionCode) => mocks.held.has(FINANCE_PERMISSION_REGISTRY[code]);

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: holds,
    hasAnyPermission: (...codes: PermissionCode[]) => codes.some(holds),
    hasAllPermissions: (...codes: PermissionCode[]) => codes.every(holds),
    hasModuleAccess: () => true,
    fieldAccess: mocks.access,
  }),
}));
vi.mock("../../host", async () => (await import("../../host-fake")).fakeHost({
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));
vi.mock("@/redux/services/finance/setup-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGetFinanceDocumentSettingsQuery: () => {
    const settings: Record<string, unknown> = { auto_apply_customer_credit: true, concession_second_person_threshold: 10_000_00, updated_at: "x" };
    for (const key of mocks.hiddenKeys) delete settings[key];
    if (mocks.readOnlyKeys.length) settings._read_only_fields = mocks.readOnlyKeys;
    return { isLoading: false, data: { data: { settings, consumers: {}, history: [] } } };
  },
  useUpdateFinanceDocumentSettingsMutation: () => [mocks.updateDocs, { isLoading: false }],
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetReceivablesSettingsQuery: () => {
    const settings: Record<string, unknown> = {
      revenue_recognition: "SPREAD_MONTHLY", revenue_recognition_label: "",
      revenue_recognition_options: [{ value: "SPREAD_MONTHLY", label: "Spread evenly over each month of the service period" }, { value: "AT_PERIOD_START", label: "All in the month the service period starts" }],
      provision_bands: [{ over_days: 180, rate_bps: 2500 }, { over_days: 365, rate_bps: 5000 }, { over_days: 730, rate_bps: 10000 }],
      deposits_offset_unpaid_bills: false, unclaimed_deposit_years: 6,
      payer_payment_split: "OLDEST_FIRST", payer_payment_split_options: [{ value: "OLDEST_FIRST", label: "Oldest first" }],
      payer_payment_surplus: "MOST_RECENT_BILL", payer_payment_surplus_options: [{ value: "MOST_RECENT_BILL", label: "Most recent" }],
      updated_at: "y", updated_by: null,
    };
    for (const key of mocks.hiddenKeys) delete settings[key];
    if (mocks.readOnlyKeys.length) settings._read_only_fields = mocks.readOnlyKeys;
    return { isLoading: false, data: { data: { consumers: {}, history: [], settings } } };
  },
  useUpdateReceivablesSettingsMutation: () => [mocks.update, { isLoading: false }],
}));

import { ReceivablesSettings } from "./receivables-settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {};
  mocks.hiddenKeys = [];
  mocks.readOnlyKeys = [];
  mocks.update.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Saved." }) });
  mocks.updateDocs.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Saved." }) });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (wholeSchool: boolean) => {
  mocks.wholeSchool = wholeSchool;
  mocks.held = new Set(["finance.settings.view", "finance.settings.update"]);
  act(() => root.render(<ReceivablesSettings entityCode="BSS" />));
  return container.textContent ?? "";
};
const input = (label: string) => container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);

describe("receivables settings", () => {
  it("shows the default provision bands and lets the whole-school bursar edit them", () => {
    const text = render(true);
    expect(text).not.toContain("only someone who covers the whole school");
    expect(input("Band 1 days")?.value).toBe("180");
    expect(input("Band 1 rate")?.value).toBe("25");
    expect(input("Band 3 rate")?.value).toBe("100");
    expect(input("Band 1 rate")?.disabled).toBe(false);
  });

  it("draws everything read-only for a bursar of one branch at a school with several", () => {
    const text = render(false);
    expect(text).toContain("only someone who covers the whole school can change them");
    expect(input("Band 1 rate")?.disabled).toBe(true);
    const saves = [...container.querySelectorAll("button")].filter((b) => b.textContent?.includes("Save"));
    expect(saves.length).toBeGreaterThan(0);
    expect(saves.every((b) => b.disabled)).toBe(true);
  });
});

describe("the release method hint", () => {
  it("names each method by the label the choice above it shows", () => {
    const text = render(true);
    expect(text).toContain("Spread evenly over each month of the service period: an equal share is released each month");
    expect(text).toContain("All in the month the service period starts: the whole fee is released in the term's first month");
    expect(text).not.toContain("Spread monthly");
  });
});

const RESOURCE = "finance.settings";
const RECOGNITION = ["revenue_recognition", "revenue_recognition_label", "revenue_recognition_options"];
const SPLIT = ["payer_payment_split", "payer_payment_split_options"];
const SURPLUS = ["payer_payment_surplus", "payer_payment_surplus_options"];

/** Restricts the role and serves the policy as the server would, hidden values absent. */
const restrict = (restrictions: { hidden?: string[]; read_only?: string[] }) => {
  mocks.access = { [RESOURCE]: restrictions };
  mocks.hiddenKeys = restrictions.hidden ?? [];
  mocks.readOnlyKeys = restrictions.read_only ?? [];
};
const panelTitles = () => Array.from(container.querySelectorAll("h2, h3, h4, p"))
  .map((el) => el.textContent?.trim() ?? "")
  .filter((t) => ["Fees billed ahead", "Doubtful debts", "Deposits", "Payments from a payer"].includes(t));
const saveButtons = () => [...container.querySelectorAll("button")].filter((b) => b.textContent?.includes("Save receivables policy"));
const typeInto = (el: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const save = async () => { await act(async () => { saveButtons()[0].click(); }); };

describe("receivables settings under Field Access", () => {
  it("shows the four panels, with the Save row in the last, when nothing is restricted", () => {
    render(true);
    expect(panelTitles()).toEqual(["Fees billed ahead", "Doubtful debts", "Deposits", "Payments from a payer"]);
    expect(saveButtons()).toHaveLength(1);
    expect(container.querySelector('[data-field="payer_payment_split"]')?.textContent).toContain("Split the payment");
  });

  it("removes a panel whose value is hidden, under every name the value travels under", () => {
    restrict({ hidden: RECOGNITION });
    render(true);
    expect(panelTitles()).toEqual(["Doubtful debts", "Deposits", "Payments from a payer"]);
    expect(container.textContent).not.toContain("Release method");
    expect(container.textContent).not.toContain("Spread evenly");
  });

  it("moves the Save row to the last panel still shown", () => {
    restrict({ hidden: [...SPLIT, ...SURPLUS] });
    render(true);
    expect(panelTitles()).toEqual(["Fees billed ahead", "Doubtful debts", "Deposits"]);
    expect(saveButtons()).toHaveLength(1);
    expect(container.textContent).not.toContain("Split the payment");
    restrict({ hidden: [...SPLIT, ...SURPLUS, "deposits_offset_unpaid_bills", "unclaimed_deposit_years", "provision_bands"] });
    act(() => root.unmount());
    root = createRoot(container);
    render(true);
    expect(panelTitles()).toEqual(["Fees billed ahead"]);
    expect(saveButtons()).toHaveLength(1);
  });

  it("keeps a panel with one of its two values hidden, showing the other", () => {
    restrict({ hidden: ["unclaimed_deposit_years"] });
    render(true);
    expect(panelTitles()).toContain("Deposits");
    expect(container.textContent).toContain("Set a leaver's deposit against their unpaid bills");
    expect(container.textContent).not.toContain("Forfeit unclaimed deposits after");
  });

  it("offers no Save when nothing in the policy may be read", () => {
    restrict({ hidden: [...RECOGNITION, "provision_bands", "deposits_offset_unpaid_bills", "unclaimed_deposit_years", ...SPLIT, ...SURPLUS, "updated_at", "updated_by"] });
    render(true);
    expect(panelTitles()).toEqual([]);
    expect(saveButtons()).toHaveLength(0);
  });

  it("greys a read-only value and sends only what may be written", async () => {
    restrict({ read_only: ["provision_bands"] });
    render(true);
    expect(container.querySelector('[data-field="provision_bands"]')?.getAttribute("data-read-only")).toBe("true");
    expect(input("Band 1 days")?.disabled).toBe(true);
    expect([...container.querySelectorAll("button")].some((b) => b.textContent?.includes("Add band"))).toBe(false);
    const years = container.querySelector<HTMLInputElement>('input[type=number][max="50"]')!;
    await act(async () => { typeInto(years, "3"); });
    await save();
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", unclaimed_deposit_years: 3 });
  });

  it("leaves a read-only value out of the body even when the role changed the form around it", async () => {
    restrict({ read_only: ["unclaimed_deposit_years", "payer_payment_split"] });
    render(true);
    expect(container.querySelector('[data-field="unclaimed_deposit_years"]')?.getAttribute("data-read-only")).toBe("true");
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Split the payment"]')?.disabled).toBe(true);
    await act(async () => { container.querySelector<HTMLElement>('[aria-label="Set a leaver\'s deposit against their unpaid bills"]')?.click(); });
    await save();
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", deposits_offset_unpaid_bills: true });
  });

  it("sends every changed value when all may be written", async () => {
    render(true);
    await act(async () => { typeInto(container.querySelector<HTMLInputElement>('input[type=number][max="50"]')!, "3"); });
    await save();
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", unclaimed_deposit_years: 3 });
  });

  it("does not demand valid bands from a role that cannot see or change them", async () => {
    restrict({ hidden: ["provision_bands"] });
    render(true);
    await act(async () => { typeInto(container.querySelector<HTMLInputElement>('input[type=number][max="50"]')!, "4"); });
    await save();
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", unclaimed_deposit_years: 4 });
  });

  it("shows a refusal beside the value it names", async () => {
    mocks.update.mockReturnValue({ unwrap: async () => { throw { status: 403, data: { error: { code: "field_write_denied", detail: { unclaimed_deposit_years: ["You do not have permission to change this field."] } } } }; } });
    render(true);
    await act(async () => { typeInto(container.querySelector<HTMLInputElement>('input[type=number][max="50"]')!, "3"); });
    await save();
    expect(container.querySelector('[data-field="unclaimed_deposit_years"] [role=alert]')?.textContent).toContain("do not have permission");
    expect(container.querySelector('[data-field="provision_bands"] [role=alert]')).toBeNull();
  });
});

describe("credit and concessions under Field Access", () => {
  const creditSwitch = () => container.querySelector<HTMLButtonElement>('[aria-label="Apply customer credit to new bills automatically"]');
  const saveCredit = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Save credit and concessions")) as HTMLButtonElement;

  it("sends only the value that changed", async () => {
    render(true);
    act(() => creditSwitch()!.click());
    await act(async () => { saveCredit().click(); });
    expect(mocks.updateDocs).toHaveBeenCalledWith({ entity: "BSS", auto_apply_customer_credit: false });
  });

  it("keeps the panel with one value hidden, and drops it when both are", () => {
    restrict({ hidden: ["concession_second_person_threshold"] });
    render(true);
    expect(container.querySelector('[data-field="concession_second_person_threshold"]')).toBeNull();
    expect(creditSwitch()).not.toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    restrict({ hidden: ["auto_apply_customer_credit", "concession_second_person_threshold"] });
    render(true);
    expect(container.textContent).not.toContain("Credit and concessions");
  });

  it("greys a read-only value and never sends it", async () => {
    restrict({ read_only: ["auto_apply_customer_credit"] });
    render(true);
    expect(creditSwitch()?.disabled).toBe(true);
    expect(container.querySelector('[data-field="auto_apply_customer_credit"]')?.getAttribute("data-read-only")).toBe("true");
    expect(saveCredit().disabled).toBe(true);
  });

  it("shows a refusal under the value it names", async () => {
    mocks.updateDocs.mockReturnValue({ unwrap: async () => { throw { status: 403, data: { error: { code: "field_write_denied", detail: { auto_apply_customer_credit: ["You may not change how credit is applied."] } } } }; } });
    render(true);
    act(() => creditSwitch()!.click());
    await act(async () => { saveCredit().click(); });
    expect(container.querySelector('[data-field="auto_apply_customer_credit"] [role=alert]')?.textContent).toBe("You may not change how credit is applied.");
  });
});
