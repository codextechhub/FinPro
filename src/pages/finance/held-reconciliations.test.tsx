/**
 * The held-money checks are platform screens: a reader with no platform key
 * (every school user) is told so and shown nothing. A platform reader sees the
 * daily checks and the "balance swept" setting; turning the setting on or off
 * needs a reason, and a reader who may only view cannot change it. The sweeps
 * the check counted show to a holder of any one of the three keys the server
 * serves them on: the settlement view key or either provider key.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ held: new Set<string>(), update: vi.fn() }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));

const CHECK = (id: number, agrees: boolean) => ({
  id, checked_on: `2026-10-0${id}`, provider: "PAYSTACK", currency: "NGN",
  provider_balance: 500_000_000, books_balance: agrees ? 500_000_000 : 480_000_000,
  provider_account: 480_000_000, held_total: 450_000_000, own_in_transit: 20_000_000,
  balance_swept: false, swept_total: 0, own_swept_settled: 0,
  difference: agrees ? 0 : 20_000_000, tolerance: 0, agrees, error: null,
  incident_code: agrees ? null : "payments.held-ledger-mismatch",
});

vi.mock("@/redux/services/payments/payments-api", () => ({
  useGetPlatformHeldReconciliationsQuery: () => ({ data: { data: [CHECK(1, true), CHECK(2, false)] }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetPlatformProviderSettingsQuery: () => ({
    data: { data: { balance_swept: false, source: "default", updated_at: null, tolerance_kobo: 0, sweeps: { count: 0, total: 0, latest_settled_at: null } } },
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useGetPlatformProviderSweepsQuery: () => ({
    data: { data: [{ id: 1, provider: "PAYSTACK", settlement_id: "STL-77", amount: 25_000_000, currency: "NGN", settled_at: "2026-10-02T09:00:00Z", recorded_on: "2026-10-03" }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useUpdatePlatformProviderSettingsMutation: () => [mocks.update, { isLoading: false }],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { HeldReconciliationsTab } from "./held-reconciliations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.held = new Set();
  mocks.update.mockReset();
  mocks.update.mockReturnValue({ unwrap: () => Promise.resolve({ message: "Saved." }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Held reconciliations", () => {
  it("shows a reader without a platform key nothing but the refusal", () => {
    mocks.held = new Set(["800401"]);
    act(() => root.render(<HeldReconciliationsTab />));
    expect(container.textContent).toContain("No access");
    expect(container.textContent).not.toContain("Paystack balance swept automatically");
    expect(container.querySelector("table")).toBeNull();
  });

  it("lists each day's check and marks the disagreement", () => {
    mocks.held = new Set(["801001"]);
    act(() => root.render(<HeldReconciliationsTab />));
    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows.some((t) => t.includes("Agrees"))).toBe(true);
    expect(rows.some((t) => t.includes("Disagrees"))).toBe(true);
    expect(container.textContent).not.toContain("Paystack balance swept automatically");
  });

  it("lists the counted sweeps to a reader of the checks who holds no provider key", () => {
    mocks.held = new Set(["801001"]);
    act(() => root.render(<HeldReconciliationsTab />));
    expect(container.textContent).toContain("Sweeps counted");
    expect(container.textContent).toContain("STL-77");
    expect(container.querySelector('[aria-label="Paystack balance swept automatically"]')).toBeNull();
  });

  it("lets a provider viewer read the setting but not change it", () => {
    mocks.held = new Set(["801101"]);
    act(() => root.render(<HeldReconciliationsTab />));
    expect(container.textContent).toContain("Default (off)");
    expect((container.querySelector('[aria-label="Paystack balance swept automatically"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain("You have read-only access.");
    expect(container.textContent).toContain("Sweeps counted");
    expect(container.textContent).toContain("STL-77");
  });

  it("asks for a reason before turning sweeping on", async () => {
    mocks.held = new Set(["801101", "801103", "801001"]);
    act(() => root.render(<HeldReconciliationsTab />));
    act(() => (container.querySelector('[aria-label="Paystack balance swept automatically"]') as HTMLButtonElement).click());
    const confirm = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Turn on") as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    const reason = document.body.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(reason, "Paystack confirmed daily settlement is on.");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirm().disabled).toBe(false);
    await act(async () => { confirm().click(); });
    expect(mocks.update).toHaveBeenCalledWith({ balance_swept: true, reason: "Paystack confirmed daily settlement is on." });
  });
});
