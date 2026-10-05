/**
 * Dimensions are shared by every branch, so only a reader who covers the
 * whole school may add or change one. Bright Star's proprietor, holding the
 * create key, is offered New dimension and opens one by clicking its row.
 * Lekki's bursar holds the same key but reaches Lekki alone, so she reads the
 * list and is offered neither; nor is anyone without the key.
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
  useGetDimensionsQuery: () => ({
    data: { data: [{ id: 1, code: "FUND", name: "Fund", allowed_values: ["GENERAL"], is_active: true }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useUpsertDimensionMutation: () => [vi.fn(), { isLoading: false }],
}));

import { P } from "../../../permissions";
import { DimensionsTab } from "./dimensions-tab";

const KEY = P.FIN_CREATE_DIMENSION;
const NEW_LABEL = "New dimension";

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

describe("Dimensions", () => {
  it("let a whole-school holder of the create key add a dimension and open one to edit", () => {
    act(() => root.render(<DimensionsTab entity="BSS" />));
    expect(newButton()).toBeDefined();
    clickRow();
    expect(document.body.textContent).toContain("Edit FUND");
  });

  it("offer a branch's own bursar neither a new dimension nor an edit, though she holds the key", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<DimensionsTab entity="BSS" />));
    expect(container.textContent).toContain("FUND");
    expect(newButton()).toBeUndefined();
    clickRow();
    expect(document.body.textContent).not.toContain("Edit FUND");
  });

  it("offer no edit to a reader without the key", () => {
    mocks.held = new Set();
    act(() => root.render(<DimensionsTab entity="BSS" />));
    clickRow();
    expect(document.body.textContent).not.toContain("Edit FUND");
  });
});
