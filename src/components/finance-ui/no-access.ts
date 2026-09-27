/**
 * What a reader whose role lacks a permission is told, as one sentence.
 *
 * It names what they cannot do in their own words and who can change that. It
 * never names the permission key: a code like `finance.concession.submit` means
 * nothing to a bursar, and the administrator who can grant it finds it by the
 * action, not by the code. `action` completes "Your role can't ...", as in
 * "submit concessions".
 */
export function noAccessMessage(action: string): string {
  return `Your role can't ${action}. Ask your administrator.`;
}
