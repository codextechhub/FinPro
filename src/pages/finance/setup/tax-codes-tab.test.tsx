/**
 * Tax codes are shared by every branch, so only a reader who covers the whole
 * school may add or change one. Bright Star's proprietor, holding the create
 * key, is offered New tax code and opens a code by clicking its row. Lekki's
 * bursar holds the same key but reaches Lekki alone: the server would refuse
 * her save, so she reads every code and is offered neither.
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
vi.mock("@/components/finance-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AccountPicker: () => <div>account-picker</div>,
}));
vi.mock("@/redux/services/finance/setup-api", () => ({
  useGetTaxCodesQuery: () => ({
    data: { data: [{
      id: 1, code: "VAT-7.5", name: "VAT 7.5%", rate_bps: 750, treatment: "STANDARD", is_recoverable: false,
      collected_account: "2310", paid_account: null, is_active: true,
    }] },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  }),
  useUpsertTaxCodeMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { P } from "../../../permissions";
import { TaxCodesTab } from "./tax-codes-tab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.wholeSchool = true;
  mocks.held = new Set([P.FIN_CREATE_TAX_CODE]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const newButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("New tax code"));
const clickRow = () => act(() => { (container.querySelector("tbody tr") as HTMLTableRowElement).click(); });

describe("Tax codes", () => {
  it("lets a whole-school holder of the create key add a code and open one to edit", () => {
    act(() => root.render(<TaxCodesTab entity="BSS" />));
    expect(newButton()).toBeDefined();
    clickRow();
    expect(document.body.textContent).toContain("Edit VAT-7.5");
  });

  it("offers a branch's own bursar neither a new code nor an edit, though she holds the key", () => {
    mocks.wholeSchool = false;
    act(() => root.render(<TaxCodesTab entity="BSS" />));
    expect(container.textContent).toContain("VAT-7.5");
    expect(newButton()).toBeUndefined();
    clickRow();
    expect(document.body.textContent).not.toContain("Edit VAT-7.5");
  });
});
