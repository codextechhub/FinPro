/**
 * A selectable card wrapping the real Checkbox (or its single-select
 * equivalent) - used for datasets, formats and values mode.
 *
 * Selected reads as a primary border plus a --color-pry-01 fill. A choice that
 * is unavailable is DISABLED WITH THE REASON BESIDE IT, never hidden: "why can
 * I not pick CSV here?" is a question the screen should answer without anyone
 * having to ask.
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChoiceCard({
  title,
  description,
  tag,
  selected,
  disabled,
  disabledReason,
  onSelect,
}: {
  title: string;
  description?: string;
  /** Short metadata, e.g. "47 fields". Monospace - it is a count. */
  tag?: string;
  selected: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-white-02 bg-white opacity-60"
          : selected
            ? "cursor-pointer border-primary bg-pry-01/40"
            : "cursor-pointer border-white-02 bg-white hover:border-primary/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-content-center rounded-[4px] border",
          selected ? "border-primary bg-primary text-white" : "border-gray-02 bg-white",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mont text-sm font-semibold text-black-01">{title}</span>
          {tag && (
            <span className="font-geist-mono text-[10px] tabular-nums text-gray-05">{tag}</span>
          )}
        </span>
        {description && (
          <span className="mt-1 block font-mont text-xs leading-relaxed text-gray-01">
            {description}
          </span>
        )}
        {disabled && disabledReason && (
          <span className="mt-1.5 block font-mont text-[11px] leading-relaxed text-gray-05">
            {disabledReason}
          </span>
        )}
      </span>
    </button>
  );
}
