// The date field for anything that posts to the general ledger.
//
// Use this for a *document* date - invoice date, receipt date, GRN received date,
// vendor payment date. Those all reach `ensure_period_open` on the backend, which
// rejects a date outside an OPEN fiscal period with a 409, so the calendar here
// simply stops offering them.
//
// Do NOT use it for dates that never post: due dates, "needed by", "valid until",
// expected delivery. Those are deliberately in the future, past the end of every
// open period, and constraining them would break them. Plain <Input type="date"/>
// stays right for those, and for report filters - you must be able to run a report
// over a closed period.
//
// `notBefore` is the second, separate constraint. An open period answers "may we
// book on this date at all?"; `notBefore` answers "could this have happened by
// then?" - a write-off cannot predate its invoice, a refund cannot predate the
// credit it pays out. The backend enforces it either way (a 409
// POSTING_BACKDATED), so this exists to stop the user picking the date, not to be
// the guard.

import { useEffect, useRef } from "react";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { cn } from "@/lib/utils";
import { clipRangesFrom } from "@/utils/posting-window";
import { usePostingWindow } from "./use-posting-window";

export function PostingDateField({
  label,
  value,
  onChange,
  entity,
  required = true,
  disabled,
  className,
  hint,
  notBefore,
  notBeforeLabel,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  /** Defaults to the globally-selected entity; pass only to override. */
  entity?: string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Extra guidance shown under the field, above any period message. */
  hint?: string;
  /**
   * Earliest date this document could have happened (ISO). Nothing may settle,
   * refund or write off value that does not exist yet, so earlier days are removed
   * from the calendar rather than left to fail on submit.
   */
  notBefore?: string | null;
  /** What sits at `notBefore`, e.g. "invoice INV-104" - used in the message. */
  notBeforeLabel?: string;
}) {
  const { ranges: openRanges, defaultDate: windowDefault, constrained, noOpenPeriod, label: windowLabel, reasonFor, isLoading } =
    usePostingWindow(entity);

  // Intersect the open periods with the causal floor. Both constraints must hold,
  // and a period that ends before the floor drops out entirely.
  const ranges = clipRangesFrom(openRanges, notBefore);

  // Never seed a date the field would immediately reject.
  const defaultDate =
    notBefore && windowDefault && windowDefault < notBefore
      ? (ranges[0]?.from ?? notBefore)
      : windowDefault;

  // Seed the field once the window is known. Forms mount before the window
  // resolves, so they start empty and get filled here rather than showing today
  // and visibly flicking to another date a moment later.
  //
  // Only ever fills an EMPTY field. An existing document's date is left exactly
  // as saved even when it sits outside the window - silently rewriting a stored
  // date would be a data change disguised as a default. It shows an error instead.
  //
  // A required field refills whenever it goes empty, so a drawer that resets and
  // reopens gets a fresh default. An optional one seeds once: refilling there would
  // fight the calendar's own Clear button.
  const seeded = useRef(false);
  useEffect(() => {
    if (isLoading || value || !defaultDate) return;
    if (!required && seeded.current) return;
    seeded.current = true;
    onChange(defaultDate);
  }, [defaultDate, isLoading, value, required, onChange]);

  // The causal floor is checked first: "before the invoice existed" is a more
  // useful thing to tell someone than "outside the open period", and a date can
  // easily be both.
  const tooEarly = Boolean(value) && Boolean(notBefore) && value < notBefore!;
  const reason = reasonFor(value);
  const invalid = tooEarly || (Boolean(value) && Boolean(reason));
  // No open period survives the floor - the two constraints have no overlap, so
  // there is no date the user could pick.
  const noEligibleDate = Boolean(notBefore) && constrained && ranges.length === 0;

  return (
    <label className="block space-y-1">
      <span className="font-mont text-xs text-gray-05">
        {label}{required ? " *" : ""}
      </span>
      <DatePickerInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled || noOpenPeriod || noEligibleDate}
        min={notBefore ?? undefined}
        allowedRanges={ranges}
        windowLabel={windowLabel}
        aria-invalid={invalid || undefined}
        className={cn("bg-white", className)}
      />
      {noOpenPeriod ? (
        <p className="font-mont text-[11px] text-error">
          No fiscal period is open for this entity - nothing can be posted until finance opens one.
        </p>
      ) : noEligibleDate ? (
        <p className="font-mont text-[11px] text-error">
          No open period falls on or after {notBefore}
          {notBeforeLabel ? ` (${notBeforeLabel})` : ""}, so this cannot be posted yet.
        </p>
      ) : tooEarly ? (
        <p className="font-mont text-[11px] text-error">
          {notBeforeLabel ? `${notBeforeLabel} only exists from ` : "Not valid before "}
          {notBefore}. Pick {notBefore} or later.
        </p>
      ) : reason ? (
        <p className="font-mont text-[11px] text-error">
          {reason} Pick a date in {windowLabel ?? "an open period"}.
        </p>
      ) : hint ? (
        <p className="font-mont text-[11px] text-gray-05">{hint}</p>
      ) : notBefore ? (
        <p className="font-mont text-[11px] text-gray-05">
          On or after {notBefore}
          {notBeforeLabel ? ` - ${notBeforeLabel}` : ""}
        </p>
      ) : constrained && windowLabel ? (
        <p className="font-mont text-[11px] text-gray-05">Open period: {windowLabel}</p>
      ) : null}
    </label>
  );
}
