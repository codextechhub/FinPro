/**
 * The expense account a write-off posts to when nobody picks one.
 *
 * The write-offs list carries it as `default_write_off_account`: the school's
 * Bad debt expense mapping as the server resolves it for the ledger entity, so
 * no code is written into the screen. The server sends it only to a holder of
 * the write-off create key, and null when the entity has no usable account. A
 * reader who is not sent one is told the account by name and never by a code
 * that might not be the school's.
 */
import { useCan } from "@/components/finance-ui/can";
import { useGetWriteOffRequestsQuery, type WriteOffList } from "@/redux/services/finance/ar-api";
import { P } from "../../../permissions";

/** What the posting preview calls the debit side of a write-off. */
export const BAD_DEBT_RECAP_NAME = "Bad debt expense";

/** The account a write-off defaults to, as far as this reader may know it. */
export interface DefaultWriteOffAccount {
  code: string;
  name: string;
}

/** The default write-off account a list response names, or null when it names none. */
export function defaultWriteOffAccount(list: Pick<WriteOffList, "default_write_off_account"> | undefined): DefaultWriteOffAccount | null {
  const account = list?.default_write_off_account;
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

/** The default write-off account of one ledger entity; null while unknown or not sent to this reader. */
export function useDefaultWriteOffAccount(entity: string | null | undefined): DefaultWriteOffAccount | null {
  const { can } = useCan();
  const query = useGetWriteOffRequestsQuery(
    { entity: entity ?? "", page: 1 },
    { skip: !entity || !can(P.FIN_CREATE_WRITE_OFF) },
  );
  return defaultWriteOffAccount(query.data);
}
