import { describe, expect, it } from "vitest";

import {
  shouldExpandEntitySwitcher,
  shouldShowEntitySwitcher,
  shouldSuspendEntitySwitcher,
} from "./entity-select";

describe("entity switcher visibility", () => {
  it.each([
    { count: 0, visible: false },
    { count: 1, visible: false },
    { count: 2, visible: true },
    { count: 8, visible: true },
  ])("is $visible when there are $count active entities", ({ count, visible }) => {
    expect(shouldShowEntitySwitcher(count)).toBe(visible);
  });
});

describe("entity switcher expansion", () => {
  const resting = {
    open: false,
    hovered: false,
    focused: false,
    collapsedAfterSelection: false,
  };

  it("expands for hover, focus, and an open menu", () => {
    expect(shouldExpandEntitySwitcher({ ...resting, hovered: true })).toBe(true);
    expect(shouldExpandEntitySwitcher({ ...resting, focused: true })).toBe(true);
    expect(shouldExpandEntitySwitcher({ ...resting, open: true })).toBe(true);
  });

  it("collapses after selection even when Radix returns focus to the trigger", () => {
    expect(shouldExpandEntitySwitcher({
      ...resting,
      focused: true,
      collapsedAfterSelection: true,
    })).toBe(false);
  });
});

describe("entity switcher suspension", () => {
  const resting = {
    searchResultsOpen: false,
    mobileSearchOpen: false,
    activeToastCount: 0,
  };

  it("stays visible when no competing header overlay is active", () => {
    expect(shouldSuspendEntitySwitcher(resting)).toBe(false);
  });

  it("gets out of the way while a workspace toast is active", () => {
    expect(shouldSuspendEntitySwitcher({ ...resting, activeToastCount: 1 })).toBe(true);
  });

  it("also suspends for desktop and mobile search overlays", () => {
    expect(shouldSuspendEntitySwitcher({ ...resting, searchResultsOpen: true })).toBe(true);
    expect(shouldSuspendEntitySwitcher({ ...resting, mobileSearchOpen: true })).toBe(true);
  });
});
