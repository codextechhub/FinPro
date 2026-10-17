import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { ConsoleSidebar } from "./console-sidebar";

const hostState = vi.hoisted(() => ({ footerEnabled: true }));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasAnyPermission: () => true, hasModuleAccess: () => true }),
}));
vi.mock("@/routes/routes-path", () => ({ routesPath: { PROTECTED: { OVERVIEW: { INDEX: "/" } } } }));
vi.mock("./raising-branch", () => ({
  useReaderBranchLens: () => ({ applies: true, pinnedBranch: null, branch: "all", choices: [], isLoading: false }),
}));
vi.mock("./held-custody", () => ({ useCustodyReading: () => undefined }));
vi.mock("./use-entity", () => ({ useActiveEntity: () => ({ code: "BSS" }) }));
vi.mock("../../host", async () => {
  const [{ fakeHost }, React] = await Promise.all([
    import("../../host-fake"),
    import("react"),
  ]);
  const host = fakeHost();
  const Footer = ({ collapsed }: { collapsed: boolean }) => React.createElement(
    "button",
    { type: "button", "data-collapsed": String(collapsed) },
    "Lekki Branch",
  );
  Object.defineProperty(host, "HostConsoleSidebarFooter", {
    enumerable: true,
    get: () => hostState.footerEnabled ? Footer : undefined,
  });
  return host;
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ConsoleSidebar footer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hostState.footerEnabled = true;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function draw(open: boolean) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/finance/receivables"]}>
          <SidebarProvider defaultOpen={open}>
            <ConsoleSidebar title="Finance" nav={[{ items: [{ title: "Receivables", url: "/finance/receivables" }] }]} />
          </SidebarProvider>
        </MemoryRouter>,
      );
    });
  }

  it("pins the host's footer under the menu, so the branch switcher survives entering Finance", async () => {
    await draw(true);
    const footer = container.querySelector('[data-sidebar="footer"]');
    expect(footer?.textContent).toBe("Lekki Branch");
    expect(footer?.querySelector("button")?.dataset.collapsed).toBe("false");
  });

  it("tells the footer when the sidebar is collapsed to its icon rail", async () => {
    await draw(false);
    expect(container.querySelector('[data-sidebar="footer"] button')?.getAttribute("data-collapsed")).toBe("true");
  });

  it("ends with the menu when the host has no footer", async () => {
    hostState.footerEnabled = false;
    await draw(true);
    expect(container.querySelector('[data-sidebar="footer"]')).toBeNull();
    expect(container.textContent).toContain("Receivables");
  });
});
