import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActionParam } from "./use-action-param";
import { useFilterParam } from "@/hooks/use-filter-param";

let container: HTMLDivElement;
let root: Root;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ onOpen, allowed = true }: { onOpen: () => void; allowed?: boolean }) {
  const location = useLocation();
  useActionParam("new", allowed, onOpen);
  return <output data-search={location.search}>{location.search}</output>;
}

// The Tasks shape: one screen reading a deep-link filter *and* a palette action
// in the same commit. Declaration order matters to the bug being guarded, so
// each order gets its own case.
function TabThenAction({ onOpen, onTab }: { onOpen: () => void; onTab: (v: string) => void }) {
  const location = useLocation();
  useFilterParam("tab", ["team", "mine"] as const, onTab);
  useActionParam("new", true, onOpen);
  return <output data-search={location.search}>{location.search}</output>;
}

function ActionThenTab({ onOpen, onTab }: { onOpen: () => void; onTab: (v: string) => void }) {
  const location = useLocation();
  useActionParam("new", true, onOpen);
  useFilterParam("tab", ["team", "mine"] as const, onTab);
  return <output data-search={location.search}>{location.search}</output>;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("useActionParam create-drawer contract", () => {
  it("opens once and removes the action instruction from the URL", async () => {
    const onOpen = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/procurement/requisitions?action=new&from=palette"]}>
          <Probe onOpen={onOpen} />
        </MemoryRouter>,
      );
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(container.querySelector("output")?.getAttribute("data-search"))
      .toBe("?from=palette");
  });

  it("ignores a different action value", async () => {
    const onOpen = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/procurement/requisitions?action=receive"]}>
          <Probe onOpen={onOpen} />
        </MemoryRouter>,
      );
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(container.querySelector("output")?.getAttribute("data-search"))
      .toBe("?action=receive");
  });

  it("opens nothing for a caller who may not create", async () => {
    // The reason `allowed` is an argument at all. A bursar at Holy Cross with
    // no procurement.vendor.create sees no Add Vendor button, and used to get
    // the Add Vendor form anyway from
    // /procurement/vendors/vendors?action=new - the button was gated, the
    // drawer rendered off local state, and this hook set that state on sight
    // of the param.
    const onOpen = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/procurement/vendors/vendors?action=new"]}>
          <Probe onOpen={onOpen} allowed={false} />
        </MemoryRouter>,
      );
    });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("still consumes a refused instruction", async () => {
    // It was answered; the answer was no. Left on the URL it would re-fire on
    // the next render, and the address would go on promising something it will
    // never do.
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/procurement/vendors/vendors?action=new&from=palette"]}>
          <Probe onOpen={vi.fn()} allowed={false} />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector("output")?.getAttribute("data-search"))
      .toBe("?from=palette");
  });
});

describe("useActionParam alongside a deep-link filter", () => {
  it.each([
    ["filter declared first", TabThenAction],
    ["action declared first", ActionThenTab],
  ])("fires both and leaves neither param behind (%s)", async (_name, Component) => {
    const onOpen = vi.fn();
    const onTab = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/tasks?tab=team&action=new"]}>
          <Component onOpen={onOpen} onTab={onTab} />
        </MemoryRouter>,
      );
    });

    expect(onTab).toHaveBeenCalledWith("team");
    expect(onOpen).toHaveBeenCalledTimes(1);
    // Either hook writing from its stale snapshot would restore the other's key.
    expect(container.querySelector("output")?.getAttribute("data-search")).toBe("");
  });
});
