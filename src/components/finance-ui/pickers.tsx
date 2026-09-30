/**
 * Entity-scoped reference pickers for create forms - thin wrappers over the
 * app's SearchSelect that load their options from the matching list endpoint and
 * report the selected CODE (the value the backend resolves by). Reused across
 * every finance create form so account/currency/tax selection is consistent.
 */

import { SearchSelect } from "@/components/custom/search-select";
import { useGetAccountsQuery, useGetTaggedAccountsQuery, useGetCurrenciesQuery, useGetTaxCodesQuery, useGetCostCentersQuery } from "@/redux/services/finance/setup-api";
import { selectableCostCenters } from "./cost-center-usage";
import { useGetTaxObligationsQuery, useGetPettyCashFundsQuery, useGetBankAccountsQuery } from "@/redux/services/finance/ops-api";
import { useGetCustomersQuery } from "@/redux/services/finance/ar-api";
import { useGetVendorsQuery } from "@/redux/services/procurement/procurement-api";
import { toArray } from "@/redux/services/finance/api-types";
import { taxCodeSupportsUsage, type TaxCodeUsage } from "./tax-code-usage";
import { useBranches } from "../../host";

interface PickerProps {
  entity: string;
  value: string;
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
  isRequired?: boolean;
  disabled?: boolean;
}

const adapt = (onChange: (v: string) => void) =>
  (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value);

/** Chart-of-accounts picker. Pass `postableOnly` for posting lines. */
export function AccountPicker({ entity, value, onChange, label, placeholder = "Select account", isRequired, disabled, postableOnly, accountType, activeOnly }: PickerProps & { postableOnly?: boolean; accountType?: string; activeOnly?: boolean }) {
  const { data, isLoading } = useGetAccountsQuery({ entity, ...(postableOnly ? { is_postable: true } : {}), ...(accountType ? { account_type: accountType } : {}) });
  const options = toArray(data?.data)
    .filter((a) => !activeOnly || a.is_active || a.code === value)
    .map((a) => ({ value: a.code, label: `${a.code} · ${a.name}${a.is_active ? "" : " (Inactive)"}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} revealOnSearch />;
}

/**
 * Whether ledger account `account` may receive money for a document of branch
 * `documentBranch`.
 *
 * A receipt is deposited only into a ledger account whose bank account belongs
 * to the receipt's own branch. At a school with several branches a bank-backed
 * account must match exactly (an account whose bank has no branch matches only
 * a document with none); a ledger account no bank account backs, such as cash
 * on hand, is not narrowed. At a school with one branch, or while the
 * document's branch is not known (undefined), every account is offered, and so
 * is every account from a server whose rows do not name their bank.
 */
export function depositAccountFits(
  account: { bank_account_id?: number | null; bank_branch_id?: number | null },
  documentBranch: number | null | undefined,
  multiBranch: boolean,
): boolean {
  if (!multiBranch || documentBranch === undefined || account.bank_account_id == null) return true;
  return (account.bank_branch_id ?? null) === documentBranch;
}

/**
 * The deposit account for a receipt or an invoice payment: a postable asset
 * account, narrowed to those that may receive a document of `documentBranchId`
 * (see `depositAccountFits`). Reports the account code, as AccountPicker does.
 */
export function DepositAccountPicker({ entity, value, onChange, label, placeholder = "Type a bank / cash account…", isRequired, disabled, documentBranchId }: PickerProps & { documentBranchId?: number | null }) {
  const { data, isLoading } = useGetAccountsQuery({ entity, is_postable: true, account_type: "ASSET" });
  const { data: branchRows } = useBranches();
  const accounts = toArray(data?.data);
  const bankBranches = new Set(accounts.map((a) => a.bank_branch_id).filter((b) => b != null));
  const multiBranch = (branchRows?.length ?? 0) > 1 || bankBranches.size > 1;
  const options = accounts
    .filter((a) => depositAccountFits(a, documentBranchId, multiBranch))
    .map((a) => ({ value: a.code, label: `${a.code} · ${a.name}${a.is_active ? "" : " (Inactive)"}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} revealOnSearch />;
}

/** Receivable control account picker - postable ASSET accounts tagged CONTROL
 *  (the AR control accounts a customer posts to), shown as a populated, searchable
 *  list. Sourced from the tagged chart, which computes the CONTROL tag without
 *  the balances, so anyone who may add a customer can read it. */
export function ReceivableAccountPicker({ entity, value, onChange, label, placeholder = "Select receivable account", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetTaggedAccountsQuery({ entity });
  const options = toArray(data?.data)
    .filter((a) => a.account_type === "ASSET" && a.tag === "CONTROL" && a.is_postable)
    .map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

/** The list CustomerPicker reads; `useCustomerBranch` reads the same cache. */
const customerListArgs = (entity: string) => ({ entity, is_active: "true", page_size: 100 });

/**
 * Customer / payer picker. List-backed (grows per entity) → reveal-on-search.
 *
 * `own` lists only the customers the reader may raise a gateway record for:
 * those filed under her branches, or every customer for a whole-school reader.
 * The payments screens pass it, because a branch clerk is refused a virtual
 * account or payment request for a customer every branch shares. A server
 * that does not know `?own=` lists every customer, as before.
 */
export function CustomerPicker({ entity, value, onChange, label, placeholder = "Select customer", isRequired, disabled, own }: PickerProps & { own?: boolean }) {
  const { data, isLoading } = useGetCustomersQuery({ ...customerListArgs(entity), ...(own ? { own: "true" } : {}) });
  const options = toArray(data?.data).map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} revealOnSearch />;
}

/**
 * The branch of the customer CustomerPicker has chosen, by code: a number for
 * a customer filed under a branch, null for one every branch shares, and
 * undefined while it is not known (no customer yet, or a server that does not
 * report a customer's branch). Reads the picker's own list, so it costs no
 * request of its own.
 */
export function useCustomerBranch(entity: string, code: string): number | null | undefined {
  const { data } = useGetCustomersQuery(customerListArgs(entity), { skip: !code });
  if (!code) return undefined;
  return toArray(data?.data).find((c) => c.code === code)?.branch_id;
}

/** Vendor picker - entity's active vendors; reports the vendor code. Used by
 *  payouts (a payout settles a vendor's payable). List-backed → reveal-on-search.
 *  `own` narrows to the vendors the reader may pay out to, as on CustomerPicker. */
export function VendorPicker({ entity, value, onChange, label, placeholder = "Select vendor", isRequired, disabled, own }: PickerProps & { own?: boolean }) {
  const { data, isLoading } = useGetVendorsQuery({ entity, page_size: 100, ...(own ? { own: true } : {}) });
  const options = toArray(data?.data)
    .filter((v) => v.is_active)
    .map((v) => ({ value: v.code, label: `${v.code} - ${v.name}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} revealOnSearch />;
}

export function CurrencyPicker({ value, onChange, label, placeholder = "Default", isRequired, disabled }: Omit<PickerProps, "entity">) {
  const { data, isLoading } = useGetCurrenciesQuery();
  const options = toArray(data?.data).map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

export function TaxCodePicker({ entity, value, onChange, label, placeholder = "No tax", isRequired, disabled, usage = "any" }: PickerProps & { usage?: TaxCodeUsage }) {
  const { data, isLoading } = useGetTaxCodesQuery({ entity });
  const options = toArray(data?.data)
    .filter((t) => t.code === value || taxCodeSupportsUsage(t, usage))
    .map((t) => ({ value: t.code, label: `${t.code} - ${t.name}${t.is_active ? "" : " (Inactive)"}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

export function CostCenterPicker({ entity, value, onChange, label, placeholder = "None", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetCostCentersQuery({ entity });
  const options = selectableCostCenters(toArray(data?.data), value).map((c) => ({
    value: c.code,
    label: `${c.code} - ${c.name}${c.is_active ? "" : " (Inactive)"}`,
  }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

export function TaxObligationPicker({ entity, value, onChange, label, placeholder = "Select obligation", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetTaxObligationsQuery({ entity });
  const options = toArray(data?.data).map((o) => ({ value: String(o.id), label: `${o.code} - ${o.name}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

export function PettyCashFundPicker({ entity, value, onChange, label, placeholder = "Select fund", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetPettyCashFundsQuery({ entity, page: 1 });
  const options = toArray(data?.data).map((f) => ({ value: String(f.id), label: f.name }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

/**
 * Whether bank account `account` may pay documents of every branch in
 * `documentBranches`.
 *
 * A document is paid only from an account of its own branch: "This refund
 * belongs to Lekki Branch. Pay it from a Lekki Branch account." At a school
 * with several branches that is an exact match, and a row not yet given a
 * branch (an account or a document from before rows carried one) matches only
 * another such row. At a school with one branch every row is that branch's, so
 * every account pays every document. An empty `documentBranches` means the
 * document's branch is not known yet, and every account is offered.
 */
export function bankAccountPays(
  account: { branch_id?: number | null },
  documentBranches: (number | null)[],
  multiBranch: boolean,
): boolean {
  if (!multiBranch) return true;
  return documentBranches.every((b) => (account.branch_id ?? null) === b);
}

/**
 * Bank account picker - entity's named bank accounts; reports the account id.
 *
 * `documentBranchId` is the branch of the document being paid, and only the
 * accounts that may pay it are offered (see `bankAccountPays`), so nobody picks
 * an account only to be refused. Null is a document not yet given a branch;
 * absent (undefined) is a document whose branch is not known yet.
 *
 * `documentBranchIds` is the same rule for one account shared by several
 * documents, as a batch of refunds is: an account is offered only when every
 * document may use it. Undefined entries are ignored.
 *
 * Whether the school runs several branches is read from the app's branch list,
 * and also from the accounts themselves: accounts filed under two different
 * branches prove it even where the branch list cannot be read.
 */
export function BankAccountPicker({ entity, value, onChange, label, placeholder = "Select bank account", isRequired, disabled, documentBranchId, documentBranchIds }: PickerProps & { documentBranchId?: number | null; documentBranchIds?: (number | null | undefined)[] }) {
  const { data, isLoading } = useGetBankAccountsQuery({ entity, page: 1 });
  const { data: branchRows } = useBranches();
  const accounts = toArray(data?.data).filter((a) => a.is_active);
  const accountBranches = new Set(accounts.map((a) => a.branch_id).filter((b) => b != null));
  const multiBranch = (branchRows?.length ?? 0) > 1 || accountBranches.size > 1;
  const documents = [documentBranchId, ...(documentBranchIds ?? [])].filter((b): b is number | null => b !== undefined);
  const options = accounts
    .filter((a) => bankAccountPays(a, documents, multiBranch))
    .map((a) => ({ value: String(a.id), label: a.bank_name ? `${a.name} · ${a.bank_name}` : a.name }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}
