/**
 * Bright Star's September under All branches: Ikeja closed it on 5 October,
 * Lekki has not. The rows read each branch's state from the list the workbench
 * already holds, and say nothing where there is only one branch to show.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BranchMonthStates, BranchYearStates } from "./branch-close-states";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATES = [
  { branch: 1, branch_name: "Ikeja", status: "CLOSED", closed_at: "2026-10-05T09:00:00Z" },
  { branch: 2, branch_name: "Lekki", status: "OPEN", closed_at: null },
];

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

describe("each branch's close state", () => {
  it("lists every branch's month with its own state", () => {
    act(() => root.render(<BranchMonthStates states={STATES} />));
    const rows = Array.from(container.querySelectorAll("li")).map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Ikeja");
    expect(rows[1]).toContain("Lekki");
  });

  it("lists every branch's year as chips", () => {
    act(() => root.render(<BranchYearStates states={STATES} />));
    expect(container.textContent).toContain("Each branch's year:");
    expect(container.textContent).toContain("Lekki");
  });

  it("says nothing with one branch, or before the states arrive", () => {
    act(() => root.render(<><BranchMonthStates states={[STATES[0]]} /><BranchYearStates states={undefined} /></>));
    expect(container.textContent).toBe("");
  });
});
