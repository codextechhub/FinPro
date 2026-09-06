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

  /**
   * Stands a rendered strip up as a scroller with real numbers, since jsdom
   * gives every element a width of zero: a 100px window onto 260px of tabs,
   * where the second tab starts past the right edge.
   */
  function fakeScroller() {
    const list = container.querySelector<HTMLElement>('[role="tablist"]')!;
    const [first, second] = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    const fix = (el: HTMLElement, props: Record<string, number>) => {
      for (const [k, value] of Object.entries(props)) {
        Object.defineProperty(el, k, { value, configurable: true });
      }
    };
    fix(list, { clientWidth: 100 });
    fix(first, { offsetLeft: 0, offsetWidth: 60 });
    fix(second, { offsetLeft: 60, offsetWidth: 200 });
    const calls: number[] = [];
    list.scrollTo = ((opts: ScrollToOptions) => { calls.push(Number(opts.left)); }) as HTMLElement["scrollTo"];
    return { list, first, second, calls };
  }

  it("scrolls an active tab that sits past the end of the strip into view", async () => {
    await act(async () => root.render(<InlineItemsStrip />));
    const { second, calls } = fakeScroller();

    await act(async () => second.click());

    // Its right edge is at 260 and the window is 100 wide, so the strip has to
    // stand at 160 for the tab to end flush with the right edge.
    expect(calls).toEqual([160]);
  });

  it("leaves the strip alone when the active tab is already in view", async () => {
    await act(async () => root.render(<InlineItemsStrip />));
    const { first, second, calls } = fakeScroller();

    await act(async () => second.click());
    calls.length = 0;
    await act(async () => first.click());

    expect(calls).toEqual([]);
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
