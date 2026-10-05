/**
 * Exchange rates are shared by every branch, so only a reader who covers the
 * whole school may record one. Bright Star's proprietor, holding the create
 * key, is offered New FX rate; Lekki's bursar holds the same key but reaches
 * Lekki alone, so she reads the rates and is not.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ wholeSchool: true, held: new Set<string>() }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => mocks.held.has(code),
    hasAnyPermission: (...codes: string[]) => codes.some((c) => mocks.held.has(c)),
    hasAllPermissions: (...codes: string[]) => codes.every((c) => mocks.held.has(c)),
    hasModuleAccess: () => true,
    fieldAccess: {},
  }),
}));
vi.mock("@/hooks/use-action-param", () => ({ useActionParam: () => undefined }));
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../lib/display-prefs", () => ({ useDates: () => ({ day: (v: string) => v, today: () => "2026-10-05" }) }));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetCurrenciesQuery: () => ({
    data: { data: [{ code: "NGN", name: "Naira", symbol: "N", minor_unit: 2, is_active: true }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useGetFxRatesQuery: () => ({
    data: { data: [{ id: 1, base: "USD", quote: "NGN", rate: "1500.00", as_of: "2026-09-01", source: "CBN" }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useCreateFxRateMutation: () => [vi.fn(), { isLoading: false }],
}));

import { P } from "../../../permissions";
import { CurrenciesTab } from "./currencies-tab";

const KEY = P.FIN_CREATE_FX_RATE;
const NEW_LABEL = "New FX rate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.wholeSchool = true;
  mocks.held = new Set([KEY]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const newButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(NEW_LABEL));

describe("Exchange rates", () => {
  it("let a whole-school holder of the create key record a rate", () => {
    act(() => root.render(<CurrenciesTab />));
    expect(newButton()).toBeDefined();
  });

  it("offer a branch's own bursar no new rate, though she holds the key", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<CurrenciesTab />));
    expect(container.textContent).toContain("USD");
    expect(newButton()).toBeUndefined();
  });
});
