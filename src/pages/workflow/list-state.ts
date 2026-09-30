import { noAccessMessage } from "@/components/finance-ui/no-access";

/**
 * What an approval list says when it has no rows.
 *
 * An empty list and a list the reader was not given are different facts, and
 * one sentence for both misleads: a branch administrator whose role cannot
 * view approval steps read "No workflow templates published yet" and took
 * the school to have none. A refusal says the reader's role cannot see the
 * list; a failed request says so and asks for another try; only a list that
 * loaded and came back empty uses `emptyText`. `action` completes "Your role
 * can't ...", as in "view approval steps".
 */
export function listEmptyText(error: unknown, emptyText: string, action: string): string {
  if (!error) return emptyText;
  if (isRefused(error)) return noAccessMessage(action);
  return "This list could not be loaded. Try again.";
}

/** Whether a list may offer to create the first item: only when it truly loaded empty. */
export function listLoadedEmpty(error: unknown): boolean {
  return !error;
}

function isRefused(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status: unknown }).status === 403;
}
