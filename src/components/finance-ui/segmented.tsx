/**
 * <Segmented> - a segmented toggle that reads as a control at first glance: a grey
 * track with a raised white "thumb" that slides onto the option being set. Used
 * across the finance drawers (note type, refund action, payment-plan frequency…)
 * for one consistent look. Renders its own label with comfortable spacing (don't
 * wrap in FormField).
 *
 * The buttons carry `aria-pressed` rather than tab semantics, because this sets a
 * value on the form around it instead of moving between panels.
 *
 * Options arrive as `[value, label]` pairs so a caller can keep them in one
 * `as const` list beside the state they drive; the track itself is the shared
 * <TabStrip> in its `segmented` skin, which is what gives the thumb its slide.
 */
import { TabStrip, type TabStripItem } from "./tab-strip";

export function Segmented<T extends string>({ value, onChange, options, label, isDisabled, className }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  label?: string;
  isDisabled?: (v: T) => boolean;
  className?: string;
}) {
  const items: TabStripItem<T>[] = options.map(([v, lbl]) => ({
    value: v,
    label: lbl,
    disabled: isDisabled?.(v) ?? false,
  }));

  return (
    <div>
      {label ? <p className="mb-2 font-mont text-xs text-gray-05">{label}</p> : null}
      <TabStrip
        items={items}
        value={value}
        onChange={onChange}
        variant="segmented"
        semantics="toggle"
        className={className}
      />
    </div>
  );
}
