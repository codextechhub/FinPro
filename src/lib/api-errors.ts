/**
 * Reading why a request failed.
 *
 * A refusal and an empty answer look alike to a screen that only counts rows,
 * and they mean opposite things to the reader: one says there is nothing here,
 * the other says there is something they may not see. Screens ask this module
 * which one they have rather than each testing the status code their own way.
 */

/** True when the server refused the request (HTTP 403). */
export function isForbidden(error: unknown): boolean {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}
