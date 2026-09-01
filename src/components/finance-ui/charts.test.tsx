import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TrendArea } from "./charts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("TrendArea responsive labels", () => {
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

  it("keeps month labels readable inside a horizontally scrollable chart", () => {
    act(() => {
      root.render(
        <TrendArea
          labels={["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]}
          series={[{ name: "Spend", data: [1, 2, 3, 4, 5, 6], color: "#2563eb" }]}
        />,
      );
    });

    const scroller = container.firstElementChild as HTMLDivElement;
    const chart = scroller.firstElementChild as HTMLDivElement;

    expect(scroller.classList.contains("overflow-x-auto")).toBe(true);
    expect(chart.style.minWidth).toBe("520px");
  });
});
