/**
 * Reading why a request failed.
 *
 * A refusal and an empty answer look alike to a screen that only counts rows,
 * and they mean opposite things to the reader: one says there is nothing here,
 * the other says there is something they may not see. Screens ask this module
 * which one they have rather than each testing the status code their own way.
 *
 * It also owns the wording of the refusals that belong to this package's
 * engines ({@link refusalMessage}), so both applications say the same thing.
 */

import { formatDay, resolveDisplayPrefs, type TenantDisplay } from "../utils/dates";

/** True when the server refused the request (HTTP 403). */
export function isForbidden(error: unknown): boolean {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}

/** The `error.code` the backend put on a refusal, or null. Reads an RTK Query
 *  error (`{ status, data }`) or the raw response envelope. */
export function errorCode(error: unknown): string | null {
  const code = envelopeOf(error)?.error?.code;
  return typeof code === "string" ? code : null;
}

/**
 * The sentence for a refusal whose wording this package owns, or null when the
 * failure is not one of them and the host's own wording should stand.
 *
 * `RECORD_RETAINED` (409) answers any delete of a record the law requires the
 * business to keep: a posted journal, a supplier bill, the evidence behind it.
 * The server's own message names the record and writes the date as ISO; the
 * reader needs only the date, in the school's own format, so the sentence is
 * "This record is kept until 31 Dec 2032 and can't be deleted." The date comes
 * from `error.detail.retained_until`; without a readable one the answer is null
 * and the server's own message stands.
 *
 * Every delete in either application reaches the server through the host's
 * request interceptor, so that interceptor is where this is called, once, with
 * the signed-in tenant's `display` preferences (`state.auth.tenant.display`).
 * It is a plain function rather than a hook for that reason.
 */
export function refusalMessage(error: unknown, display?: TenantDisplay | null): string | null {
  const envelope = envelopeOf(error);
  if (envelope?.error?.code === "RECORD_RETAINED") {
    const detail = envelope.error.detail;
    const until = detail && typeof detail === "object" && "retained_until" in detail
      ? (detail as { retained_until?: unknown }).retained_until
      : undefined;
    const day = typeof until === "string" ? formatDay(until, resolveDisplayPrefs(display)) : "-";
    if (day !== "-") return `This record is kept until ${day} and can't be deleted.`;
  }
  return null;
}

type ErrorEnvelope = { message?: unknown; error?: { code?: unknown; detail?: unknown } };

/** The `{ success, message, error }` body, from an RTK Query error or as given. */
function envelopeOf(error: unknown): ErrorEnvelope | null {
  if (!error || typeof error !== "object") return null;
  const data = "data" in error ? (error as { data?: unknown }).data : error;
  return data && typeof data === "object" ? (data as ErrorEnvelope) : null;
}
