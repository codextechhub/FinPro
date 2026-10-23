import type { Account } from "@/redux/services/finance/setup-types";
import type { AccountTreeNode } from "./account-group";

/**
 * Whether the chart can be split into everyday accounts and the accounts the
 * software keeps. The server leaves `managed_by` off every row when the role
 * may not read the classification, and the chart is then one plain tree. A key
 * present with `null` is an everyday account, so `undefined` alone means
 * "unclassified".
 */
export function hasManagedSplit(accounts: readonly Account[]): boolean {
  return accounts.some((account) => account.managed_by !== undefined);
}

/**
 * The ids that belong in the main tree and the ids folded under "Managed by the
 * system".
 *
 * An everyday account is one the server calls `managed_by: null`. Every
 * ancestor of an everyday account stays with it, even a system-kept header, so
 * the tree never loses the group an everyday account hangs from. Everything
 * else is the system's.
 */
export function partitionChart(accounts: readonly Account[]): { everyday: Set<number>; system: Set<number> } {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const everyday = new Set<number>();
  for (const account of accounts) {
    if (account.managed_by != null) continue;
    let current: Account | undefined = account;
    while (current && !everyday.has(current.id)) {
      everyday.add(current.id);
      current = current.parent_id == null ? undefined : byId.get(current.parent_id);
    }
  }
  const system = new Set(accounts.filter((account) => !everyday.has(account.id)).map((account) => account.id));
  return { everyday, system };
}

/**
 * The tree restricted to the kept ids. A node that is not kept is dropped and
 * its kept descendants take its place, so a system account under an everyday
 * header becomes a root of the system list rather than vanishing. Balances roll
 * up from the full tree, so a header keeps the total of everything beneath it.
 */
export function pruneTree(nodes: readonly AccountTreeNode[], keep: ReadonlySet<number>): AccountTreeNode[] {
  const out: AccountTreeNode[] = [];
  for (const node of nodes) {
    const children = pruneTree(node.children, keep);
    if (keep.has(node.id)) out.push({ ...node, children });
    else out.push(...children);
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
