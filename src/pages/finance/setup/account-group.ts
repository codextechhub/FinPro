import type { Account } from "@/redux/services/finance/setup-types";

/**
 * One chart row with its rolled-up balance. `rolled` is null when the figure
 * cannot be stated: the account, or a posting account beneath it, is a bank
 * account whose book balance the role may not read, so a total would silently
 * leave that balance out.
 */
export type AccountTreeNode = Account & { children: AccountTreeNode[]; rolled: number | null };

/**
 * Whether the role may not read this account's balance. The chart is always
 * requested with balances, where an unannotated account carries `null`, so an
 * absent key means the server withheld it (`finance.bankaccount.book_balance`
 * on a bank account's ledger account).
 */
export function isBalanceHidden(account: Account): boolean {
  return account.balance === undefined;
}

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
        const ownBalance = isBalanceHidden(account) ? null : (account.balance?.kobo ?? 0);
        const known = ownBalance !== null && children.every((child) => child.rolled !== null);
        const descendantBalance = children.reduce(
          (total, child) =>
            total + balanceContribution(
              child.rolled ?? 0,
              child.normal_balance,
              account.normal_balance,
            ),
          0,
        );
        return {
          ...account,
          children,
          rolled: known ? (ownBalance as number) + descendantBalance : null,
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

/** What an account adds to its group's balance, or null when its balance is hidden. */
export function accountGroupContribution(account: Account, groupNormalBalance: string): number | null {
  if (isBalanceHidden(account)) return null;
  const balance = account.balance?.kobo ?? 0;
  return balanceContribution(balance, account.normal_balance, groupNormalBalance);
}
