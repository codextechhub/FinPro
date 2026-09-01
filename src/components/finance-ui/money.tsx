// <Money kobo={…} /> - renders an integer-kobo amount as currency. Tabular
// numerals keep columns aligned; pass `align="right"` in tables (the house
// convention for money columns).

import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";

interface MoneyProps {
  kobo: number | null | undefined;
  currency?: string | null;
  className?: string;
  /** Right-align as a block - used inside table cells. */
  align?: "left" | "right";
  /** Dim zero/empty amounts. */
  muted?: boolean;
}

/**
 * Font-size step for KPI card values. Money is never truncated or abbreviated,
 * and a formatted amount has no break points, so once it outgrows the card's
 * width the type must shrink: text-xl fits ~14 tabular chars in a 4-up strip.
 */
export function kpiValueClass(text: string) {
  return text.length > 17 ? "text-base" : text.length > 14 ? "text-lg" : "text-xl";
}

export function Money({ kobo, currency, className, align = "left", muted }: MoneyProps) {
  const value = kobo ?? 0;
  return (
    <span
      className={cn(
        "font-mont tabular-nums",
        align === "right" && "block text-right",
        (muted || value === 0) && "text-gray-05",
        value < 0 && "text-destructive",
        className,
      )}
    >
      {formatMoney(value, currency)}
    </span>
  );
}
