/**
 * Who may change the reminder policies at Bright Star (Ikeja and Lekki).
 *
 * A policy binds every branch, so the server takes a change from a
 * whole-school reader only. Mrs Bello covers both branches and holding the keys
 * is offered New policy, Edit, the active switch and Configure cadence. Mrs
 * Adeyemi is Lekki's own bursar: holding the same keys she reads the policies,
 * is told why she cannot change them, and is offered nothing the server would
 * refuse. A reader without the keys is offered nothing and told nothing.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  denied: new Set<string>(),
  wholeSchool: true,
}));

const { idle } = vi.hoisted(() => ({ idle: () => [vi.fn(), { isLoading: false }] }));
vi.mock("@/redux/services/finance/ar-api", () => ({
  useGetDunningSummaryQuery: () => ({ data: undefined }),
  useGetDunningPoliciesQuery: () => ({
    data: { data: [{ id: 1, name: "Standard 7/14/30-day", is_active: true, is_default: true, stages: [] }] },
  }),
  useGetDunningNoticesQuery: () => ({ data: { data: [] }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useGenerateDunningMutation: idle,
  useCancelDunningNoticeMutation: idle,
  useSendDunningNoticeMutation: idle,
  useCreateDunningPolicyMutation: idle,
  useUpdateDunningPolicyMutation: idle,
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: (code: string) => !mocks.denied.has(code),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasModuleAccess: () => true,
  }),
}));

vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));

import { P } from "../../../permissions";
import { DunningTab } from "./dunning-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.denied = new Set();
  mocks.wholeSchool = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text));
const toggle = () => container.querySelector<HTMLButtonElement>("button[aria-pressed]");

function openPolicies() {
  act(() => root.render(<DunningTab entity="BSS" currency="NGN" />));
  act(() => button("Policies")!.click());
}

describe("the reminder policies", () => {
  it("can be changed by a whole-school holder of the keys", () => {
    openPolicies();
    expect(button("New policy")).toBeTruthy();
    expect(button("Edit")).toBeTruthy();
    expect(toggle()?.disabled).toBe(false);
    expect(button("Configure cadence")).toBeTruthy();
    expect(container.querySelector("[data-testid=dunning-read-only]")).toBeNull();
  });

  it("are read-only for a branch's own bursar holding the keys, who is told why", () => {
    mocks.wholeSchool = false;
    openPolicies();
    expect(button("New policy")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
    expect(toggle()?.disabled).toBe(true);
    expect(button("Configure cadence")).toBeUndefined();
    expect(container.querySelector("[data-testid=dunning-read-only]")?.textContent).toContain("apply to every branch");
  });

  it("offer nothing, and say nothing, to a reader without the keys", () => {
    mocks.denied = new Set([P.FIN_CREATE_DUNNING, P.FIN_UPDATE_DUNNING]);
    openPolicies();
    expect(button("New policy")).toBeUndefined();
    expect(button("Edit")).toBeUndefined();
    expect(container.querySelector("[data-testid=dunning-read-only]")).toBeNull();
  });
});
