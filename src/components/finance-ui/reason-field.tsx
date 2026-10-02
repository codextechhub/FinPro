/**
 * <ReasonField> - the required "why" for an action that undoes a control.
 *
 * Re-opening a month or a fiscal year, forcing a close over its checks, and
 * removing evidence from a document that has left draft each need a reason,
 * and the backend stores it on the audit row the next reader sees. The server
 * refuses a blank one and anything longer than {@link REASON_MAX_LENGTH}, so
 * the field caps its length and the caller disables its confirm button until
 * {@link hasReason} is true; the reader is never sent to a refusal that the
 * form could have answered.
 *
 * It sits inside a `ConfirmActionModal` as its children, so the reason is
 * written in the same dialog that states the consequence.
 */

import { useId } from "react";

import { Textarea } from "@/components/ui/textarea";

/** The longest reason the backend stores on an audit row. */
export const REASON_MAX_LENGTH = 500;

/** Whether `text` is a reason the backend accepts (not blank once trimmed). */
export function hasReason(text: string): boolean {
  return text.trim().length > 0;
}

export function ReasonField({
  value,
  onChange,
  label = "Reason",
  placeholder,
  hint,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** One line under the field saying where the reason ends up. */
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-mont text-xs font-medium text-black-01">
        {label} *
      </label>
      <Textarea
        id={id}
        rows={3}
        required
        aria-required
        aria-describedby={hint ? hintId : undefined}
        maxLength={REASON_MAX_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-white"
      />
      {hint ? <p id={hintId} className="font-mont text-[11px] leading-5 text-gray-05">{hint}</p> : null}
    </div>
  );
}
