/**
 * <TabStrip> - the one switcher in the product, in the several skins the product
 * already wears.
 *
 * Two things every switcher here gets, and neither is decoration:
 *
 * ONE HIGHLIGHT THAT MOVES. A single absolutely positioned element is measured
 * onto the active tab and slides to the next one, instead of a background being
 * switched off one button and on another. The eye follows the move and knows
 * which tab it came from; an instant swap only changes what is blue. The slide
 * runs on `transform` and `width` so it never touches layout, and a reader who
 * has asked their system to stop animating gets the instant swap back.
 *
 * A STRIP AS WIDE AS ITS TABS. `inline-flex` alone does not stop a grid or flex
 * item stretching, so the container also carries `justify-self-start self-start`.
 * Dropped straight into a single-column page grid without them, the strip runs
 * the full width of the screen with its tabs huddled at the left end and a field
 * of empty white beside them, which is what leaves a search box or an action
 * button stranded on a row of its own.
 *
 * MEASURED, NOT DIVIDED BY INDEX. Giving every tab an equal share of the strip
 * and moving the highlight by index is only right when the labels are a similar
 * length: "Pending approval 4" needs more than its share and the highlight ends
 * up under the neighbouring label. Measuring the active button means the strip
 * sizes to its content and the highlight follows, whatever the labels say.
 *
 * WHY THE TABS SCROLL RATHER THAN WRAP. A highlight measured at one offset
 * cannot follow a tab that has wrapped onto a second line, so a narrow screen
 * scrolls the strip sideways instead. This is also the house convention for tab
 * strips, and it costs seeing every tab at once on a phone.
 *
 * Pick the `variant` that matches the strip being replaced so the type, colour
 * and shape stay exactly as they were; `className` and `buttonClassName` cover
 * the per-screen differences that remain (a font size, a gap, a border).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabStripItem<T extends string> {
  value: T;
  /** Free-form so a screen keeps its own count or icon markup beside the label. */
  label: ReactNode;
  disabled?: boolean;
}

export type TabStripVariant =
  | "pill"
  | "pill-soft"
  | "pill-compact"
  | "pill-full"
  | "segmented"
  | "underline";

interface Skin {
  container: string;
  highlight: string;
  button: string;
  active: string;
  inactive: string;
}

/**
 * One entry per look already in the product. The classes are the ones the
 * hand-rolled strips used, so adopting a variant is a change of mechanism and
 * not a change of design.
 *
 * The highlight is positioned by the strip's own padding: a `p-1` track insets
 * its highlight by the same 1, so the moving element lines up with where the
 * button's background used to be.
 */
const SKINS: Record<TabStripVariant, Skin> = {
  // Status and bucket strips on a white card: General Ledger, invoices,
  // receipts, webhooks, currencies.
  pill: {
    container: "gap-1 rounded-md border border-white-02 bg-white p-1",
    highlight: "inset-y-1 rounded-md bg-primary",
    button: "rounded-md px-3 py-1.5 font-mont text-xs font-semibold",
    active: "text-white",
    inactive: "text-gray-05 hover:text-gray-01",
  },
  // The same strip in the paler blue the sheets use.
  "pill-soft": {
    container: "rounded-lg border border-white-02 bg-white p-1",
    highlight: "inset-y-1 rounded-md bg-pry-01",
    button: "rounded-md px-3 py-1.5 text-xs font-medium",
    active: "text-primary",
    inactive: "text-gray-01",
  },
  // Two- or three-option view switchers that sit inside a card header or beside
  // a heading, where the full strip would be too heavy.
  "pill-compact": {
    container: "rounded-md border border-white-02 p-0.5 font-mont text-xs",
    highlight: "inset-y-0.5 rounded bg-primary",
    button: "rounded px-2.5 py-1",
    active: "text-white",
    inactive: "text-gray-05 hover:text-gray-01",
  },
  // The page-level workflow strip: taller, round-ended, larger type.
  "pill-full": {
    container: "h-11 items-stretch rounded-full border border-border bg-white p-1",
    highlight: "inset-y-1 rounded-full bg-pry-01",
    button: "cursor-pointer rounded-full bg-transparent px-4 font-mont text-base font-medium",
    active: "text-primary",
    inactive: "text-gray-01 hover:text-black-01",
  },
  // Grey track with a raised white thumb, which reads as a control rather than
  // as navigation: drawer choices, settlement, dunning.
  segmented: {
    container: "gap-1 rounded-lg bg-[#ECECEC] p-1",
    highlight: "inset-y-1 rounded-md bg-white shadow-sm ring-1 ring-black/5",
    button: "rounded-md px-3 py-1.5 font-mont text-sm",
    active: "font-semibold text-black-01",
    inactive: "font-medium text-gray-05 hover:text-gray-01",
  },
  // Bar under the active label, on a ruled line: the procurement screens.
  underline: {
    container: "gap-4 border-b border-white-02",
    highlight: "bottom-0 h-0.5 bg-primary",
    button: "px-0.5 py-2.5 font-mont text-xs font-medium",
    active: "text-primary",
    inactive: "text-gray-05 hover:text-gray-01",
  },
};

export interface TabStripProps<T extends string> {
  items: readonly TabStripItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: TabStripVariant;
  /**
   * `tablist` marks the strip as navigation between views and is the default.
   * `toggle` renders pressed buttons instead, for a strip that sets a value on
   * a form rather than moving between panels.
   */
  semantics?: "tablist" | "toggle";
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  dataGuide?: string;
}

export function TabStrip<T extends string>({
  items,
  value,
  onChange,
  variant = "pill",
  semantics = "tablist",
  ariaLabel,
  className,
  buttonClassName,
  dataGuide,
}: TabStripProps<T>) {
  const skin = SKINS[variant];
  const listRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState({ left: 0, width: 0 });

  /**
   * Put the highlight on the active button, and do nothing at all if it is
   * already there.
   *
   * Measuring runs from a layout effect keyed on `items`, so a caller that
   * builds its items inline in its own body re-measures every time it renders,
   * which for a screen holding a search box means on every keystroke. Storing a
   * fresh `{left, width}` object each time would render this strip again for a
   * highlight that has not moved. Returning the previous state unchanged means
   * an unchanged position costs nothing, whatever the caller does with its
   * array.
   *
   * This settles on its own either way: storing state here re-renders the strip
   * but not the caller, so the `items` array keeps its identity and the effect
   * does not fire a second time.
   */
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    // No match leaves the highlight at zero width, which renders nothing: the
    // right answer for a value that is not one of the options.
    const next = active ? { left: active.offsetLeft, width: active.offsetWidth } : { left: 0, width: 0 };
    setHighlight((prev) => (prev.left === next.left && prev.width === next.width ? prev : next));
  }, []);

  // Layout effect so the highlight is already in place on the first paint,
  // rather than sliding in from the left edge as the screen appears.
  useLayoutEffect(measure, [measure, value, items]);

  /**
   * Whether the highlight has a real position to move FROM.
   *
   * A strip inside something that opens (a drawer, a sheet, a collapsed panel)
   * is measured while it is still hidden, where every offset reads zero. Left
   * animating, the highlight would then be seen growing out of the left edge
   * every time the drawer opens, which reads as a glitch rather than as a move.
   * The first placement at a real width is therefore instant, and only the moves
   * after it slide. Closing resets this, so reopening is instant again.
   */
  const settled = useRef(false);
  useEffect(() => {
    settled.current = highlight.width > 0;
  }, [highlight.width]);
  const animate = settled.current && highlight.width > 0;

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
      data-guide={dataGuide}
      role={semantics === "tablist" ? "tablist" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex max-w-full items-center justify-self-start self-start overflow-x-auto",
        skin.container,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0",
          animate
            ? "transition-[transform,width] duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none"
            : "transition-none",
          skin.highlight,
        )}
        style={{ width: `${highlight.width}px`, transform: `translateX(${highlight.left}px)` }}
      />
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            data-active={isActive}
            disabled={item.disabled}
            role={semantics === "tablist" ? "tab" : undefined}
            aria-selected={semantics === "tablist" ? isActive : undefined}
            aria-pressed={semantics === "toggle" ? isActive : undefined}
            onClick={() => !item.disabled && onChange(item.value)}
            className={cn(
              "relative z-1 shrink-0 whitespace-nowrap transition-colors",
              skin.button,
              isActive ? skin.active : skin.inactive,
              item.disabled && "cursor-not-allowed opacity-40",
              buttonClassName,
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
