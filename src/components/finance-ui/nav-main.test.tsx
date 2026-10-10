import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { NavMain } from "./nav-main";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("NavMain active state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("highlights both a parent menu and its active submenu", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SidebarProvider defaultOpen>
            <Sidebar>
              <NavMain
                items={[
                  {
                    title: "Notifications",
                    url: "/notifications",
                    isActive: false,
                    childActive: true,
                    items: [
                      {
                        title: "Inbox",
                        url: "/notifications",
                        isActive: true,
                      },
                    ],
                  },
                ]}
              />
            </Sidebar>
          </SidebarProvider>
        </MemoryRouter>,
      );
    });

    const activeItems = container.querySelectorAll('[data-active="true"]');
    expect(activeItems).toHaveLength(2);
    expect(activeItems[0]?.textContent).toContain("Notifications");
    expect(activeItems[1]?.textContent).toContain("Inbox");
  });

  it("opens a submenu when its route becomes active after the sidebar mounts", async () => {
    const renderNav = (childActive: boolean) => (
      <MemoryRouter>
        <SidebarProvider defaultOpen>
          <Sidebar>
            <NavMain
              items={[
                {
                  title: "Notifications",
                  url: "/notifications",
                  isActive: false,
                  childActive,
                  items: [
                    {
                      title: "Inbox",
                      url: "/notifications",
                      isActive: childActive,
                    },
                  ],
                },
              ]}
            />
          </Sidebar>
        </SidebarProvider>
      </MemoryRouter>
    );

    await act(async () => root.render(renderNav(false)));
    expect(container.textContent).not.toContain("Inbox");

    await act(async () => root.render(renderNav(true)));
    expect(container.textContent).toContain("Inbox");
    expect(
      container.querySelector('[data-slot="collapsible-trigger"]')?.getAttribute("data-state"),
    ).toBe("open");
  });

  it("keeps only the most recently opened parent expanded", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SidebarProvider defaultOpen>
            <Sidebar>
              <NavMain
                items={[
                  {
                    title: "Users",
                    url: "/users",
                    isActive: false,
                    childActive: false,
                    items: [{ title: "CX Users", url: "/users/cx", isActive: false }],
                  },
                  {
                    title: "Notifications",
                    url: "/notifications",
                    isActive: false,
                    childActive: false,
                    items: [{ title: "Inbox", url: "/notifications", isActive: false }],
                  },
                ]}
              />
            </Sidebar>
          </SidebarProvider>
        </MemoryRouter>,
      );
    });

    const triggers = container.querySelectorAll<HTMLElement>(
      '[data-slot="collapsible-trigger"]',
    );
    await act(async () => triggers[0]?.click());
    expect(triggers[0]?.getAttribute("data-state")).toBe("open");

    await act(async () => triggers[1]?.click());
    expect(triggers[0]?.getAttribute("data-state")).toBe("closed");
    expect(triggers[1]?.getAttribute("data-state")).toBe("open");
    expect(container.textContent).not.toContain("CX Users");
    expect(container.textContent).toContain("Inbox");
  });

  it("keeps one menu open across separately labelled groups", async () => {
    function GroupedMenus() {
      const [open, setOpen] = useState<string | null>(null);
      const props = { sharedOpenTitle: open, onSharedOpenTitleChange: setOpen };
      return <>
        <NavMain items={[{
          title: "Books", url: "/books", isActive: false,
          items: [{ title: "Ledger", url: "/ledger", isActive: false }],
        }]} {...props} />
        <NavMain items={[{
          title: "Money Received", url: "/received", isActive: false,
          items: [{ title: "Receipts", url: "/receipts", isActive: false }],
        }]} {...props} />
      </>;
    }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SidebarProvider defaultOpen><Sidebar><GroupedMenus /></Sidebar></SidebarProvider>
        </MemoryRouter>,
      );
    });

    const triggers = container.querySelectorAll<HTMLElement>('[data-slot="collapsible-trigger"]');
    await act(async () => triggers[0]?.click());
    expect(container.textContent).toContain("Ledger");

    await act(async () => triggers[1]?.click());
    expect(container.textContent).not.toContain("Ledger");
    expect(container.textContent).toContain("Receipts");
  });

  it("opens the active main section and subgroup in a three-level menu", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SidebarProvider defaultOpen>
            <Sidebar>
              <NavMain items={[{
                title: "Receivables", url: "/finance/receivables", isActive: false, childActive: true,
                items: [{
                  title: "Money Received", url: "/finance/receivables/receipts", isActive: false, childActive: true,
                  items: [{
                    title: "Receipts & Allocation", url: "/finance/receivables/receipts", isActive: true, childActive: false,
                  }],
                }],
              }]} />
            </Sidebar>
          </SidebarProvider>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Receivables");
    expect(container.textContent).toContain("Money Received");
    expect(container.textContent).toContain("Receipts & Allocation");
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(3);
  });
});
