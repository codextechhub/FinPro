/**
 * The receivables settings, for Mrs Bello (the whole school) and Mrs Adeyemi
 * (Lekki only), both holding the settings update key.
 *
 * Every one of these settings binds every branch, so Mrs Adeyemi reads them and
 * cannot save; Mrs Bello can. The provision bands default to 25% over 180 days,
 * 50% over 365 and 100% over 730.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  wholeSchool: true,
  mutation: () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }],
}));
const holds = (code: PermissionCode) => mocks.held.has(FINANCE_PERMISSION_REGISTRY[code]);

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: holds,
    hasAnyPermission: (...codes: PermissionCode[]) => codes.some(holds),
    hasAllPermissions: (...codes: PermissionCode[]) => codes.every(holds),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));
vi.mock("@/redux/services/finance/setup-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGetFinanceDocumentSettingsQuery: () => ({
    isLoading: false,
    data: { data: { settings: { auto_apply_customer_credit: true, concession_second_person_threshold: 10_000_00, updated_at: "x" }, consumers: {}, history: [] } },
  }),
  useUpdateFinanceDocumentSettingsMutation: mocks.mutation,
}));
vi.mock("@/redux/services/finance/fees-api", () => ({
  useGetReceivablesSettingsQuery: () => ({
    isLoading: false,
    data: { data: { consumers: {}, history: [], settings: {
      revenue_recognition: "SPREAD_MONTHLY", revenue_recognition_label: "",
      revenue_recognition_options: [{ value: "SPREAD_MONTHLY", label: "Spread evenly" }, { value: "AT_PERIOD_START", label: "At period start" }],
      provision_bands: [{ over_days: 180, rate_bps: 2500 }, { over_days: 365, rate_bps: 5000 }, { over_days: 730, rate_bps: 10000 }],
      deposits_offset_unpaid_bills: false, unclaimed_deposit_years: 6,
      payer_payment_split: "OLDEST_FIRST", payer_payment_split_options: [{ value: "OLDEST_FIRST", label: "Oldest first" }],
      payer_payment_surplus: "MOST_RECENT_BILL", payer_payment_surplus_options: [{ value: "MOST_RECENT_BILL", label: "Most recent" }],
      updated_at: "y", updated_by: null,
    } } },
  }),
  useUpdateReceivablesSettingsMutation: mocks.mutation,
}));

import { ReceivablesSettings } from "./receivables-settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
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
