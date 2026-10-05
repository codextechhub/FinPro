/**
 * Whether a bank account can move money on a bank document, as plain data.
 *
 * At a school with several branches an account not yet given a branch moves
 * nothing: no branch's books could carry what passed through it, and no
 * branch's bursar could see it. The server refuses it by name; the form says
 * the same before anything is sent. At a one-branch school every account is
 * that branch's, so the question does not arise.
 */

export function bankDocumentAccountProblem(
  account: { name: string; branch_id?: number | null } | undefined,
  multiBranch: boolean,
): string | null {
  if (!account || !multiBranch || account.branch_id != null) return null;
  return `${account.name} has not been given a branch, so no money can move through it. Give it its branch first.`;
}
