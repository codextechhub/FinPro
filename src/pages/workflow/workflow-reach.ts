/**
 * Which approval configuration a reader may change, and why not when they may not.
 *
 * The server keeps every workflow configuration write inside the writer's
 * branches. A template's steps, an approver group and a Dynamic Role each
 * decide approvals for some set of branches, and a branch administrator may
 * change one only when that set is non-empty and every branch in it is theirs.
 * An empty set is the whole school, which is for somebody who covers the whole
 * school. Anything else is refused with a 403 and one of the sentences below.
 *
 * These helpers answer the same question from what a screen already holds, so
 * the screen draws the thing read-only, with the reason, instead of offering a
 * button the server will refuse. The server stays the judge: where the client
 * cannot see everything that widens a row's reach (a stage override, or a
 * Dynamic Role sending to a group), a write can still be refused, and the
 * interceptor shows the server's own sentence.
 */
import type { HostReaderReach } from "@xvs/finance/host";

/** A template or group row's own branch, as the branch set it belongs to. Empty is the whole school. */
export function rowBranchIds(branch: string | number | null | undefined): number[] {
  if (branch == null || branch === "") return [];
  const id = Number(branch);
  return Number.isFinite(id) ? [id] : [];
}

/** Where a publish files its steps: one branch, the whole school, or a choice the reader still has to make. */
export type PublishTarget =
  | { kind: "school" }
  | { kind: "branch"; branch: number }
  | { kind: "choose"; choices: number[] };

/**
 * The branch a template's steps are published for.
 *
 * A whole-school reader keeps the row's own branch: editing Lekki's steps
 * saves Lekki's steps, and editing the school's (or adjusting the shared
 * version) saves the school's. Without it the server reads a whole-school
 * caller naming no branch as the school, so an edit opened on Lekki's steps
 * would overwrite the ladder every branch follows.
 *
 * A branch-bound reader never publishes the school's steps. They save the
 * row's branch when it is theirs, else the one branch they work in, else they
 * pick one of theirs. Adjusting the school's ladder from Lekki therefore gives
 * Lekki its own steps and leaves every other branch on the school's.
 */
export function publishTarget(
  existing: { branch: string | number | null; is_platform: boolean } | null | undefined,
  reach: HostReaderReach,
): PublishTarget {
  const own = existing && !existing.is_platform ? rowBranchIds(existing.branch) : [];
  if (reach.wholeSchool) return own.length ? { kind: "branch", branch: own[0] } : { kind: "school" };
  if (own.length && reach.covers(own)) return { kind: "branch", branch: own[0] };
  const choices = reach.branchIds ?? [];
  return choices.length === 1 ? { kind: "branch", branch: choices[0] } : { kind: "choose", choices };
}

/**
 * The branches whose approvals a group's membership decides, as far as the
 * reader's templates show. Empty is the whole school.
 *
 * A group's own branch records who owns it, not where it approves: any
 * template may name it. So a Lekki group reaches Lekki and the branch of every
 * template with a step pointing at it, and the whole school once a school-wide
 * template does. A shared template is left out, because its steps name the
 * platform's own groups rather than this school's row.
 */
export function groupBranchIds(
  group: { branch: string | number | null; code: string },
  templates: readonly {
    branch: string | number | null;
    is_platform: boolean;
    stages?: readonly { approver_group_code?: string | null }[];
  }[] | undefined,
): number[] {
  const ids = new Set(rowBranchIds(group.branch));
  if (!ids.size) return [];
  for (const template of templates ?? []) {
    if (template.is_platform) continue;
    if (!(template.stages ?? []).some((s) => s.approver_group_code === group.code)) continue;
    const branch = rowBranchIds(template.branch);
    if (!branch.length) return [];
    ids.add(branch[0]);
  }
  return [...ids];
}

/** Said when a branch-bound reader opens steps every branch follows. */
export const TEMPLATE_SHARED_NOTE =
  "These are the steps every branch follows, and changing them is for an administrator who covers the whole school. Saving here gives your branch its own steps and leaves every other branch on these.";

/** Said in place of "Use the shared version" on steps the reader does not cover. */
export const TEMPLATE_RESET_READ_ONLY =
  "Switching these steps back changes what every branch follows, so it is for an administrator who covers the whole school.";

/** Why an approver group reads-only, from the branches it decides for. */
export function groupReadOnlySentence(ids: number[]): string {
  return ids.length
    ? "This approver group decides approvals for branches you do not work in, so only an administrator who covers them can change it."
    : "Only a school-wide administrator can change this approver group, because it decides approvals for every branch. You can create a group for your branch.";
}

/** Why the Dynamic Roles read-only for a branch-bound reader. */
export const DYNAMIC_ROLES_READ_ONLY =
  "You can read these Dynamic Roles. They decide approvals for every branch, so changing them is for an administrator who covers the whole school.";
