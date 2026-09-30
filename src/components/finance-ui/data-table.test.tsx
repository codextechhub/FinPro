import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DataTable, toggledPageSelection, toggledRowSelection, type Column } from "./data-table";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; name: string };

const columns: Column<Row>[] = [
  { header: "Name", cell: (row) => row.name },
];

describe("DataTable phone states", () => {
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

  it("renders an empty card-mode state and hides the desktop table below md", () => {
    act(() => {
      root.render(
        <DataTable
          columns={columns}
          rows={[]}
          rowKey={(row) => row.id}
          emptyTitle="No payment plans"
          emptyMessage="Create a plan to continue."
        />,
      );
    });

    const phoneState = Array.from(container.querySelectorAll("div.md\\:hidden"))
      .find((element) => element.textContent?.includes("No payment plans"));
    const tableContainer = container.querySelector('[data-slot="table-container"]');

    expect(phoneState).toBeTruthy();
    expect(tableContainer?.classList.contains("max-md:hidden")).toBe(true);
  });
});

describe("DataTable row selection", () => {
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

  it("selects the page in view and keeps rows chosen on other pages", () => {
    expect([...toggledPageSelection(new Set(["x"]), ["a", "b"])].sort()).toEqual(["a", "b", "x"]);
    expect([...toggledPageSelection(new Set(["a"]), ["a", "b"])].sort()).toEqual(["a", "b"]);
  });

  it("clears the page in view when all of it is already selected", () => {
    expect([...toggledPageSelection(new Set(["a", "b", "x"]), ["a", "b"])]).toEqual(["x"]);
  });

  it("toggles one row", () => {
    expect([...toggledRowSelection(new Set(), "a")]).toEqual(["a"]);
    expect([...toggledRowSelection(new Set(["a"]), "a")]).toEqual([]);
  });

  it("ticks a row without opening it", () => {
    const opened: string[] = [];
    let selected = new Set<string>();
    act(() => {
      root.render(
        <DataTable
          columns={columns}
          rows={[{ id: "r1", name: "Leave request" }]}
          rowKey={(row) => row.id}
          onRowClick={(row) => opened.push(row.id)}
          selection={{ selected, onChange: (next) => { selected = next; }, rowLabel: (row) => `Select ${row.name}` }}
        />,
      );
    });

    const box = container.querySelector<HTMLButtonElement>('table [aria-label="Select Leave request"]');
    act(() => box?.click());

    expect([...selected]).toEqual(["r1"]);
    expect(opened).toEqual([]);
  });
});
