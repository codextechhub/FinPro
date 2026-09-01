// Entity-scoped reference pickers for create forms - thin wrappers over the
// app's SearchSelect that load their options from the matching list endpoint and
// report the selected CODE (the value the backend resolves by). Reused across
// every finance create form so account/currency/tax selection is consistent.

import { SearchSelect } from "@/components/custom/search-select";
import { useGetAccountsQuery, useGetChartOfAccountsQuery, useGetCurrenciesQuery, useGetTaxCodesQuery, useGetCostCentersQuery } from "@/redux/services/finance/setup-api";
import { useGetTaxObligationsQuery, useGetPettyCashFundsQuery, useGetBankAccountsQuery } from "@/redux/services/finance/ops-api";
import { useGetCustomersQuery } from "@/redux/services/finance/ar-api";
import { useGetVendorsQuery } from "@/redux/services/procurement/procurement-api";
import { toArray } from "@/redux/services/finance/api-types";
import { taxCodeSupportsUsage, type TaxCodeUsage } from "./tax-code-usage";

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

/** Receivable control account picker - postable ASSET accounts tagged CONTROL
 *  (the AR control accounts a customer posts to), shown as a populated, searchable
 *  list. Sourced from the chart endpoint, which is what computes the CONTROL tag. */
export function ReceivableAccountPicker({ entity, value, onChange, label, placeholder = "Select receivable account", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetChartOfAccountsQuery({ entity });
  const options = toArray(data?.data)
    .filter((a) => a.account_type === "ASSET" && a.tag === "CONTROL" && a.is_postable)
    .map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}

/** Customer / payer picker. List-backed (grows per entity) → reveal-on-search. */
export function CustomerPicker({ entity, value, onChange, label, placeholder = "Select customer", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetCustomersQuery({ entity, is_active: "true", page_size: 100 });
  const options = toArray(data?.data).map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} revealOnSearch />;
}

/** Vendor picker - entity's active vendors; reports the vendor code. Used by
 *  payouts (a payout settles a vendor's payable). List-backed → reveal-on-search. */
export function VendorPicker({ entity, value, onChange, label, placeholder = "Select vendor", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetVendorsQuery({ entity, page_size: 100 });
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
  const options = toArray(data?.data).map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }));
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

/** Bank account picker - entity's named bank accounts; reports the account id. */
export function BankAccountPicker({ entity, value, onChange, label, placeholder = "Select bank account", isRequired, disabled }: PickerProps) {
  const { data, isLoading } = useGetBankAccountsQuery({ entity, page: 1 });
  const options = toArray(data?.data)
    .filter((a) => a.is_active)
    .map((a) => ({ value: String(a.id), label: a.bank_name ? `${a.name} · ${a.bank_name}` : a.name }));
  return <SearchSelect label={label} options={options} value={value} onChange={adapt(onChange)} loading={isLoading} placeholder={placeholder} isRequired={isRequired} disabled={disabled} />;
}
