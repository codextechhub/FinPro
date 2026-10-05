/**
 * Cost centres are shared by every branch, so only a reader who covers the
 * whole school may add or change one. Bright Star's proprietor, holding the
 * create key, is offered New cost centre and opens a centre by clicking its
 * row. Lekki's bursar holds the same key but reaches Lekki alone: the server
 * would refuse her save, so she reads every centre and is offered neither. A
 * bursar pinned to the only branch of a one-branch school covers the whole
 * school, and the reach the host reports for her says so.
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
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetCostCentersQuery: () => ({
    data: { data: [{ id: 1, code: "CC-LEK-ADM", name: "Lekki admin", parent_id: null, parent_code: null, is_active: true }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useCreateCostCenterMutation: () => [vi.fn(), { isLoading: false }],
}));

import { P } from "../../../permissions";
import { CostCentersTab } from "./cost-centers-tab";

const KEY = P.FIN_CREATE_COST_CENTER;
const NEW_LABEL = "New cost centre";

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
const clickRow = () => act(() => { (container.querySelector("tbody tr") as HTMLTableRowElement).click(); });

describe("Cost centres", () => {
  it("let a whole-school holder of the create key add a centre and open one to edit", () => {
    act(() => root.render(<CostCentersTab entity="BSS" />));
    expect(newButton()).toBeDefined();
    clickRow();
    expect(document.body.textContent).toContain("Edit CC-LEK-ADM");
  });

  it("offer a branch's own bursar neither a new centre nor an edit, though she holds the key", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<CostCentersTab entity="BSS" />));
    expect(container.textContent).toContain("CC-LEK-ADM");
    expect(newButton()).toBeUndefined();
    clickRow();
    expect(document.body.textContent).not.toContain("Edit CC-LEK-ADM");
  });

  it("offer nothing to a whole-school reader without the key", () => {
    mocks.held = new Set();
    act(() => root.render(<CostCentersTab entity="BSS" />));
    expect(newButton()).toBeUndefined();
  });
});
