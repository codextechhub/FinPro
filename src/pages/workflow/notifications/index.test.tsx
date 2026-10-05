/**
 * Whether approvals notify anybody is one answer for the whole school, so the
 * server takes it only from a holder of the template update key who covers
 * every branch. Bright Star's proprietor flips the switch; Lekki's branch
 * administrator holds the same key, reads the switch disabled, and is told why.
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
vi.mock("../../../host", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReaderReach: () => ({ wholeSchool: mocks.wholeSchool, branchIds: mocks.wholeSchool ? null : [2], covers: () => mocks.wholeSchool }),
}));
vi.mock("@/components/layout/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/redux/services/dashboard/workflow-api", () => ({
  useGetWorkflowNotificationSettingQuery: () => ({ data: { enabled: true }, isLoading: false }),
  useSetWorkflowNotificationSettingMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "@/permissions";
import WorkflowNotifications from "./index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.wholeSchool = true;
  mocks.held = new Set([P.UPDATE_WORKFLOW_TEMPLATE]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const toggle = () => container.querySelector<HTMLButtonElement>("[aria-label='Tell people what is happening']");

describe("Approval notifications", () => {
  it("let a whole-school holder of the key switch them", () => {
    act(() => root.render(<WorkflowNotifications />));
    expect(toggle()?.disabled).toBe(false);
  });

  it("are read-only for a branch administrator who holds the key, with the reason", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<WorkflowNotifications />));
    expect(toggle()?.disabled).toBe(true);
    expect(container.textContent).toContain("Only a school-wide administrator can change this");
  });

  it("are read-only without the key", () => {
    mocks.held = new Set();
    act(() => root.render(<WorkflowNotifications />));
    expect(toggle()?.disabled).toBe(true);
    expect(container.textContent).toContain("same access as changing an approval path");
  });
});
