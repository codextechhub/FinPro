/**
 * The banking and cash defaults, for Mrs Bello, a bursar who may change them.
 *
 * Field Access: each value is a `finance.settings` field with its own Read and
 * Write switch. A value the role may not read is absent and so is its control;
 * one it may read and not change is greyed and left out of the saved body, so a
 * save that changes the receipt order never resends a petty-cash threshold the
 * role may only read. "Apply bank transfers to open bills automatically" is on
 * by default.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  update: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
    fieldAccess: mocks.access,
  }),
}));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useUpdateFinanceBankingSettingsMutation: () => [mocks.update, { isLoading: false }],
}));

import type { FinanceBankingSettingsValues } from "@/redux/services/finance/setup-types";
import { BankingCashForm } from "./banking-cash-settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESOURCE = "finance.settings";
const STRATEGY = ["default_receipt_allocation_strategy", "default_receipt_allocation_strategy_label", "default_receipt_allocation_strategy_options"];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.access = {};
  mocks.update.mockReset().mockReturnValue({ unwrap: async () => ({ message: "Saved." }) });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

/** Serves the settings as the server would for these restrictions: hidden values absent. */
const render = (restrictions: { hidden?: string[]; read_only?: string[] } = {}, canUpdate = true) => {
  mocks.access = restrictions.hidden || restrictions.read_only ? { [RESOURCE]: restrictions } : {};
  const values: Record<string, unknown> = {
    default_bank_reconciliation_tolerance_days: 3,
    default_group_reconciliation_matches: false,
    default_receipt_allocation_strategy: "oldest",
    default_receipt_allocation_strategy_label: "Oldest due first",
    default_receipt_allocation_strategy_options: [{ value: "oldest", label: "Oldest due first" }, { value: "largest", label: "Largest balance first" }],
    apply_transfers_automatically: true,
    petty_cash_low_balance_threshold_bps: 2000,
    updated_at: "x", updated_by: null,
  };
  for (const key of restrictions.hidden ?? []) delete values[key];
  if (restrictions.read_only?.length) values._read_only_fields = restrictions.read_only;
  act(() => root.render(
    <BankingCashForm entityCode="BSS" values={values as unknown as FinanceBankingSettingsValues} consumers={{}} canUpdate={canUpdate} readOnlyNote={canUpdate ? null : "Read only."} />,
  ));
};
const control = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const TRANSFERS = "Apply bank transfers to open bills automatically";
const saveButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Save banking policy"));
const save = async () => { await act(async () => { saveButton()!.click(); }); };
const choose = (label: string, value: string) => {
  const select = control(label) as HTMLSelectElement;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("banking and cash defaults", () => {
  it("shows the transfers switch on by default, with what it does", () => {
    render();
    expect(container.textContent).toContain(TRANSFERS);
    expect(container.textContent).toContain("any excess waits as credit");
    expect(control(TRANSFERS)?.getAttribute("aria-checked")).toBe("true");
  });

  it("sends only the switch when only the switch changed", async () => {
    render();
    await act(async () => { control(TRANSFERS)!.click(); });
    await save();
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", apply_transfers_automatically: false });
  });

  it("offers nothing to save until something changed", () => {
    render();
    expect(saveButton()?.disabled).toBe(true);
  });

  it("removes a value the role may not read, under every name it travels under", () => {
    render({ hidden: ["apply_transfers_automatically"] });
    expect(container.textContent).not.toContain(TRANSFERS);
    render({ hidden: STRATEGY });
    expect(control("Default receipt allocation")).toBeNull();
    expect(container.textContent).not.toContain("Oldest due first");
  });

  it("greys a read-only value and leaves it out of the body when something else changes", async () => {
    render({ read_only: ["petty_cash_low_balance_threshold_bps", "apply_transfers_automatically"] });
    expect(container.querySelector('[data-field="petty_cash_low_balance_threshold_bps"]')?.getAttribute("data-read-only")).toBe("true");
    expect((control("Petty cash low-balance threshold (%)") as HTMLInputElement).disabled).toBe(true);
    expect((control(TRANSFERS) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { choose("Default receipt allocation", "largest"); });
    await save();
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", default_receipt_allocation_strategy: "largest" });
  });

  it("shows nothing at all when no value may be read", () => {
    render({ hidden: ["default_bank_reconciliation_tolerance_days", "default_group_reconciliation_matches", ...STRATEGY, "apply_transfers_automatically", "petty_cash_low_balance_threshold_bps"] });
    expect(container.textContent).toBe("");
  });

  it("shows a refusal under the field it names", async () => {
    mocks.update.mockReturnValue({
      unwrap: async () => {
        throw { status: 403, data: { error: { code: "field_write_denied", detail: { apply_transfers_automatically: ["You may not change this setting."] } } } };
      },
    });
    render();
    await act(async () => { control(TRANSFERS)!.click(); });
    await save();
    expect(container.querySelector('[data-field="apply_transfers_automatically"] [role="alert"]')?.textContent).toBe("You may not change this setting.");
  });

  it("lets a reader without the update key see the values and change none", () => {
    render({}, false);
    expect((control(TRANSFERS) as HTMLButtonElement).disabled).toBe(true);
    expect(saveButton()).toBeUndefined();
  });
});
