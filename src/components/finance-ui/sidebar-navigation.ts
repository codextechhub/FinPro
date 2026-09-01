/** Breathing room left below a revealed item, so it never sits flush on the edge. */
const REVEAL_PADDING = 8;

/**
 * Scroll a just-expanded nav group into view inside its own scroll container.
 *
 * The menu is taller than the sidebar, so opening a group near the bottom (the
 * reported case: Support) drops its submenu below the fold - the group looks
 * like it did nothing until you scroll. Nothing handled that before: the
 * navigation-time reveal below only runs on a route change, and expanding a
 * group is not one.
 *
 * Two rules, and the second is what stops the obvious fix being wrong:
 *
 * 1. Scroll only as far as needed to bring the group's bottom into view. A group
 *    already fully visible must not move, or every click would jolt the menu.
 * 2. Never scroll the group's own header out of view. A submenu longer than the
 *    sidebar would otherwise scroll past its own trigger, leaving a list of
 *    children with nothing saying which section they belong to. Clamping at the
 *    header pins it to the top instead and fills the rest with children.
 */
export function revealExpandedNavGroup(item: HTMLElement) {
  const container = item.closest<HTMLElement>('[data-slot="sidebar-content"]');
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  const hiddenBelow = itemRect.bottom - containerRect.bottom;
  if (hiddenBelow <= 0) return;  // rule 1: already fully visible

  // rule 2: scrolling further than this would push the header off the top
  const headerAtTop = itemRect.top - containerRect.top;
  container.scrollTop += Math.min(hiddenBelow + REVEAL_PADDING, headerAtTop);
}

/**
 * Restore a sidebar's position, then reveal the most specific active entry.
 * Expandable navigation marks both the section and its child active, so the
 * last active element is the leaf the user actually navigated to.
 */
export function revealActiveSidebarItem(
  element: HTMLElement,
  rememberedScroll: number | null | undefined,
) {
  if (rememberedScroll != null) element.scrollTop = rememberedScroll;

  const activeItems = element.querySelectorAll<HTMLElement>('[data-active="true"]');
  const active = activeItems.item(activeItems.length - 1);
  if (!active) return;

  const containerRect = element.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();

  if (rememberedScroll == null) {
    element.scrollTop +=
      activeRect.top - containerRect.top -
      (element.clientHeight - activeRect.height) / 2;
  } else if (activeRect.top < containerRect.top) {
    element.scrollTop -= containerRect.top - activeRect.top + 8;
  } else if (activeRect.bottom > containerRect.bottom) {
    element.scrollTop += activeRect.bottom - containerRect.bottom + 8;
  }
}
