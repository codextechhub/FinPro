import type { Account } from "@/redux/services/finance/setup-types";

export type AccountTreeNode = Account & { children: AccountTreeNode[]; rolled: number };

export function balanceContribution(
  balance: number,
  accountNormalBalance: string,
  groupNormalBalance: string,
): number {
  return balance * (accountNormalBalance === groupNormalBalance ? 1 : -1);
}

export function buildAccountTree(accounts: Account[]): AccountTreeNode[] {
  const byParent = new Map<number | null, Account[]>();
  for (const account of accounts) {
    const parentId = account.parent_id ?? null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(account);
    byParent.set(parentId, siblings);
  }

  const build = (parentId: number | null): AccountTreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => {
        const children = build(account.id);
        const ownBalance = account.balance?.kobo ?? 0;
        const descendantBalance = children.reduce(
          (total, child) =>
            total + balanceContribution(
              child.rolled,
              child.normal_balance,
              account.normal_balance,
            ),
          0,
        );
        return {
          ...account,
          children,
          rolled: ownBalance + descendantBalance,
        };
      });

  return build(null);
}

export function descendantPostingAccounts(accounts: Account[], rootId: number): Account[] {
  const children = new Map<number, number[]>();
  for (const account of accounts) {
    if (account.parent_id == null) continue;
    const siblings = children.get(account.parent_id) ?? [];
    siblings.push(account.id);
    children.set(account.parent_id, siblings);
  }

  const descendantIds = new Set<number>();
  const pending = [rootId];
  while (pending.length) {
    for (const childId of children.get(pending.pop()!) ?? []) {
      if (descendantIds.has(childId)) continue;
      descendantIds.add(childId);
      pending.push(childId);
    }
  }
  return accounts
    .filter((account) => descendantIds.has(account.id) && account.is_postable)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function accountGroupContribution(account: Account, groupNormalBalance: string): number {
  const balance = account.balance?.kobo ?? 0;
  return balanceContribution(balance, account.normal_balance, groupNormalBalance);
}
