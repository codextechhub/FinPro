/**
 * The left sidebar for a dedicated console (Finance / Procurement). Mirrors the
 * global AppSidebar's chrome but renders the console's own menu via the shared
 * collapsible NavMain - expand-only parents + leaf links. Replaces the global
 * nav while you're inside the console.
 *
 * There is no way-out row. The mark at the top is already a link home, and the
 * header's search box reaches any screen by name, so a permanent "Back to Home"
 * was a third route to the same place, taking the first slot on every console
 * screen to do it.
 */

import { useLayoutEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppLogo } from "../../host";
import { NavMain } from "./nav-main";
import { usePermissions } from "@/hooks/use-permissions";
import { routesPath } from "@/routes/routes-path";
import type { ConsoleNavGroup, ConsoleNavItem } from "./console-nav";
import { revealActiveSidebarItem } from "./sidebar-navigation";

/**
 * Each console page mounts its own shell, so the sidebar remounts on every
 * in-console navigation - which would reset its scroll to the top. Remember the
 * scroll offset per console (module scope survives the remount) and restore it
 * before paint so a click on a item far down the menu keeps the menu in place.
 */
const scrollByConsole = new Map<string, number>();

export function ConsoleSidebar({ title, nav }: { title: string; nav: ConsoleNavGroup[] }) {
  const location = useLocation().pathname;
  const { hasModuleAccess } = usePermissions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCollapsed = useSidebar().state === "collapsed";

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const remembered = scrollByConsole.get(title);
    // Always reveal the newly active item. A sidebar link that was already in
    // view keeps its position; programmatic navigation from a dashboard card
    // scrolls only enough to bring the destination row into view.
    revealActiveSidebarItem(el, remembered);
  }, [title, location]);

  const childVisible = (prefixes?: string[]) => !prefixes?.length || hasModuleAccess(...prefixes);

  // Find the single best-matching leaf URL (longest URL whose path is a prefix
  // of the current location). This prevents a shorter sibling URL from also
  // lighting up when a more-specific sibling is the real active item -
  // e.g. /finance/collections must not be active when at /finance/collections/virtual-accounts.
  const matches = (url: string) => location === url || location.startsWith(url + "/");
  const activeUrl = (() => {
    let best: string | null = null;
    for (const g of nav) {
      for (const item of g.items) {
        const leaves = item.children?.length ? item.children : [item];
        for (const leaf of leaves) {
          if (matches(leaf.url) && (!best || leaf.url.length > best.length)) best = leaf.url;
        }
      }
    }
    return best;
  })();

  const mapItems = (navItems: ConsoleNavItem[]) => navItems.flatMap((item) => {
    const kids = (item.children ?? []).filter((c) => childVisible(c.prefixes));
    // A parent shows if it has visible children, or (no children) its own keys pass.
    const visible = item.children?.length
      ? kids.length > 0
      : !item.prefixes?.length || hasModuleAccess(...item.prefixes);
    if (!visible) return [];

    if (kids.length) {
      return [{
        title: item.title,
        url: item.url,
        icon: item.icon,
        isActive: false,
        childActive: kids.some((c) => c.url === activeUrl),
        items: kids.map((c) => ({
          title: c.title,
          url: c.url,
          isActive: c.url === activeUrl,
        })),
      }];
    }
    return [{
      title: item.title,
      url: item.url,
      icon: item.icon,
      isActive: item.url === activeUrl,
      childActive: false,
    }];
  });

  // Build each visible group: its label + mapped items (drop empty groups).
  const groups = nav
    .map((g) => ({ label: g.label, items: mapItems(g.items) }))
    .filter((g) => g.items.length > 0);

  const groupLabelCls = "px-4 pb-1 pt-3 font-mont text-[10px] font-semibold uppercase tracking-wide text-gray-05 group-data-[collapsible=icon]:hidden";

  return (
    <Sidebar className="bg-white console-geist" collapsible="icon">
      {/* The rule under the mark is the same rule that runs under the page
          title, so the two meet and the top of the app reads as one line
          rather than a step. The heights have to agree in BOTH states: the
          page header is `min-h-15` and drops to `min-h-12` on the icon rail,
          so this follows it. It also gives the sidebar a fixed edge for its
          content to scroll under, which is what school-fe has and this did
          not. */}
      <SidebarHeader className="h-15 justify-center border-b border-white-02 bg-white group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to={routesPath.PROTECTED.OVERVIEW.INDEX} aria-label="Go to dashboard" className="flex items-center justify-center">
              {/* Collapsed to the icon rail there is no width for the wordmark
                  to turn into, so it stays a plain shield there. */}
              <AppLogo animate={!isCollapsed} />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent
        ref={scrollRef}
        onScroll={(e) => scrollByConsole.set(title, e.currentTarget.scrollTop)}
        // The base primitive sets overflow-hidden in icon mode; the console menu
        // is long, so force vertical scroll when collapsed (x stays clipped).
        className="bg-white pt-3 pb-6 group-data-[collapsible=icon]:overflow-y-auto!"
      >
        {/* No "Back to Home" row. The mark above is already a link home
            (aria-label "Go to dashboard"), and the header's search box jumps
            anywhere by name - so a permanent row costing a slot at the top of
            every console screen was buying a third way to do the same thing. */}
        <p className={groupLabelCls}>{title}</p>
        {groups.map((g, i) => (
          <div key={g.label ?? `g${i}`}>
            {g.label && <p className={groupLabelCls}>{g.label}</p>}
            <NavMain items={g.items} navigationKey={location} />
          </div>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
