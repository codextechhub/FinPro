/**
 * The outline that marks a person who has left the school.
 *
 * Somebody who has exited stays named on every record they touched: the
 * journal they posted, the approval they gave, the audit entry they wrote.
 * Their avatar carries a dashed outline so a reader knows the name belongs to
 * someone no longer on the staff, without the record changing.
 *
 * The server says so explicitly (`is_exited`, `actor_is_exited`,
 * `created_by_is_exited` and the like). The screens never work it out from a
 * suspension, an account status, a missing photograph or the look of a name:
 * only the flag draws the outline, and a missing flag draws nothing.
 *
 * One semantic token, `muted-foreground`, so the outline follows the
 * application's own theme in both products.
 */

/** The classes for an avatar of somebody who has left. */
export const EXITED_OUTLINE = "outline-2 outline-dashed outline-offset-1 outline-muted-foreground";

/** Read as a tooltip beside the outline, so the mark is not colour or shape alone. */
export const EXITED_TITLE = "No longer on the staff";

/** The outline classes when the server says the person has exited, else nothing. */
export function exitedOutline(isExited: boolean | null | undefined): string {
  return isExited === true ? EXITED_OUTLINE : "";
}

/** The tooltip when the server says the person has exited, else nothing. */
export function exitedTitle(isExited: boolean | null | undefined): string | undefined {
  return isExited === true ? EXITED_TITLE : undefined;
}
