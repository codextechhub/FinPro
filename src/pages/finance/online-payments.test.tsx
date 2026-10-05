/**
 * The Online payments panel.
 *
 * Mrs Bello covers the whole school and may change who holds online payments;
 * Mrs Adeyemi, bursar for Lekki only, reads the same panel and changes nothing.
 * Moving to direct is refused in the panel while Lekki's collection account is
 * not set up with the provider, naming Lekki. A collection account's Settings
 * tab says whether it is set up and offers to create its subaccount.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  held: new Set<string>(),
  wholeSchool: true,
  update: vi.fn(),
  saveSubaccount: vi.fn(),
  lekkiReady: false,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));

const account = (id: number, name: string, ready: boolean) => ({ id, name, bank_name: "Zenith", subaccount_ready: ready, subaccount_provider: ready ? "PAYSTACK" : null });

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetCustodySettingsQuery: () => ({
    data: {
      data: {
        settings: {
          mode: "HELD", stored_mode: "HELD", effective_from: null, pending_mode: null, pending_from: null, pending_note: null,
          settlement_interval_days: 1, clearing_stale_days: 7, updated_at: null,
        },
        branches: [
          { branch: 1, branch_name: "Ikeja", collection_account: account(11, "Ikeja Zenith", true), held_balance: 0 },
          { branch: 2, branch_name: "Lekki", collection_account: account(12, "Lekki Zenith", mocks.lekkiReady), held_balance: 20_000_000 },
        ],
      },
    },
    isLoading: false, isError: false,
  }),
  useUpdateCustodySettingsMutation: () => [mocks.update, { isLoading: false }],
  useSaveCollectionSubaccountMutation: () => [mocks.saveSubaccount, { isLoading: false }],
}));

vi.mock("../../host", () => ({
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));

vi.mock("../../lib/display-prefs", () => ({
  useDates: () => ({ today: () => "2026-10-05", day: (v: string) => v, prefs: { timeZone: "Africa/Lagos" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CollectionSubaccountBlock, OnlinePaymentsPanel } from "./online-payments";
import type { BankAccount } from "@/redux/services/finance/ops-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.held = new Set(["800801", "800803"]);
  mocks.wholeSchool = true;
  mocks.lekkiReady = false;
  mocks.update.mockReset();
  mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Saved." }) });
  mocks.saveSubaccount.mockReset();
  mocks.saveSubaccount.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Collection subaccount saved." }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const radio = (value: string) => container.querySelector(`input[type="radio"][value="${value}"]`) as HTMLInputElement;
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

describe("Online payments panel", () => {
  it("is absent for a reader who may not read the payment settings", () => {
    mocks.held = new Set();
    act(() => root.render(<OnlinePaymentsPanel entityCode="BSS" />));
    expect(container.textContent).toBe("");
  });

  it("refuses direct while a branch is not set up, naming the branch", () => {
    act(() => root.render(<OnlinePaymentsPanel entityCode="BSS" />));
    act(() => radio("DIRECT").click());
    expect(container.textContent).toContain("Not yet: Lekki.");
    expect(button("Save online payments")?.disabled).toBe(true);
  });

  it("schedules direct for the next month start once every branch is set up", async () => {
    mocks.lekkiReady = true;
    act(() => root.render(<OnlinePaymentsPanel entityCode="BSS" />));
    act(() => radio("DIRECT").click());
    expect(container.textContent).toContain("from 2026-11-01");
    act(() => button("Save online payments")!.click());
    await act(async () => { [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Save")!.click(); });
    expect(mocks.update).toHaveBeenCalledWith({ entity: "BSS", mode: "DIRECT" });
  });

  it("lets a branch-bound bursar read it but change nothing", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<OnlinePaymentsPanel entityCode="BSS" />));
    expect(radio("DIRECT").disabled).toBe(true);
    expect(button("Save online payments")).toBeUndefined();
    expect(button("Create subaccount")).toBeUndefined();
    expect(container.textContent).toContain("Only someone who covers the whole school can change this.");
  });
});

describe("A collection account's subaccount", () => {
  const lekki = { id: 12, name: "Lekki Zenith", bank_name: "Zenith", is_primary_collection: true } as BankAccount;

  it("creates the subaccount with the bank's code", async () => {
    act(() => root.render(<CollectionSubaccountBlock entity="BSS" account={lekki} />));
    expect(container.textContent).toContain("Not set up with the payment provider");
    act(() => button("Create subaccount")!.click());
    const input = document.body.querySelector('input[aria-label="Bank code at the provider"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "057");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Create")!.click(); });
    expect(mocks.saveSubaccount).toHaveBeenCalledWith({ entity: "BSS", bank_account: 12, settlement_bank_code: "057" });
  });

  it("says nothing on an account that is not a collection account", () => {
    act(() => root.render(<CollectionSubaccountBlock entity="BSS" account={{ ...lekki, is_primary_collection: false }} />));
    expect(container.textContent).toBe("");
  });
});
