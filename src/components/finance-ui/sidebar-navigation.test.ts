import { describe, expect, it } from "vitest";

import { revealActiveSidebarItem, revealExpandedNavGroup } from "./sidebar-navigation";

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    height: bottom - top,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

describe("revealActiveSidebarItem", () => {
  it("scrolls to the active submenu leaf rather than stopping at its parent", () => {
    const sidebar = document.createElement("div");
    const parent = document.createElement("button");
    const child = document.createElement("a");
    parent.dataset.active = "true";
    child.dataset.active = "true";
    sidebar.append(parent, child);

    Object.defineProperty(sidebar, "clientHeight", { value: 100 });
    sidebar.getBoundingClientRect = () => rect(0, 100);
    parent.getBoundingClientRect = () => rect(60, 80);
    child.getBoundingClientRect = () => rect(130, 150);

    revealActiveSidebarItem(sidebar, 40);

    expect(sidebar.scrollTop).toBe(98);
  });
});

describe("revealExpandedNavGroup", () => {
  /** A group row inside a scrollable sidebar-content container. */
  function setup(groupTop: number, groupBottom: number, startScroll = 0) {
    const container = document.createElement("div");
    container.dataset.slot = "sidebar-content";
    const group = document.createElement("li");
    container.append(group);
    document.body.append(container);

    container.scrollTop = startScroll;
    container.getBoundingClientRect = () => rect(0, 100);
    group.getBoundingClientRect = () => rect(groupTop, groupBottom);
    return { container, group };
  }

  it("scrolls a submenu that opened below the fold into view", () => {
    // The reported case: Support sits near the bottom, so its expanded submenu
    // runs past the container and the user sees nothing happen.
    const { container, group } = setup(60, 150);

    revealExpandedNavGroup(group);

    // 50px hidden + 8px breathing room.
    expect(container.scrollTop).toBe(58);
  });

  it("leaves a group that already fits exactly where it is", () => {
    // Rule 1: clicking a visible group must not jolt the menu.
    const { container, group } = setup(10, 90, 25);

    revealExpandedNavGroup(group);

    expect(container.scrollTop).toBe(25);
  });

  it("never scrolls the group header out of view", () => {
    // Rule 2: a submenu taller than the sidebar would otherwise scroll past its
    // own trigger, leaving children with nothing naming their section. The
    // header pins to the top of the container instead.
    const { container, group } = setup(60, 400);

    revealExpandedNavGroup(group);

    // Clamped to the header offset (60), not the 348 the overflow would ask for.
    expect(container.scrollTop).toBe(60);
  });

  it("does nothing when the row is not inside a scroll container", () => {
    const orphan = document.createElement("li");
    orphan.getBoundingClientRect = () => rect(60, 150);

    expect(() => revealExpandedNavGroup(orphan)).not.toThrow();
  });
});
