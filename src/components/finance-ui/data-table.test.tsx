import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DataTable, type Column } from "./data-table";

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
