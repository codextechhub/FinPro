import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router";

export interface TabOption {
  label: string;
  value: string;
}

interface TabsProps {
  tabs: TabOption[];
  /**
   * URL-driven: the query key the active tab is kept under, so the tab is part
   * of the address and survives a refresh or a link somebody was sent.
   */
  tabKey?: string;
  /**
   * Controlled: the active value and its setter, for a screen whose tab is a
   * filter rather than a place - a support queue narrowed to Resolved is not an
   * address worth sending anybody.
   *
   * Passing `activeTab` chooses this mode. Neither given means the first tab,
   * uncontrolled and inert, which is what an empty tab list would render anyway.
   */
  activeTab?: string;
  setActiveTab?: (value: string) => void;
}

export default function Tabs({ tabKey, tabs, activeTab, setActiveTab }: TabsProps) {
  // Called unconditionally: a hook cannot hide behind a prop.
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultTab = tabs[0]?.value ?? "";
  const isControlled = activeTab !== undefined;
  const active = isControlled
    ? activeTab
    : tabKey
      ? (searchParams.get(tabKey) ?? defaultTab)
      : defaultTab;

  const handleTabClick = (value: string) => {
    if (isControlled) {
      setActiveTab?.(value);
      return;
    }
    if (!tabKey) return;
    setSearchParams((prev: URLSearchParams) => {
      const next = new URLSearchParams(prev);
      next.set(tabKey, value);
      return next;
    });
  };

  const listRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState({ left: 0, width: 0 });

  /**
   * Measure the ACTIVE TAB and put the highlight exactly there.
   *
   * The previous version gave every tab an equal share of the strip and moved
   * the highlight by index. That is only correct when the labels are a similar
   * length: at 390px "Roles & Permissions" needed more than its half, so it
   * overflowed its slot and ran underneath the pill sitting on "Invitations".
   * Measuring means the strip sizes to its content and the highlight follows,
   * whatever the labels say and whatever the viewport.
   */
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!active) return;
    setHighlight({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  // Layout effect so the highlight is in place on the first paint rather than
  // sliding in from zero the moment the screen appears.
  useLayoutEffect(measure, [measure, active, tabs]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    // Fonts landing and the viewport changing both move the tabs, and neither
    // fires anything else this component would hear.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={listRef}
      // Sizes to its labels rather than forcing equal columns, and scrolls
      // rather than overflowing when a long set of tabs meets a narrow screen.
      //
      // `justify-self-start` because inline-flex does NOT stop a grid item
      // stretching: dropped straight into a `grid grid-cols-1` page - which is
      // what PageShell is - the strip ran the full width of the screen with its
      // tabs huddled at the left end. `self-start` does the same for a flex
      // column. Neither has any effect in the block wrapper the roles screen
      // uses, so this is safe for every caller.
      className="relative inline-flex h-11 max-w-full items-stretch justify-self-start self-start overflow-x-auto bg-white rounded-full border border-border p-1"
      role="tablist"
      aria-label={tabKey ?? "tabs"}
    >
      {/* One highlight that slides, rather than a background that switches off
          one button and on another. The eye follows the move and knows which
          tab it came from; an instant swap just changes what is blue. Sliding
          on transform (not on left) keeps it off the layout path, and anyone
          who has asked their system to stop animating gets the instant swap. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-pry-01 transition-[transform,width] duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none"
        style={{
          width: `${highlight.width}px`,
          transform: `translateX(${highlight.left}px)`,
        }}
      />
      {tabs.map((tab) => {
        const isActive = active === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleTabClick(tab.value)}
            className={cn(
              "relative z-1 shrink-0 cursor-pointer px-4 rounded-full bg-transparent font-medium font-mont text-base whitespace-nowrap transition-colors",
              isActive ? "text-primary" : "text-gray-01 hover:text-black-01",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
