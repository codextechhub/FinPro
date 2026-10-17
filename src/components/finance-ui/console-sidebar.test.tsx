import { act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ hasAnyPermission: () => true, hasModuleAccess: () => true }),
}));
vi.mock("@/routes/routes-path", () => ({ routesPath: { PROTECTED: { OVERVIEW: { INDEX: "/" } } } }));
vi.mock("./raising-branch", () => ({
  useReaderBranchLens: () => ({ applies: true, pinnedBranch: null, branch: "all", choices: [], isLoading: false }),
}));
vi.mock("./held-custody", () => ({ useCustodyReading: () => undefined }));
vi.mock("./use-entity", () => ({ useActiveEntity: () => ({ code: "BSS" }) }));

/**
 * The host contract is read once, when the sidebar module loads, so each case
 * loads the sidebar afresh against its own host. The sidebar primitive is
 * loaded alongside it so both share one sidebar context.
 */
async function loadSidebar(footer: ComponentType<{ collapsed: boolean }> | undefined) {
  vi.resetModules();
  vi.doMock("../../host", async () => (await import("../../host-fake")).fakeHost({ HostConsoleSidebarFooter: footer }));
  const [{ ConsoleSidebar }, { SidebarProvider }] = await Promise.all([
    import("./console-sidebar"),
    import("@/components/ui/sidebar"),
  ]);
  return { ConsoleSidebar, SidebarProvider };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The host's footer, standing in for the school app's branch switcher. */
function BranchSwitcher({ collapsed }: { collapsed: boolean }) {
  return <button type="button" data-collapsed={String(collapsed)}>Lekki Branch</button>;
}

describe("ConsoleSidebar footer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function draw(open: boolean, footer?: ComponentType<{ collapsed: boolean }>) {
    const { ConsoleSidebar, SidebarProvider } = await loadSidebar(footer);
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
    await draw(true, BranchSwitcher);
    const footer = container.querySelector('[data-sidebar="footer"]');
    expect(footer?.textContent).toBe("Lekki Branch");
    expect(footer?.querySelector("button")?.dataset.collapsed).toBe("false");
  });

  it("tells the footer when the sidebar is collapsed to its icon rail", async () => {
    await draw(false, BranchSwitcher);
    expect(container.querySelector('[data-sidebar="footer"] button')?.getAttribute("data-collapsed")).toBe("true");
  });

  it("ends with the menu when the host has no footer", async () => {
    await draw(true);
    expect(container.querySelector('[data-sidebar="footer"]')).toBeNull();
    expect(container.textContent).toContain("Receivables");
  });
});
