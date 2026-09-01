export type AccountDetailTabKey = "activity" | "taccount" | "subs" | "settings";

const POSTABLE_ACCOUNT_TABS: AccountDetailTabKey[] = ["activity", "taccount", "subs", "settings"];
const NON_POSTABLE_ACCOUNT_TABS: AccountDetailTabKey[] = ["subs", "settings"];

export function getAccountDetailTabKeys(isPostable: boolean): AccountDetailTabKey[] {
  return isPostable ? POSTABLE_ACCOUNT_TABS : NON_POSTABLE_ACCOUNT_TABS;
}
