import { describe, expect, it } from "vitest";
import { P } from "../../permissions";
import type { FinanceSettingsSection, SetupSection } from "./console-sections";
import { visibleFinanceSettingsSections, visibleSetupSections } from "./settings-access";

const MOUNTED: FinanceSettingsSection[] = [
  "overview", "fiscal-calendar", "accounting", "documents", "banking-cash",
  "reference-data", "approvals", "receivables", "payroll", "recent-changes",
];
const SETUP: SetupSection[] = ["accounts", "periods", "tax-codes", "cost-centers"];
const permissions = (...held: string[]) => (code: string) => held.includes(code);

describe("Finance Settings section access", () => {
  it("shows finance policy sections to a settings reader", () => {
    expect(visibleFinanceSettingsSections({
      mounted: MOUNTED,
      mountedSetup: SETUP,
      can: permissions(P.FIN_VIEW_SETTINGS),
    })).toEqual([
      "overview", "fiscal-calendar", "accounting", "documents", "banking-cash",
      "receivables", "payroll", "recent-changes",
    ]);
  });

  it("shows only Banking and cash to a payment-settings reader", () => {
    expect(visibleFinanceSettingsSections({
      mounted: MOUNTED,
      mountedSetup: SETUP,
      can: permissions(P.PAY_VIEW_PAYMENT_SETTINGS),
    })).toEqual(["overview", "banking-cash"]);
  });

  it("removes the console when none of its settings are accessible", () => {
    expect(visibleFinanceSettingsSections({ mounted: MOUNTED, mountedSetup: SETUP, can: permissions() })).toEqual([]);
  });

  it("shows only reference-data cards the reader may open", () => {
    const can = permissions(P.FIN_VIEW_ACCOUNTS, P.FIN_VIEW_TAX_CODES);
    expect(visibleSetupSections(SETUP, can)).toEqual(["accounts", "tax-codes"]);
    expect(visibleFinanceSettingsSections({ mounted: MOUNTED, mountedSetup: SETUP, can }))
      .toEqual(["overview", "reference-data"]);
  });

  it("keeps a mounted host-owned fee policy visible", () => {
    expect(visibleFinanceSettingsSections({ mounted: ["overview", "fees"], mountedSetup: [], can: permissions() }))
      .toEqual(["overview", "fees"]);
  });

  it("removes a host-owned section when its host permission is missing", () => {
    expect(visibleFinanceSettingsSections({
      mounted: ["overview", "fees"],
      mountedSetup: [],
      can: permissions(),
      hostAllows: (section) => section !== "fees",
    })).toEqual([]);
  });
});
