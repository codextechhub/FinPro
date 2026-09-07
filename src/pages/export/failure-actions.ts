/**
 * What a person can actually DO about each failure and omission.
 *
 * The backend already supplies a user-safe message and a recommended action in
 * words. This adds the missing half: which of those recommendations the UI can
 * turn into a button, and which are genuinely out-of-band.
 *
 * The distinction that matters is retry. Only a transient infrastructure fault
 * is worth retrying - a filter, permission, row-cap or date-span failure fails
 * again identically, so offering Retry there wastes a wait and teaches people
 * the button does not work. The API enforces this too (`failure.retryable`);
 * this map is what decides which button appears in its place.
 */

import type { OmissionCode } from "@/redux/services/dashboard/exports-types";

/** The one thing to offer beside the recommended action, if anything. */
export type FailureRemedy =
  /** The fix is a configuration change - open the export in the builder. */
  | { kind: "edit"; label: string }
  /** The fix is a fresh attempt; the API decides whether it is allowed. */
  | { kind: "retry"; label: string }
  /** Nothing the UI can do: the fix is a person or a permission elsewhere. */
  | { kind: "none" };

const REMEDY_BY_CODE: Record<string, FailureRemedy> = {
  // Configuration: the recipe is wrong, and the builder is where it gets right.
  FILTER_INVALID: { kind: "edit", label: "Edit the filters" },
  REQUIRED_FILTER_MISSING: { kind: "edit", label: "Set the filter" },
  NO_COLUMNS: { kind: "edit", label: "Choose columns" },
  ROW_CAP_EXCEEDED: { kind: "edit", label: "Narrow the filters" },
  // Historical: a wide range no longer fails a run (it warns in the
  // estimate instead), but runs recorded before that change still carry it.
  DATE_SPAN_EXCEEDED: { kind: "edit", label: "Shorten the date range" },
  DATASET_WITHDRAWN: { kind: "edit", label: "Pick another dataset" },

  // Transient: the only case where running it again can change the outcome.
  INFRASTRUCTURE: { kind: "retry", label: "Retry now" },
  UNKNOWN: { kind: "retry", label: "Retry now" },

  // Access and ownership. Nothing in this app grants them, so a button here
  // would be a dead end - the recommended action names who to ask instead.
  DATASET_FORBIDDEN: { kind: "none" },
  ENTITY_FORBIDDEN: { kind: "none" },
  OWNER_INACTIVE: { kind: "none" },
};

export function remedyFor(code: string | undefined | null): FailureRemedy {
  return (code && REMEDY_BY_CODE[code]) || { kind: "none" };
}

/** A short heading for one omission, so the list reads as reasons not prose. */
export const OMISSION_HEADING: Record<OmissionCode | string, string> = {
  FIELD_FORBIDDEN: "Columns left out - you cannot read those fields",
  FIELD_WITHDRAWN: "Columns left out - those fields no longer exist",
  ROW_CAP_HIT: "Rows left out - the row cap was reached",
};

/** Whether editing the export is a sensible response to this omission. */
export function omissionIsFixableInBuilder(code: string): boolean {
  return code === "FIELD_WITHDRAWN" || code === "ROW_CAP_HIT";
}
