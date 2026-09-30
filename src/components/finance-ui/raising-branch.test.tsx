/**
 * When a create form asks which branch a transaction is for.
 *
 * Corona Schools runs Ikeja and Lekki. Mr Bello reads the whole school, so
 * the server refuses his refund unless it names a branch: his form asks, and
 * starts on Lekki when Lekki is the branch he is working in. Mrs Adeyemi is
 * posted to Ikeja alone; the server files her refund under Ikeja, so her form
 * does not ask. Harbour Primary runs one branch, and nobody there is ever
 * asked. Where the host keeps its own branch lens, that lens is the one read.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props}>{children}</select>,
}));
vi.mock("@/redux/store", () => ({ useAppSelector: () => ({}) }));
vi.mock("../../host", () => ({
  hostBranchLens: undefined,
  useBranches: () => ({ data: [], isLoading: false, isError: false }),
}));

import {
  type ReaderBranchLens, RaisingBranchField, fallbackBranchLens, raisedBranchBody, raisingBranchFor, raisingBranchReady,
  useReaderBranchLens, customerBranchHint,
} from "./raising-branch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IKEJA = { id: 10, name: "Ikeja Branch" };
const LEKKI = { id: 20, name: "Lekki Branch" };
const MAIN = { id: 30, name: "Main Branch" };

const lens = (over: Partial<ReaderBranchLens>): ReaderBranchLens => ({
  applies: true, pinnedBranch: null, branch: "all", choices: [IKEJA, LEKKI], isLoading: false, ...over,
});

describe("raisingBranchFor", () => {
  it("asks a whole-school reader at a school with several branches, offering every branch", () => {
    const r = raisingBranchFor(lens({}));

    expect(r.ask).toBe(true);
    expect(r.choices).toEqual([IKEJA, LEKKI]);
    expect(r.initial).toBe("");
  });

  it("starts on the branch the reader is working in", () => {
    expect(raisingBranchFor(lens({ branch: 20 })).initial).toBe("20");
  });

  it("ignores a working branch the reader may not raise for", () => {
    expect(raisingBranchFor(lens({ branch: 99 })).initial).toBe("");
  });

  it("does not ask a reader pinned to one branch", () => {
    const r = raisingBranchFor(lens({ pinnedBranch: 10, branch: 10, choices: [IKEJA] }));

    expect(r.ask).toBe(false);
    expect(raisedBranchBody(r, "")).toEqual({});
    expect(raisingBranchReady(r, "")).toBe(true);
  });

  it("never asks at a school with one branch", () => {
    const r = raisingBranchFor(lens({ applies: false, choices: [MAIN] }));

    expect(r.ask).toBe(false);
    expect(raisedBranchBody(r, "30")).toEqual({});
  });

  it("asks a reader covering two of three branches, offering those two", () => {
    const r = raisingBranchFor(lens({ choices: [IKEJA, LEKKI] }));

    expect(r.ask).toBe(true);
    expect(r.choices.map((b) => b.name)).toEqual(["Ikeja Branch", "Lekki Branch"]);
  });

  it("sends the chosen branch, and holds the form until one is chosen", () => {
    const r = raisingBranchFor(lens({}));

    expect(raisingBranchReady(r, "")).toBe(false);
    expect(raisedBranchBody(r, "20")).toEqual({ branch: 20 });
    expect(raisedBranchBody(r, "20", "opening_branch")).toEqual({ opening_branch: 20 });
  });
});

describe("fallbackBranchLens", () => {
  const branches = [IKEJA, LEKKI];

  it("reads a whole-school reach as every branch, unpinned", () => {
    const l = fallbackBranchLens({ branches, reach: { whole_tenant: true, branch_ids: [] }, homeBranchId: 10, isLoading: false });

    expect(l).toMatchObject({ applies: true, pinnedBranch: null, branch: "all", choices: branches });
  });

  it("pins a reader whose reach is one branch", () => {
    const l = fallbackBranchLens({ branches, reach: { whole_tenant: false, branch_ids: [10] }, homeBranchId: null, isLoading: false });

    expect(l.pinnedBranch).toBe(10);
    expect(raisingBranchFor(l).ask).toBe(false);
  });

  it("falls back to the home posting when the session carries no reach", () => {
    const l = fallbackBranchLens({ branches, reach: undefined, homeBranchId: 20, isLoading: false });

    expect(l.pinnedBranch).toBe(20);
  });

  it("does not apply at a school with one branch, or in books with none", () => {
    expect(fallbackBranchLens({ branches: [MAIN], reach: null, homeBranchId: null, isLoading: false }).applies).toBe(false);
    expect(fallbackBranchLens({ branches: [], reach: null, homeBranchId: null, isLoading: false }).applies).toBe(false);
  });
});

describe("RaisingBranchField", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the branches it offers when the form asks", () => {
    act(() => root.render(<RaisingBranchField raising={raisingBranchFor(lens({}))} value="10" onChange={() => undefined} />));

    const options = Array.from(container.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["Select branch", "Ikeja Branch", "Lekki Branch"]);
  });

  it("renders nothing when the form does not ask", () => {
    act(() => root.render(<RaisingBranchField raising={raisingBranchFor(lens({ applies: false }))} value="" onChange={() => undefined} />));

    expect(container.innerHTML).toBe("");
  });
});

describe("useReaderBranchLens", () => {
  afterEach(() => {
    vi.doUnmock("../../host");
    vi.resetModules();
  });

  it("reads the host's own lens when the host supplies one", async () => {
    const hostLens = () => lens({ branch: 20 });
    vi.resetModules();
    vi.doMock("../../host", () => ({
      hostBranchLens: hostLens,
      useBranches: () => ({ data: [], isLoading: false, isError: false }),
    }));
    const mod = await import("./raising-branch");

    expect(mod.useReaderBranchLens()).toEqual(lens({ branch: 20 }));
  });

  it("derives a lens when the host supplies none", () => {
    expect(useReaderBranchLens).toBeTypeOf("function");
  });
});

describe("customerBranchHint", () => {
  it("says a shared customer's document names its branch, and says nothing when the customer's branch is unknown", () => {
    expect(customerBranchHint(null)).toContain("shared by every branch");
    expect(customerBranchHint(undefined)).toBeUndefined();
    expect(customerBranchHint(10)).toBeUndefined();
  });
});
