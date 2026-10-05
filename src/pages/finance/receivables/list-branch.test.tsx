/**
 * Bright Star runs Ikeja (1) and Lekki (2). Mrs Bello covers both and is
 * working in Lekki on the app's switcher; Mrs Adeyemi is posted to Lekki
 * alone; Harbour Primary has one branch.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListBranchSelect, listBranchArg, listBranchFor } from "./list-branch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BRANCHES = [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }];
const lens = (over: object = {}) => ({ applies: true, pinnedBranch: null, branch: "all" as number | "all", choices: BRANCHES, isLoading: false, ...over });

describe("which branch a list shows", () => {
  it("asks nothing at a school with one branch", () => {
    const view = listBranchFor(lens({ applies: false, choices: [BRANCHES[0]] }), "2", true);
    expect(view.canChoose).toBe(false);
    expect(listBranchArg(view)).toEqual({});
  });

  it("asks nothing of a reader posted to one branch; the server narrows her rows", () => {
    const view = listBranchFor(lens({ pinnedBranch: 2, choices: [BRANCHES[1]] }), null, false);
    expect(view).toMatchObject({ canChoose: false, selected: 2, showBranch: false });
    expect(listBranchArg(view)).toEqual({});
  });

  it("follows the branch picked in the page address, else the switcher, else all", () => {
    expect(listBranchArg(listBranchFor(lens(), "1", true))).toEqual({ branch: 1 });
    expect(listBranchArg(listBranchFor(lens({ branch: 2 }), null, true))).toEqual({ branch: 2 });
    expect(listBranchArg(listBranchFor(lens({ branch: 2 }), "all", true))).toEqual({});
    expect(listBranchFor(lens(), null, true)).toMatchObject({ selected: "all", showBranch: true });
  });

  it("ignores a branch outside the reader's choices", () => {
    expect(listBranchArg(listBranchFor(lens(), "9", true))).toEqual({});
  });

  it("offers rows with no branch yet only to a whole-school reader", () => {
    expect(listBranchArg(listBranchFor(lens(), "unassigned", true))).toEqual({ branch: "unassigned" });
    expect(listBranchArg(listBranchFor(lens({ choices: BRANCHES }), "unassigned", false))).toEqual({});
  });
});

describe("the branch picker", () => {
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

  it("lists all branches, each branch, and no branch yet for a whole-school reader", () => {
    const onChange = vi.fn();
    act(() => root.render(<ListBranchSelect view={listBranchFor(lens(), null, true)} onChange={onChange} />));
    const options = Array.from(container.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["All branches", "Ikeja", "Lekki", "No branch yet"]);
  });

  it("is absent where there is nothing to choose", () => {
    act(() => root.render(<ListBranchSelect view={listBranchFor(lens({ applies: false }), null, true)} onChange={vi.fn()} />));
    expect(container.innerHTML).toBe("");
  });
});
