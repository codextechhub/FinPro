/**
 * A batch of refunds is built from the customers who hold credit, which is a
 * customer's balance seen from the other side. Mr Eze's role may not read
 * customer balances, so the server lists nobody for him; the drawer does not
 * ask, and says why instead of offering an empty picker. A role that may read
 * balances is asked and offered the list.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fieldAccess: {} as Record<string, unknown>, skipped: [] as boolean[], defaultAccount: null as unknown,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: mocks.fieldAccess,
  }),
}));
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => v, today: () => "2026-10-06" }) }));
vi.mock("./use-adjustment-gate", () => ({ useAdjustmentGate: () => ({ rule: { mode: "never", threshold: null } }) }));
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostingDateField: ({ onChange }: { onChange: (v: string) => void }) => <button type="button" onClick={() => onChange("2026-10-01")}>Pick date</button>,
  BankAccountPicker: () => null,
  AccountPicker: ({ placeholder }: { placeholder?: string }) => <input aria-label="write-off account" placeholder={placeholder} readOnly />,
}));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetWriteOffRequestsQuery: (_args: unknown, options?: { skip?: boolean }) => ({
    data: options?.skip ? undefined : { data: [], default_write_off_account: mocks.defaultAccount },
  }),
  useCreateArAdjustmentBatchMutation: () => [vi.fn(), { isLoading: false }],
  useGetInvoicesQuery: () => ({ data: undefined, isFetching: false }),
  useGetRefundAvailabilityQuery: (_args: unknown, options?: { skip?: boolean }) => {
    mocks.skipped.push(options?.skip === true);
    return { data: options?.skip ? undefined : { data: [] }, isFetching: false };
  },
}));

import { BatchAdjustmentDrawer } from "./batch-adjustment-drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.fieldAccess = {};
  mocks.skipped = [];
  mocks.defaultAccount = { id: 9, code: "5350", name: "Bad debts" };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const open = async () => {
  act(() => root.render(<BatchAdjustmentDrawer open onClose={() => undefined} entity="BSS" currency="NGN" />));
  await act(async () => { [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Pick date")!.click(); });
};

describe("the batch refunds drawer", () => {
  it("removes a hidden bank account and disables a locked one", async () => {
    mocks.fieldAccess = { "finance.refund": { hidden: ["bank_account"] } };
    await open();
    expect(document.body.querySelector("[data-field=bank_account]")).toBeNull();

    mocks.fieldAccess = { "finance.refund": { read_only: ["bank_account"] } };
    await act(async () => root.render(<BatchAdjustmentDrawer open onClose={() => undefined} entity="BSS" currency="NGN" />));
    expect(document.body.querySelector("[data-field=bank_account]")?.hasAttribute("disabled")).toBe(true);
  });

  it("asks for the customers holding credit when the balance is readable", async () => {
    await open();
    expect(document.body.querySelector("[data-testid=refund-credit-hidden]")).toBeNull();
    expect(mocks.skipped.at(-1)).toBe(false);
  });

  it("does not ask, and says why, when the balance is hidden", async () => {
    mocks.fieldAccess = { "finance.customer": { hidden: ["balance"] } };
    await open();
    expect(document.body.querySelector("[data-testid=refund-credit-hidden]")?.textContent).toContain("cannot see customer balances");
    expect(mocks.skipped.every((skipped) => skipped)).toBe(true);
  });
});

describe("the batch write-offs drawer", () => {
  const openWriteOffs = async () => {
    await open();
    await act(async () => { [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Write-offs")!.click(); });
  };
  const hint = () => document.body.querySelector<HTMLInputElement>("input[aria-label='write-off account']")?.placeholder;

  it("names the account the write-offs list sends", async () => {
    await openWriteOffs();
    expect(hint()).toBe("Defaults to Bad debts (5350)");
    expect(document.body.textContent).not.toContain("5300");
  });

  it("words the hint without a code when the reader is not sent a default account", async () => {
    mocks.defaultAccount = null;
    await openWriteOffs();
    expect(hint()).toBe("Defaults to the school's bad debts account");
  });
});
