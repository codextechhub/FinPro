/**
 * The expense account a write-off posts to when nobody picks one.
 *
 * It is the school's Bad debt expense mapping, which the backend resolves per
 * ledger entity (an override in Finance Settings, else the chart's default), so
 * no code is written into the screen. The mapping is readable only with the
 * finance settings view key. A reader without it is told the account by name
 * and never by a code that might not be the school's.
 */
import { useCan } from "@/components/finance-ui/can";
import { useGetFinanceAccountSettingsQuery } from "@/redux/services/finance/setup-api";
import type { FinanceAccountMapping } from "@/redux/services/finance/setup-types";
import { P } from "../../../permissions";

/** The mapping key the backend files the write-off expense account under. */
export const BAD_DEBT_MAPPING_KEY = "BAD_DEBT_EXPENSE";

/** What the posting preview calls the debit side of a write-off. */
export const BAD_DEBT_RECAP_NAME = "Bad debt expense";

/** The account a write-off defaults to, as far as this reader may know it. */
export interface DefaultWriteOffAccount {
  code: string;
  name: string;
}

/** The default write-off account from the account mappings, or null when none is known. */
export function defaultWriteOffAccount(mappings: readonly FinanceAccountMapping[] | undefined): DefaultWriteOffAccount | null {
  const account = mappings?.find((m) => m.key === BAD_DEBT_MAPPING_KEY)?.account;
  return account ? { code: account.code, name: account.name } : null;
}

/** The picker's placeholder: the account by name and code when known, else in plain words. */
export function writeOffAccountHint(account: DefaultWriteOffAccount | null): string {
  return account ? `Defaults to ${account.name} (${account.code})` : "Defaults to the school's bad debts account";
}

/** The posting preview's code for the debit line: the picked account, else the default, else blank. */
export function writeOffRecapCode(picked: string, account: DefaultWriteOffAccount | null): string {
  return picked || account?.code || "";
}

/** The default write-off account of one ledger entity; null while unknown or unreadable to this reader. */
export function useDefaultWriteOffAccount(entity: string | null | undefined): DefaultWriteOffAccount | null {
  const { can } = useCan();
  const query = useGetFinanceAccountSettingsQuery(
    { entity: entity ?? "" },
    { skip: !entity || !can(P.FIN_VIEW_SETTINGS) },
  );
  return defaultWriteOffAccount(query.data?.data?.mappings);
}
