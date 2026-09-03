/**
 * Types for a console's hierarchical sidebar menu. Parents with `children` are
 * expand-only (they don't navigate - you click a child); leaf items navigate.
 * `prefixes` gate visibility by backend key prefix (hasModuleAccess); a parent
 * is shown when it has its own prefixes OR any visible child.
 */

import type { ElementType } from "react";

export interface ConsoleNavChild {
  title: string;
  url: string;
  prefixes?: string[];
}

export interface ConsoleNavItem {
  title: string;
  url: string;
  icon?: ElementType;
  prefixes?: string[];
  children?: ConsoleNavChild[];
}

// A labelled section of the console sidebar (the design groups items under
// headings like "Ledger & Setup" / "Receivables"). An omitted `label` renders the
// items with no heading (e.g. a pinned Dashboard above the first group).
export interface ConsoleNavGroup {
  label?: string;
  items: ConsoleNavItem[];
}

/**
 * Title of the nav item (leaf or child) whose URL best matches `pathname` -
 * used to drive the console header so it reflects the current screen, not the
 * console name. Most-specific (longest URL) wins, so the console root only
 * matches on its exact path. Returns null when nothing matches.
 */
export function activeNavTitle(nav: ConsoleNavGroup[], pathname: string): string | null {
  const candidates: { url: string; title: string }[] = [];
  for (const group of nav) {
    for (const item of group.items) {
      if (item.children?.length) {
        for (const child of item.children) candidates.push({ url: child.url, title: child.title });
      } else {
        candidates.push({ url: item.url, title: item.title });
      }
    }
  }
  let best: { url: string; title: string } | null = null;
  for (const c of candidates) {
    if (pathname === c.url || pathname.startsWith(c.url + "/")) {
      if (!best || c.url.length > best.url.length) best = c;
    }
  }
  return best?.title ?? null;
}
