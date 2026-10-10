import { describe, expect, it } from "vitest";
import {
  BUDGETS_SECTIONS,
  COLLECTIONS_SECTIONS,
  EXPENSES_SECTIONS,
  PAYMENTS_SECTIONS,
  RECEIVABLES_SECTIONS,
  REPORTS_SECTIONS,
  SETUP_SECTIONS,
} from "./console-sections";
import { FINANCE_HELP } from "./screen-help";

const REQUIRED_KEYS = [
  "dashboard", "ledger", "banking", "bank-reconciliation", "payroll", "audit", "settings",
  ...SETUP_SECTIONS,
  ...RECEIVABLES_SECTIONS,
  ...COLLECTIONS_SECTIONS,
  ...EXPENSES_SECTIONS,
  ...BUDGETS_SECTIONS,
  "inter-branch-transfers", "held-receipts", "inter-branch-balances", "recharges", "shared-cost-rules",
  ...PAYMENTS_SECTIONS,
  ...REPORTS_SECTIONS,
] as const;

describe("Finance page help", () => {
  it("covers every menu destination", () => {
    expect(new Set(Object.keys(FINANCE_HELP))).toEqual(new Set(REQUIRED_KEYS));
  });

  it("keeps every explanation to one short sentence", () => {
    for (const [screen, text] of Object.entries(FINANCE_HELP)) {
      expect(text.length, screen).toBeLessThanOrEqual(150);
      expect(text.match(/[.!?](?:\s|$)/g), screen).toHaveLength(1);
    }
  });
});
