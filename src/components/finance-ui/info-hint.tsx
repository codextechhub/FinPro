/**
 * <InfoHint> - a small ⓘ icon that reveals an explanatory note on activation.
 *
 * It uses a popover rather than a tooltip: product guidance stays closed on
 * hover and focus, and opens the same way by click, keyboard and touch.
 *
 * The trigger is a focusable `role="button"` span rather than a `<button>`. A
 * disabled `<fieldset>` disables every button inside it, and a read-only form
 * is drawn as exactly that (see `AccessField`), so a native button would leave
 * a read-only reader unable to open the explanation of the field they are
 * reading. Enter and Space open it, as they would a button.
 */
import type { KeyboardEvent } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Enter and Space activate the trigger; Space would otherwise scroll the page. */
function activateOnKey(event: KeyboardEvent<HTMLSpanElement>) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.currentTarget.click();
}

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
        <span
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          onKeyDown={activateOnKey}
          className={cn(
            "inline-flex size-8 min-h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-gray-05 hover:text-gray-01 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            className,
          )}
        >
          <Info className="size-4" aria-hidden="true" />
        </span>
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
