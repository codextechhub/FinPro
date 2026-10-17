/**
 * Mrs Bello, bursar for Ikeja and Lekki at Bright Star, narrows a document list
 * in the console, which keeps no branch switcher of its own: she picks the
 * branch and the year on the page, and the list's scope carries both. Finance
 * and Procurement read the same picks and spell "no branch yet" in their own
 * engine's word. Where her role may not read the list's document date, she is
 * offered no Year picker and no period is asked for, even one left in a link.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];
const mocks = vi.hoisted(() => ({ scopes: [] as Record<string, unknown>[], changed: 0 }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true, hasAnyPermission: () => true, hasAllPermissions: () => true,
    hasModuleAccess: () => true, fieldAccess: {},
  }),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: {} }),
  useAppDispatch: () => () => undefined,
}));
vi.mock("../../host", async () => {
  const branches = { data: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], isLoading: false, isError: false };
  return (await import("../../host-fake")).fakeHost({ useBranches: () => branches });
});
vi.mock("@/redux/services/finance/ops-api", () => ({
  useGetFiscalYearsQuery: () => ({ data: { data: [
    { id: 1, year: 2015, start_date: "2014-09-01", end_date: "2015-08-31", is_archived: false },
    { id: 2, year: 2016, start_date: "2015-09-01", end_date: "2016-08-31", is_archived: false },
  ] } }),
}));

import { listBranchArg, procurementBranchArg, type ListBranchView } from "./list-branch";
import { listScopeArg, useListScope, type ListScopeOptions } from "./list-scope";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the scope a list asks with", () => {
  it("asks for nothing under All branches and All years", () => {
    expect(listScopeArg(undefined, { kind: "all" })).toEqual({});
  });

  it("carries the branch and the year picked together", () => {
    expect(listScopeArg(2, { kind: "year", year: 2015 })).toEqual({ branch: 2, fiscal_year: 2015 });
  });

  it("carries a custom range and each engine's word for no branch yet", () => {
    expect(listScopeArg("unassigned", { kind: "range", from: "2015-03-01", to: "" })).toEqual({ branch: "unassigned", date_from: "2015-03-01" });
    expect(listScopeArg("none", { kind: "all" })).toEqual({ branch: "none" });
  });

  it("holds no key it does not mean, so an export's params stay scalars", () => {
    expect(Object.keys(listScopeArg(undefined, { kind: "year", year: 2015 }))).toEqual(["fiscal_year"]);
  });
});

function Harness({ branchArg, options }: { branchArg: (view: ListBranchView) => { branch?: number | string }; options?: ListScopeOptions }) {
  const { scope, filters } = useListScope("BSS", () => { mocks.changed += 1; }, branchArg, options);
  mocks.scopes.push(scope);
  return <div>{filters}</div>;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.scopes = [];
  mocks.changed = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const select = (label: string) => container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
const pick = (el: HTMLSelectElement, value: string) => act(() => {
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
const mount = (
  branchArg: (view: ListBranchView) => { branch?: number | string },
  options?: ListScopeOptions,
  path = "/finance/receivables/invoices",
) => act(() => root.render(
  <MemoryRouter initialEntries={[path]}><Harness branchArg={branchArg} options={options} /></MemoryRouter>,
));

describe("a list's filter bar in an app with no branch switcher", () => {
  it("offers both pickers, and the scope follows each pick", () => {
    mount(listBranchArg);
    expect([...select("Branch")!.options].map((o) => o.textContent)).toEqual(["All branches", ...BRANCHES.map((b) => b.name), "No branch yet"]);
    expect(mocks.scopes.at(-1)).toEqual({});

    pick(select("Branch")!, "2");
    pick(select("Year")!, "2015");
    expect(mocks.scopes.at(-1)).toEqual({ branch: 2, fiscal_year: 2015 });
    expect(mocks.changed).toBe(2);
  });

  it("asks Finance for unassigned rows and Procurement for none", () => {
    mount(listBranchArg);
    pick(select("Branch")!, "unassigned");
    expect(mocks.scopes.at(-1)).toEqual({ branch: "unassigned" });

    act(() => root.unmount());
    root = createRoot(container);
    mount(procurementBranchArg);
    pick(select("Branch")!, "unassigned");
    expect(mocks.scopes.at(-1)).toEqual({ branch: "none" });
  });
});

describe("a list whose document date the reader may not read", () => {
  it("offers no Year picker and asks for no period, even one in the address", () => {
    mount(listBranchArg, { periodReadable: false }, "/finance/receivables/provisions?year=2015");
    expect(select("Year")).toBeNull();
    expect(container.querySelector('[aria-label="From"]')).toBeNull();
    expect(mocks.scopes.at(-1)).toEqual({});

    act(() => root.unmount());
    root = createRoot(container);
    mount(listBranchArg, { periodReadable: false }, "/finance/receivables/provisions?year=custom&from=2015-03-01");
    expect(mocks.scopes.at(-1)).toEqual({});
  });

  it("still narrows by branch", () => {
    mount(listBranchArg, { periodReadable: false });
    pick(select("Branch")!, "1");
    expect(mocks.scopes.at(-1)).toEqual({ branch: 1 });
  });

  it("offers the Year picker where the date is readable", () => {
    mount(listBranchArg, { periodReadable: true }, "/finance/receivables/provisions?year=2015");
    expect(select("Year")!.value).toBe("2015");
    expect(mocks.scopes.at(-1)).toEqual({ fiscal_year: 2015 });
  });
});
