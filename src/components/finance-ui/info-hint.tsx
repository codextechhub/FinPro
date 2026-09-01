// <InfoHint> - a small ⓘ icon that reveals an explanatory note on activation.
// It intentionally uses a popover rather than a tooltip: product guidance stays
// closed on hover/focus and works consistently with click, keyboard and touch.
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function InfoHint({
  children,
  className,
  ariaLabel = "More information about this section",
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex size-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-sm text-gray-05 hover:text-gray-01 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            className,
          )}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`${ariaLabel} details`}
        className="max-w-xs font-mont text-xs leading-relaxed"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
