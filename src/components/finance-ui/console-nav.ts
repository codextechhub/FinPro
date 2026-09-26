/**
 * Types and rules for a console's hierarchical sidebar menu. Parents with
 * `children` are expand-only (they don't navigate - you click a child); leaf
 * items navigate.
 *
 * **A screen appears only when it can open.** `permissions` names the codes
 * whose backend key the screen's landing request requires (any one of them is
 * enough), the same `rbac_permission` the list endpoint checks. Gating on "any
 * key under the resource" instead offered AR Invoices to somebody holding only
 * `finance.invoice.create`, who then landed on a refused list; and the hand-typed
 * prefixes drifted from the real keys, so a write-off holder never saw Refunds &
 * Write-offs at all. `console-nav.test.ts` checks every declared code against
 * the backend's key catalogue.
 *
 * **Every backend key has a home.** `resources` names the resources whose keys
 * are exercised on a screen without opening it: Payroll opens on
 * `finance.payrollrun.view`, and its salary tabs use `finance.salary.*`. The
 * coverage test requires every key in the catalogue to belong to a screen, so a
 * key the backend adds cannot go unnoticed until somebody holds it and finds
 * nothing.
 *
 * A screen with no `permissions` opens for anyone inside the console: the
 * dashboards, and procurement's approval queue, which lists only what is routed
 * to the reader.
 */

import type { ElementType } from "react";
import type { PermissionCode } from "../../permissions";

export interface ConsoleNavChild {
  title: string;
  url: string;
  /** Any one of these opens the screen. Absent: open to anyone in the console. */
  permissions?: PermissionCode[];
  /** Backend resources ("finance.salary") used on this screen beyond `permissions`. */
  resources?: string[];
}

export interface ConsoleNavItem extends ConsoleNavChild {
  icon?: ElementType;
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
 * The two questions a menu asks of the reader's permissions, supplied by the
 * host's `usePermissions`: whether they hold any of some codes, and whether they
 * hold any key under a backend prefix.
 */
export interface ConsoleNavGate {
  hasAnyPermission: (...codes: PermissionCode[]) => boolean;
  hasModuleAccess: (...prefixes: string[]) => boolean;
}

/** Whether a screen opens for this reader. */
export function navEntryOpen(entry: ConsoleNavChild, gate: ConsoleNavGate): boolean {
  return !entry.permissions?.length || gate.hasAnyPermission(...entry.permissions);
}

/**
 * The menu as this reader sees it: screens that cannot open are removed, a
 * parent survives only with a visible child, and a group with nothing left is
 * dropped rather than rendered as an empty heading.
 */
export function visibleConsoleNav(nav: ConsoleNavGroup[], gate: ConsoleNavGate): ConsoleNavGroup[] {
  return nav
    .map((group) => ({
      ...group,
      items: group.items.flatMap((item) => {
        if (!item.children?.length) return navEntryOpen(item, gate) ? [item] : [];
        const children = item.children.filter((child) => navEntryOpen(child, gate));
        return children.length ? [{ ...item, children }] : [];
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Whether the console holds anything for this reader, which is what decides if
 * the host's main menu offers it at all.
 *
 * A gated screen counts when it opens. An ungated one counts only when the
 * reader holds a key on a resource it declares: everybody may open the
 * procurement approval queue, but it is a reason to offer Procurement only to
 * somebody whose keys concern approvals. The dashboards declare nothing, so a
 * console whose only open screen is its dashboard is not offered: that reader
 * would land on a page with nothing of theirs on it.
 */
export function consoleOffersScreens(nav: ConsoleNavGroup[], gate: ConsoleNavGate): boolean {
  const offers = (entry: ConsoleNavChild) =>
    entry.permissions?.length
      ? gate.hasAnyPermission(...entry.permissions)
      : !!entry.resources?.some((resource) => gate.hasModuleAccess(`${resource}.`));
  return nav.some((group) =>
    group.items.some((item) => (item.children?.length ? item.children.some(offers) : offers(item))),
  );
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
