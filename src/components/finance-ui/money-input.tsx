/**
 * <MoneyInput /> - edits an amount in naira (major units) but reports kobo
 * (integer minor units) to the parent, so forms only ever submit kobo. The
 * component keeps the raw text locally so a half-typed "12." doesn't get
 * clobbered, and converts on change via toKobo().
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { currencySymbol, toKobo, toNaira } from "@/utils/money";

interface MoneyInputProps {
  /** Current value in integer kobo. */
  valueKobo: number | null | undefined;
  /** Called with the new value in integer kobo. */
  onChangeKobo: (kobo: number) => void;
  currency?: string | null;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function MoneyInput({
  valueKobo,
  onChangeKobo,
  currency,
  placeholder = "0.00",
  disabled,
  id,
  className,
}: MoneyInputProps) {
  const [text, setText] = useState<string>(valueKobo ? String(toNaira(valueKobo)) : "");

  // Keep the field in sync when the parent resets the value (e.g. form reset),
  // without fighting the user while they type the same numeric value.
  useEffect(() => {
    const next = valueKobo ? String(toNaira(valueKobo)) : "";
    if (toKobo(text) !== (valueKobo ?? 0)) setText(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKobo]);

  return (
    <div className={cn("relative self-start", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mont text-sm text-gray-05">
        {currencySymbol(currency)}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          // Allow only digits, one dot, and grouping commas while typing.
          if (raw !== "" && !/^[\d,]*\.?\d*$/.test(raw)) return;
          setText(raw);
          onChangeKobo(toKobo(raw));
        }}
        onBlur={() => setText(valueKobo ? String(toNaira(valueKobo)) : "")}
        className="pl-9 text-right font-mont tabular-nums"
      />
    </div>
  );
}
