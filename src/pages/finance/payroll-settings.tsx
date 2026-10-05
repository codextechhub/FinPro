/**
 * Finance Settings, Payroll: how a set of books works out and delivers pay.
 *
 * PAYE is worked out from the national tax table or supplied by the school;
 * each statutory deduction and employer contribution can be switched off or
 * re-rated; payslips can go in the app, by email, or both; and two settings
 * say how earlier pay is handled. "Earlier pay required" refuses a run that
 * would pay somebody who joined after January with nothing recorded, rather
 * than listing them as a warning. "Payroll moved here on" says when the
 * school's payroll moved onto these books, so its staff first paid that month
 * are its own staff carried over and not mistaken for joiners.
 *
 * Every change takes effect on the next run generated; runs already raised
 * keep the figures they were worked out with. The policy binds every branch,
 * so only somebody who covers the whole school may change it; anyone else
 * reads it. The kinds of voluntary deduction (a staff loan, cooperative
 * savings) are set up here too, each with the account it is owed to.
 */

import { useMemo, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { usePermissions } from "@/hooks/use-permissions";
import {
  PolicyBadge, SettingsAuditHistory, SettingsConsumer, SettingsPanel, SettingsRow, SettingsSectionHeader,
} from "@/components/settings/settings-layout";
import { AccountPicker, toArray } from "@/components/finance-ui";
import { P } from "../../permissions";
import { useReaderReach } from "../../host";
import {
  useCreatePayrollDeductionTypeMutation, useGetFinancePayrollSettingsQuery, useGetPayrollDeductionTypesQuery,
  useUpdateFinancePayrollSettingsMutation, useUpdatePayrollDeductionTypeMutation,
} from "@/redux/services/finance/payroll-api";
import type { FinancePayrollSettingsBody, FinancePayrollSettingsValues, PayeMethod } from "@/redux/services/finance/payroll-types";
import type { SettingConsumer } from "@/redux/services/finance/setup-types";

/** The statutory items, each a switch and a rate. */
export const STATUTORY_ITEMS = [
  { key: "employee_pension", label: "Employee pension", basis: "of pensionable pay, deducted from the employee" },
  { key: "employer_pension", label: "Employer pension", basis: "of pensionable pay, paid by the school on top" },
  { key: "nhf", label: "National Housing Fund (NHF)", basis: "of basic pay, deducted from the employee" },
  { key: "nsitf", label: "NSITF employee compensation", basis: "of gross pay, paid by the school on top" },
  { key: "itf", label: "ITF training levy", basis: "of gross pay, paid by the school on top" },
] as const;
type ItemKey = (typeof STATUTORY_ITEMS)[number]["key"];

/** A rate typed as a percentage, as basis points; null when it is not a rate from 0 to 100. */
export function percentToBps(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

/** The settings that differ from what is saved, ready to send. */
export function payrollSettingsChanges(saved: FinancePayrollSettingsValues, draft: FinancePayrollSettingsBody): FinancePayrollSettingsBody {
  return Object.fromEntries(
    Object.entries(draft).filter(([key, value]) => value !== (saved as unknown as Record<string, unknown>)[key]),
  ) as FinancePayrollSettingsBody;
}

export function PayrollSettingsPanel({ entityCode }: { entityCode: string | null }) {
  const { hasPermission } = usePermissions();
  const { wholeSchool } = useReaderReach();
  const canView = hasPermission(P.FIN_VIEW_SETTINGS);
  const canUpdate = hasPermission(P.FIN_UPDATE_SETTINGS) && wholeSchool;
  const query = useGetFinancePayrollSettingsQuery({ entity: entityCode! }, { skip: !entityCode || !canView });
  const payload = query.data?.data;
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Payroll" description="How PAYE and the statutory deductions are worked out, how payslips reach staff, and how earlier pay is handled." />
      {!canView ? (
        <SettingsPanel><SettingsRow icon={ShieldCheck} label="Finance settings are protected" description="You need Finance settings view permission to read the payroll policy." badge={<PolicyBadge kind="enforced">Permission required</PolicyBadge>} /></SettingsPanel>
      ) : query.isLoading || !payload ? (
        <SettingsPanel><SettingsRow label="Loading the payroll policy" description="Reading the selected entity's payroll settings." /></SettingsPanel>
      ) : (
        <PayrollSettingsForm key={`${entityCode}-${payload.settings.updated_at}`} entityCode={entityCode!} values={payload.settings} consumers={payload.consumers}
          canUpdate={canUpdate} readOnlyReason={hasPermission(P.FIN_UPDATE_SETTINGS) && !wholeSchool ? "The payroll policy binds every branch, so only someone who covers the whole school may change it." : null} />
      )}
      {canView && entityCode ? <DeductionTypesPanel entityCode={entityCode} /> : null}
      {payload ? <SettingsAuditHistory rows={payload.history} /> : null}
    </div>
  );
}

export function PayrollSettingsForm({ entityCode, values, consumers, canUpdate, readOnlyReason }: {
  entityCode: string;
  values: FinancePayrollSettingsValues;
  consumers: Record<string, SettingConsumer>;
  canUpdate: boolean;
  readOnlyReason: string | null;
}) {
  const [method, setMethod] = useState<PayeMethod>(values.paye_method);
  const [enabled, setEnabled] = useState<Record<ItemKey, boolean>>(() => Object.fromEntries(
    STATUTORY_ITEMS.map(({ key }) => [key, values[`${key}_enabled` as const]]),
  ) as Record<ItemKey, boolean>);
  const [rates, setRates] = useState<Record<ItemKey, string>>(() => Object.fromEntries(
    STATUTORY_ITEMS.map(({ key }) => [key, String(values[`${key}_rate_bps` as const] / 100)]),
  ) as Record<ItemKey, string>);
  const [inApp, setInApp] = useState(values.payslip_in_app);
  const [email, setEmail] = useState(values.payslip_email);
  const [required, setRequired] = useState(values.previous_pay_required);
  const [movedOn, setMovedOn] = useState(values.payroll_moved_here_on ?? "");
  const [update, state] = useUpdateFinancePayrollSettingsMutation();

  const bps = Object.fromEntries(STATUTORY_ITEMS.map(({ key }) => [key, percentToBps(rates[key])])) as Record<ItemKey, number | null>;
  const valid = Object.values(bps).every((value) => value !== null);
  const draft: FinancePayrollSettingsBody = {
    paye_method: method,
    payslip_in_app: inApp,
    payslip_email: email,
    previous_pay_required: required,
    payroll_moved_here_on: movedOn || null,
  };
  for (const { key } of STATUTORY_ITEMS) {
    draft[`${key}_enabled`] = enabled[key];
    if (bps[key] !== null) draft[`${key}_rate_bps`] = bps[key]!;
  }
  const changes = payrollSettingsChanges(values, draft);
  const dirty = valid && Object.keys(changes).length > 0;

  const save = async () => {
    try {
      const response = await update({ entity: entityCode, ...changes }).unwrap();
      toast.success(response.message || "Payroll settings saved.");
    } catch { /* central */ }
  };

  return (
    <>
      <SettingsPanel title="PAYE" description="Worked out from the national tax table for the payroll month's year, cumulatively, so the year's tax comes out right. Or supplied: taken from each person's salary structure or roster figures.">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="font-mont text-sm font-medium text-gray-01">Where PAYE comes from</p>
            <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">{`Tax tables for ${values.tax_country}. A person's PAYE can still be set by hand on their salary record, with a reason.`}</p>
            <SettingsConsumer consumer={consumers.paye_method} />
          </div>
          <select aria-label="Where PAYE comes from" value={method} disabled={!canUpdate} onChange={(event) => setMethod(event.target.value as PayeMethod)}
            className="h-10 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm disabled:bg-gray-02 sm:w-64">
            <option value="COMPUTED">Computed from the tax table</option>
            <option value="SUPPLIED">Supplied by the school</option>
          </select>
        </div>
      </SettingsPanel>

      <SettingsPanel title="Deductions and contributions" description="Switch each one off, or change its rate. The employer's contributions are booked to each branch's own accounts.">
        {STATUTORY_ITEMS.map(({ key, label, basis }) => (
          <div key={key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="font-mont text-sm font-medium text-gray-01">{label}</p>
              <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">{`${rates[key] || "0"}% ${basis}.`}</p>
              <SettingsConsumer consumer={consumers[`${key}_rate_bps`]} />
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-28">
                <Input aria-label={`${label} rate`} type="number" min="0" max="100" step="0.01" value={rates[key]} disabled={!canUpdate || !enabled[key]}
                  onChange={(event) => setRates((current) => ({ ...current, [key]: event.target.value }))} className="bg-white pr-7" />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mont text-xs text-gray-05">%</span>
              </div>
              <Switch aria-label={label} checked={enabled[key]} disabled={!canUpdate} onCheckedChange={(checked) => setEnabled((current) => ({ ...current, [key]: checked }))} />
            </div>
          </div>
        ))}
      </SettingsPanel>

      <SettingsPanel title="Payslips" description="A payslip is issued to each person when their run is paid.">
        <SwitchRow label="Show payslips in the app" description="Staff read their own payslips under My payslips and get an in-app notice." checked={inApp} onChange={setInApp} disabled={!canUpdate} consumer={consumers.payslip_in_app} />
        <SwitchRow label="Email payslips" description="Each person is emailed their payslip as a PDF." checked={email} onChange={setEmail} disabled={!canUpdate} consumer={consumers.payslip_email} />
      </SettingsPanel>

      <SettingsPanel title="Earlier pay" description="PAYE counts the whole tax year. Somebody who joined after January brings their earlier pay with them, recorded on their salary record.">
        <SwitchRow label="Earlier pay required" description="On: a run is refused while anyone on it joined after January with nothing recorded. Off: they are listed as a warning and paid as though they earned nothing before." checked={required} onChange={setRequired} disabled={!canUpdate} consumer={consumers.previous_pay_required} />
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="font-mont text-sm font-medium text-gray-01">Payroll moved here on</p>
            <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">Only for a school whose payroll ran elsewhere earlier in the year. Staff first paid here in that month are its own staff, not joiners: record their earlier months as this school&apos;s own.</p>
            <SettingsConsumer consumer={consumers.payroll_moved_here_on} />
          </div>
          <div className="flex items-center gap-2">
            <DatePickerInput aria-label="Payroll moved here on" value={movedOn} disabled={!canUpdate} onChange={(event) => setMovedOn(event.target.value)} />
            {movedOn && canUpdate ? <Button variant="outline" size="sm" onClick={() => setMovedOn("")}>Clear</Button> : null}
          </div>
        </div>
      </SettingsPanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mont text-xs text-gray-05">{!valid ? "Use a rate from 0 to 100%." : readOnlyReason ?? (canUpdate ? "Changes apply from the next run generated." : "You have read-only access.")}</p>
        <Button onClick={save} disabled={!canUpdate || !dirty || state.isLoading}><Save className="mr-2 size-4" />{state.isLoading ? "Saving" : "Save payroll settings"}</Button>
      </div>
    </>
  );
}

function SwitchRow({ label, description, checked, onChange, disabled, consumer }: {
  label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; disabled: boolean; consumer?: SettingConsumer;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="font-mont text-sm font-medium text-gray-01">{label}</p>
        <p className="mt-0.5 font-mont text-xs leading-5 text-gray-05">{description}</p>
        <SettingsConsumer consumer={consumer} />
      </div>
      <Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * The kinds of voluntary deduction a person's pay can carry, each owed to its
 * own account: a liability for money owed on (cooperative savings), or the
 * receivable a staff loan was booked to. Shared configuration of the books, so
 * only somebody who covers the whole school adds or retires one.
 */
export function DeductionTypesPanel({ entityCode }: { entityCode: string }) {
  const { hasPermission } = usePermissions();
  const { wholeSchool } = useReaderReach();
  const { data, isLoading } = useGetPayrollDeductionTypesQuery({ entity: entityCode }, { skip: !hasPermission(P.FIN_VIEW_SALARIES) });
  const types = useMemo(() => toArray(data?.data), [data]);
  const canCreate = hasPermission(P.FIN_CREATE_SALARY) && wholeSchool;
  const canUpdate = hasPermission(P.FIN_UPDATE_SALARY) && wholeSchool;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [create, creating] = useCreatePayrollDeductionTypeMutation();
  const [update] = useUpdatePayrollDeductionTypeMutation();

  if (!hasPermission(P.FIN_VIEW_SALARIES)) return null;
  const add = async () => {
    try {
      const res = await create({ entity: entityCode, code: code.trim(), name: name.trim(), liability_account: account }).unwrap();
      toast.success(res.message || "Deduction type added.");
      setCode(""); setName(""); setAccount("");
    } catch { /* central */ }
  };
  const toggle = async (id: number, active: boolean) => {
    try { const res = await update({ entity: entityCode, id, is_active: active }).unwrap(); toast.success(res.message || "Deduction type updated."); }
    catch { /* central */ }
  };

  return (
    <SettingsPanel title="Voluntary deductions" description="Kinds of deduction staff can have taken from pay, such as a staff loan or cooperative savings. Each person's own amount is set on their salary record.">
      {isLoading ? <SettingsRow label="Loading deduction types" description="Reading this entity's deduction types." />
        : !types.length ? <SettingsRow label="None set up" description="Add a kind below to offer it on salary records." />
        : types.map((type) => (
          <div key={type.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="font-mont text-sm font-medium text-gray-01">{type.name} <span className="font-normal text-gray-05">· {type.code}</span></p>
              <p className="mt-0.5 font-mont text-xs text-gray-05">{`Owed to account ${type.liability_account}`}</p>
            </div>
            <Switch aria-label={`${type.name} in use`} checked={type.is_active} disabled={!canUpdate} onCheckedChange={(checked) => toggle(type.id, checked)} />
          </div>
        ))}
      {canCreate ? (
        <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end sm:px-5">
          <label className="font-mont text-xs text-gray-05">Code<Input className="mt-1 bg-white" maxLength={24} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="LOAN" /></label>
          <label className="font-mont text-xs text-gray-05">Name<Input className="mt-1 bg-white" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Staff loan" /></label>
          <div className="min-w-0 font-mont text-xs text-gray-05">Owed to<div className="mt-1"><AccountPicker entity={entityCode} value={account} onChange={setAccount} postableOnly placeholder="Liability or loan account" /></div></div>
          <Button onClick={add} disabled={creating.isLoading || !code.trim() || !name.trim() || !account}>Add</Button>
        </div>
      ) : null}
    </SettingsPanel>
  );
}
