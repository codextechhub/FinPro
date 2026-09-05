import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TabStrip, type TabStripItem } from "./tab-strip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * What these cover is selection and settling, not the slide.
 *
 * jsdom has no layout, so every measurement reads zero and the highlight never
 * moves; anything about where the highlight lands has to be seen on a real
 * screen instead. What is worth pinning here is that a caller handing over a
 * fresh `items` array on every render still settles: measuring stores state on
 * the strip rather than on its caller, so the array keeps its identity and the
 * measuring effect does not feed itself.
 */
describe("TabStrip", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  /** Rebuilds its items every render, the way a screen with live counts does. */
  function InlineItemsStrip() {
    const [value, setValue] = useState("all");
    const items: TabStripItem<string>[] = [
      { value: "all", label: "All" },
      { value: "draft", label: "Draft" },
    ];
    return <TabStrip items={items} value={value} onChange={setValue} ariaLabel="Status" />;
  }

  it("settles when its caller passes a new items array on every render", async () => {
    await act(async () => root.render(<InlineItemsStrip />));

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("moves the selection to the tab that was clicked", async () => {
    await act(async () => root.render(<InlineItemsStrip />));

    const draft = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    await act(async () => draft.click());

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("marks a disabled option and refuses to select it", async () => {
    const items: TabStripItem<string>[] = [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed", disabled: true },
    ];
    let selected = "open";
    await act(async () => root.render(
      <TabStrip items={items} value={selected} onChange={(v) => { selected = v; }} ariaLabel="Status" />,
    ));

    const closed = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    expect(closed.disabled).toBe(true);
    await act(async () => closed.click());
    expect(selected).toBe("open");
  });

  it("presses rather than selects when it carries a value instead of a view", async () => {
    const items: TabStripItem<string>[] = [
      { value: "debit", label: "Debit" },
      { value: "credit", label: "Credit" },
    ];
    await act(async () => root.render(
      <TabStrip items={items} value="credit" onChange={() => {}} semantics="toggle" />,
    ));

    expect(container.querySelector('[role="tablist"]')).toBeNull();
    const buttons = container.querySelectorAll("button");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  });
});
