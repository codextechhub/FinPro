import { useSearchParams } from "react-router";
import { TabStrip, type TabStripItem } from "@/components/finance-ui/tab-strip";

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

/**
 * The page-level workflow tab strip: where the active tab lives, and how it is
 * changed.
 *
 * Two modes, chosen by which props arrive. With `tabKey` the tab is a place: it
 * is written to the query string, so a refresh keeps it and a pasted link opens
 * on it. With `activeTab` and `setActiveTab` the tab is a filter held by the
 * caller, which is right when the selection is not worth putting in an address.
 *
 * The strip itself, including the highlight that slides between tabs and the
 * sizing that keeps it as wide as its labels, is <TabStrip variant="pill-full">.
 */
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

  const items: TabStripItem<string>[] = tabs.map((tab) => ({
    value: tab.value,
    label: tab.label,
  }));

  return (
    <TabStrip
      variant="pill-full"
      items={items}
      value={active}
      onChange={handleTabClick}
      ariaLabel={tabKey ?? "tabs"}
    />
  );
}
