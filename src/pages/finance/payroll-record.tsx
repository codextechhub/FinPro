/**
 * One person's salary record, opened from the roster: their pay history, their
 * pay brought forward into the tax year, their voluntary deductions and their
 * tax year so far.
 *
 * Everything here is reached through the record, so it follows the record's
 * branch: the branch paying the person today reads it, and a move dated ahead
 * hands it over on its date. Every figure follows the reader's Field Access on
 * `finance.salary`: a hidden figure has no column and no field, and a figure
 * they may read but not change is greyed and never sent.
 *
 * Pay brought forward ("Earlier pay") is how PAYE counts the whole tax year
 * for somebody whose earlier months were not paid through this payroll. One
 * record of each kind a year: a previous employer's months, or this school's
 * own months before its payroll ran here. A record of zeros says there was no
 * previous employer, which takes the person off the "earlier pay still to
 * record" list. A correction reaches the next run, never a posted one, and is
 * refused while a draft run still holds the person; the refusal says to void
 * that draft and raise it again.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Download, Pencil, Plus, Trash2, Ban } from "lucide-react";
import { routesPath } from "@/routes/routes-path";
import {
  AccessField, ConfirmActionModal, DetailDrawer, FormField, MoneyInput, TabStrip,
  fieldWriteErrors, toArray, useFieldAccess,
  type FieldAccess, type FieldErrors, type TabStripItem,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import { useDates } from "../../lib/display-prefs";
import { openSalaryTaxSummary } from "../../utils/payroll-documents";
import { fieldRefusals } from "./payroll-refusals";
import {
  useCreateEmployeeDeductionMutation, useCreatePayBroughtForwardMutation, useDeletePayBroughtForwardMutation,
  useGetEmployeeDeductionsQuery, useGetPayBroughtForwardQuery, useGetPayrollDeductionTypesQuery,
  useGetSalaryHistoryQuery, useGetSalaryTaxSummaryQuery, useStopEmployeeDeductionMutation,
  useUpdateEmployeeDeductionMutation, useUpdatePayBroughtForwardMutation,
} from "@/redux/services/finance/payroll-api";
import type { EmployeeSalary } from "@/redux/services/finance/ops-types";
import type {
  EmployeeDeduction, PayBroughtForward, PayBroughtForwardBody, PayBroughtForwardSource, SalaryVersion, TaxSummary, TaxSummaryEarlier,
} from "@/redux/services/finance/payroll-types";

const SALARY = "finance.salary";
const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

type Section = "history" | "earlier" | "deductions" | "tax";
const SECTIONS: TabStripItem<Section>[] = [
  { value: "history", label: "Pay history" },
  { value: "earlier", label: "Earlier pay" },
  { value: "deductions", label: "Deductions" },
  { value: "tax", label: "Tax year" },
];

/** The figures of pay brought forward, in the order a form asks for them. */
export const EARLIER_FIGURES = [
  ["brought_forward_gross_amount", "Gross pay"],
  ["brought_forward_taxable_pay", "Taxable pay (before reliefs)"],
  ["brought_forward_paye_amount", "PAYE deducted"],
  ["brought_forward_pension_amount", "Pension"],
  ["brought_forward_nhf_amount", "NHF"],
] as const;
type EarlierFigure = (typeof EARLIER_FIGURES)[number][0];

export const SOURCE_LABEL: Record<PayBroughtForwardSource, string> = {
  PREVIOUS_EMPLOYER: "A previous employer",
  THIS_EMPLOYER: "Earlier months at this school",
};

/**
 * The versions whose terms start after `today`: a move or a raise entered in
 * advance, which changes nothing until its day.
 */
export function pendingVersions(versions: SalaryVersion[], today: string): SalaryVersion[] {
  return versions.filter((version) => version.effective_from > today);
}

/**
 * The body that corrects a record of earlier pay: only the values that changed,
 * and only those the reader may change. A figure the reader may not read is
 * absent from the record and is never sent.
 */
export function earlierPayChanges(
  record: PayBroughtForward,
  values: Record<EarlierFigure, number> & { employer_name: string; evidence_reference: string },
  access: Pick<FieldAccess, "writableOnly">,
): PayBroughtForwardBody {
  const changed: Record<string, unknown> = {};
  for (const [name] of EARLIER_FIGURES) {
    if (name in record && values[name] !== (record[name] ?? 0)) changed[name] = values[name];
  }
  if (values.employer_name.trim() !== record.employer_name) changed.employer_name = values.employer_name.trim();
  if (values.evidence_reference.trim() !== record.evidence_reference) changed.evidence_reference = values.evidence_reference.trim();
  return access.writableOnly(changed, { creating: false }) as PayBroughtForwardBody;
}

/** Whether a record says "no earlier pay": every figure the reader sees is zero and no employer is named. */
export function isNilRecord(record: PayBroughtForward): boolean {
  return !record.employer_name && EARLIER_FIGURES.every(([name]) => !record[name]);
}

export function SalaryRecordDrawer({ salary, entity, currency, multiBranch, canPrintSummary, onClose, onEdit }: {
  salary: EmployeeSalary | null;
  entity: string;
  currency?: string | null;
  /** True when the school runs more than one branch, so a branch is worth naming. */
  multiBranch: boolean;
  /** Whether the reader may read every figure a tax summary prints. */
  canPrintSummary: boolean;
  onClose: () => void;
  onEdit?: (salary: EmployeeSalary) => void;
}) {
  const [section, setSection] = useState<Section>("history");
  if (!salary) return null;
  return (
    <DetailDrawer open onOpenChange={(open) => (open ? undefined : onClose())}
      title={salary.name}
      description={[multiBranch ? salary.branch_name ?? "No branch yet" : null, salary.structure_name ?? "Flat pay", salary.is_active ? "Active" : "Inactive"].filter(Boolean).join(" · ")}
      widthClass="sm:max-w-3xl"
      footer={<>
        <div className="flex-1" />
        <Button variant="outline" onClick={onClose}>Close</Button>
        {onEdit ? <Button onClick={() => onEdit(salary)} className="gap-1.5"><Pencil className="size-4" /> Edit</Button> : null}
      </>}>
      <div className="space-y-4">
        <TabStrip items={SECTIONS} value={section} onChange={setSection} variant="underline" ariaLabel="Salary record sections" className="w-full gap-1" buttonClassName="px-3 py-2 font-semibold" />
        {section === "history" ? <HistoryPanel salary={salary} entity={entity} currency={currency} multiBranch={multiBranch} /> : null}
        {section === "earlier" ? <EarlierPayPanel salary={salary} entity={entity} currency={currency} /> : null}
        {section === "deductions" ? <DeductionsPanel salary={salary} entity={entity} currency={currency} /> : null}
        {section === "tax" ? <TaxYearPanel salary={salary} entity={entity} currency={currency} allowed={canPrintSummary} /> : null}
      </div>
    </DetailDrawer>
  );
}

// ── Pay history ─────────────────────────────────────────────────────────────

/**
 * Every version of the person's pay terms with the day it took effect and who
 * entered it, newest first. A version dated ahead is marked "From <date>" and a
 * note above says what will change on that day, so a move entered in July for
 * September reads as still to come.
 */
export function HistoryPanel({ salary, entity, currency, multiBranch }: { salary: EmployeeSalary; entity: string; currency?: string | null; multiBranch: boolean }) {
  const dates = useDates();
  const access = useFieldAccess(SALARY);
  const { data, isLoading, isError } = useGetSalaryHistoryQuery({ entity, salaryId: salary.id });
  const versions = useMemo(() => [...toArray(data?.data)].reverse(), [data]);
  const today = dates.today();
  const pending = pendingVersions(versions, today);
  const figures = ([["gross_amount", "Gross"], ["paye_amount", "PAYE"], ["pension_amount", "Pension"]] as const)
    .filter(([name]) => !access.isHidden(name));

  if (isLoading) return <p className="font-mont text-xs text-gray-05">Loading pay history…</p>;
  if (isError) return <p className="font-mont text-xs text-gray-05">Pay history could not be read.</p>;
  if (!versions.length) {
    return <p className="font-mont text-xs text-gray-05">No changes yet. Each change to pay, branch or structure is kept here with the day it takes effect.</p>;
  }
  const previousBranch = (index: number) => versions[index + 1]?.branch_id;
  return (
    <div className="space-y-3">
      {pending.map((version) => {
        const moves = multiBranch && version.branch_id !== salary.branch_id && version.branch_name;
        return (
          <p key={version.id} role="note" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-mont text-xs leading-5 text-blue-900">
            {moves
              ? `Moves to ${version.branch_name} on ${dates.day(version.effective_from)}. Until then ${salary.branch_name ?? "their current branch"} pays them and reads this record.`
              : `New terms take effect on ${dates.day(version.effective_from)}.`}
          </p>
        );
      })}
      <div className="overflow-x-auto rounded-md border border-white-02">
        <table className="w-full min-w-[560px] border-collapse">
          <thead><tr>
            <th className={th}>From</th>
            {multiBranch ? <th className={th}>Branch</th> : null}
            <th className={th}>Structure</th>
            {figures.map(([name, label]) => <th key={name} className={cn(th, "text-right")}>{label}</th>)}
            <th className={th}>Changed by</th>
          </tr></thead>
          <tbody>
            {versions.map((version, index) => (
              <tr key={version.id}>
                <td className={td}>
                  <span className="tabular-nums">{version.effective_from <= "1900-01-01" ? "The start" : dates.day(version.effective_from)}</span>
                  {version.effective_from > today ? <span className={cn(PILL, "ml-1.5 bg-blue-50 text-blue-700")}>Ahead</span> : null}
                  {version.reason ? <span className="block text-[11px] text-gray-05">{version.reason}</span> : null}
                </td>
                {multiBranch ? (
                  <td className={cn(td, version.branch_id !== previousBranch(index) && index < versions.length - 1 && "font-semibold")}>{version.branch_name ?? "No branch"}</td>
                ) : null}
                <td className={cn(td, "text-gray-05")}>{version.structure_name ?? "Flat"}</td>
                {figures.map(([name]) => <td key={name} className={cn(td, "text-right tabular-nums")}>{formatMoney(version[name] ?? 0, currency)}</td>)}
                <td className={cn(td, "text-gray-05")}>
                  {version.created_by ?? "-"}
                  {version.created_at ? <span className="block text-[11px]">{dates.dateTime(version.created_at)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Earlier pay (pay brought forward) ────────────────────────────────────────

export function EarlierPayPanel({ salary, entity, currency }: { salary: EmployeeSalary; entity: string; currency?: string | null }) {
  const { can } = useCan();
  const access = useFieldAccess(SALARY);
  const { data, isLoading, isError } = useGetPayBroughtForwardQuery({ entity, salaryId: salary.id });
  const records = useMemo(() => toArray(data?.data), [data]);
  const [editing, setEditing] = useState<PayBroughtForward | "new" | null>(null);
  const [removing, setRemoving] = useState<PayBroughtForward | null>(null);
  const [remove, { isLoading: removingBusy }] = useDeletePayBroughtForwardMutation();
  const shown = EARLIER_FIGURES.filter(([name]) => !access.isHidden(name));

  const doRemove = async () => {
    if (!removing) return;
    try { const res = await remove({ entity, id: removing.id }).unwrap(); toast.success(res.message || "Earlier pay removed."); setRemoving(null); }
    catch { /* central */ }
  };

  if (editing) {
    return <EarlierPayForm salary={salary} entity={entity} currency={currency} record={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;
  }
  return (
    <div className="space-y-3">
      <p className="font-mont text-xs leading-5 text-gray-05">
        Pay from earlier in the tax year that was not paid through this payroll. PAYE counts it, so the year&apos;s tax comes out right: a previous employer&apos;s months for somebody who joined during the year, or this school&apos;s own months from before its payroll ran here. Record zeros for somebody with no previous employer.
      </p>
      {can(P.FIN_CREATE_SALARY) ? (
        <div className="flex justify-end"><Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> Record earlier pay</Button></div>
      ) : null}
      {isLoading ? <p className="font-mont text-xs text-gray-05">Loading earlier pay…</p>
        : isError ? <p className="font-mont text-xs text-gray-05">Earlier pay could not be read.</p>
        : !records.length ? <p className="rounded-md border border-dashed border-white-02 px-3 py-4 text-center font-mont text-xs text-gray-05">Nothing recorded.</p>
        : (
          <div className="space-y-2">
            {records.map((record) => (
              <div key={record.id} className="rounded-md border border-white-02 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mont text-sm font-semibold text-gray-01">
                      {record.tax_year} · {record.source === "PREVIOUS_EMPLOYER" && record.employer_name ? record.employer_name : SOURCE_LABEL[record.source]}
                    </p>
                    <p className="font-mont text-[11px] text-gray-05">
                      {[record.source === "PREVIOUS_EMPLOYER" ? "Previous employer" : "Before this payroll", record.evidence_reference ? `Evidence ${record.evidence_reference}` : null, record.updated_by ? `Last changed by ${record.updated_by}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-3">
                    {can(P.FIN_UPDATE_SALARY) ? <button type="button" onClick={() => setEditing(record)} className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline"><Pencil className="size-3" /> Correct</button> : null}
                    {can(P.FIN_DELETE_SALARY) ? <button type="button" onClick={() => setRemoving(record)} className="inline-flex items-center gap-1 font-mont text-[11px] font-medium text-destructive hover:underline"><Trash2 className="size-3" /> Remove</button> : null}
                  </span>
                </div>
                {isNilRecord(record) && shown.length ? (
                  <p className="mt-2 font-mont text-xs text-gray-05">Recorded as none: no earlier pay this year.</p>
                ) : shown.length ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    {shown.map(([name, label]) => name in record ? (
                      <div key={name} className="min-w-0">
                        <dt className="font-mont text-[11px] text-gray-05">{label}</dt>
                        <dd className="font-mont text-xs tabular-nums text-black-01">{formatMoney(record[name] ?? 0, currency)}</dd>
                      </div>
                    ) : null)}
                  </dl>
                ) : (
                  <p className="mt-2 font-mont text-xs text-gray-05">Recorded. Your role does not show its figures.</p>
                )}
              </div>
            ))}
          </div>
        )}
      <ConfirmActionModal open={!!removing} onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={removing ? `Remove ${removing.tax_year} earlier pay?` : "Remove earlier pay?"}
        description="The next run works out PAYE as though nothing was earned before it. Runs already posted keep the figures they used."
        confirmText="Remove" destructive loading={removingBusy} onConfirm={doRemove} />
    </div>
  );
}

const blankFigures = (): Record<EarlierFigure, number> => ({
  brought_forward_gross_amount: 0, brought_forward_taxable_pay: 0, brought_forward_paye_amount: 0,
  brought_forward_pension_amount: 0, brought_forward_nhf_amount: 0,
});

/**
 * Records or corrects one record of earlier pay.
 *
 * A new record sends the figures the reader may write and leaves the rest out,
 * which the server reads as zero. A correction sends only what changed. The
 * previous employer's name is asked only for a previous employer: this
 * school's own months name no other employer.
 */
export function EarlierPayForm({ salary, entity, currency, record, onDone }: {
  salary: EmployeeSalary;
  entity: string;
  currency?: string | null;
  record: PayBroughtForward | null;
  onDone: () => void;
}) {
  const dates = useDates();
  const access = useFieldAccess(SALARY, record);
  const creating = !record;
  const mode = { creating };
  const [source, setSource] = useState<PayBroughtForwardSource>(record?.source ?? "PREVIOUS_EMPLOYER");
  const [year, setYear] = useState(String(record?.tax_year ?? dates.today().slice(0, 4)));
  const [figures, setFigures] = useState<Record<EarlierFigure, number>>(() => {
    const out = blankFigures();
    if (record) for (const [name] of EARLIER_FIGURES) out[name] = record[name] ?? 0;
    return out;
  });
  const [employer, setEmployer] = useState(record?.employer_name ?? "");
  const [evidence, setEvidence] = useState(record?.evidence_reference ?? "");
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [refused, setRefused] = useState<Record<string, string>>({});
  const [create, { isLoading: creatingBusy }] = useCreatePayBroughtForwardMutation();
  const [update, { isLoading: updatingBusy }] = useUpdatePayBroughtForwardMutation();
  const busy = creatingBusy || updatingBusy;
  const previous = source === "PREVIOUS_EMPLOYER";
  const anyFigure = Object.values(figures).some((value) => value > 0);
  const yearValid = /^\d{4}$/.test(year);
  const needsEmployer = previous && anyFigure && !employer.trim();

  const submit = async (nil = false) => {
    setDenied(null);
    setRefused({});
    try {
      if (record) {
        const body = earlierPayChanges(record, { ...figures, employer_name: previous ? employer : "", evidence_reference: evidence }, access);
        const res = await update({ entity, id: record.id, ...body }).unwrap();
        toast.success(res.message || "Earlier pay corrected.");
      } else {
        const sent = nil ? {} : access.writableOnly({ ...figures }, mode);
        const res = await create({
          entity, salaryId: salary.id, tax_year: Number(year), source,
          ...sent,
          ...(previous && !nil && employer.trim() ? { employer_name: employer.trim() } : {}),
          ...(evidence.trim() ? { evidence_reference: evidence.trim() } : {}),
        }).unwrap();
        toast.success(res.message || "Earlier pay recorded.");
      }
      onDone();
    } catch (error) {
      setDenied(fieldWriteErrors(error));
      setRefused(fieldRefusals(error));
    }
  };

  const refusal = refused.tax_year ?? refused.source ?? refused.employer_name ?? Object.values(refused)[0];
  return (
    <div className="space-y-4" data-testid="earlier-pay-form">
      <p className="font-mont text-sm font-semibold text-gray-01">{record ? `Correct ${record.tax_year} earlier pay` : "Record earlier pay"}</p>
      {record ? (
        <p className="font-mont text-xs leading-5 text-gray-05">A correction reaches the next run. Runs already posted keep the figures they used, and a draft run that holds {salary.name} must be voided first.</p>
      ) : null}
      {refusal ? <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">{refusal}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Where it was earned" required>
          <select value={source} disabled={!!record} onChange={(event) => setSource(event.target.value as PayBroughtForwardSource)}
            className="h-9 w-full rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 disabled:opacity-60">
            <option value="PREVIOUS_EMPLOYER">{SOURCE_LABEL.PREVIOUS_EMPLOYER}</option>
            <option value="THIS_EMPLOYER">{SOURCE_LABEL.THIS_EMPLOYER}</option>
          </select>
        </FormField>
        <FormField label="Tax year" required>
          <Input value={year} disabled={!!record} inputMode="numeric" maxLength={4} onChange={(event) => setYear(event.target.value.replace(/\D/g, ""))} className="h-9 bg-white" />
        </FormField>
      </div>
      <p className="font-mont text-[11px] leading-5 text-gray-05">
        {previous
          ? "From their P45 or tax deduction card. These figures count in PAYE but are never this school's pay: payslips and returns keep them apart."
          : "This school's own pay for the months before its payroll ran here. It counts as this school's pay in payslips and the annual return."}
      </p>
      {previous ? (
        <FormField label="Previous employer" required={anyFigure}>
          <Input value={employer} onChange={(event) => setEmployer(event.target.value)} maxLength={160} placeholder="e.g. Unity Schools Ltd" className="h-9 bg-white" />
        </FormField>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EARLIER_FIGURES.map(([name, label]) => (
          <AccessField key={name} access={access} name={name} label={label} creating={creating} errors={denied}>
            <MoneyInput valueKobo={figures[name]} onChangeKobo={(kobo) => setFigures((current) => ({ ...current, [name]: kobo }))} currency={currency} className="[&_input]:h-9" />
          </AccessField>
        ))}
      </div>
      <FormField label="Evidence reference">
        <Input value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={120} placeholder="e.g. TDC-2026-0147" className="h-9 bg-white" />
      </FormField>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>
        {!record && previous ? (
          <Button variant="outline" disabled={busy || !yearValid} onClick={() => submit(true)}>No previous employer</Button>
        ) : null}
        <Button disabled={busy || !yearValid || needsEmployer} onClick={() => submit(false)}>{busy ? "Saving…" : record ? "Save correction" : "Record"}</Button>
      </div>
    </div>
  );
}

// ── Voluntary deductions ─────────────────────────────────────────────────────

/**
 * A person's voluntary deductions: staff loans, cooperative savings and the
 * like. Each comes off pay every month to its own account until its end date
 * or its total limit. The amount and limit are the person's pay breakdown, so
 * they follow that switch. The kinds are set up once for the school, under
 * Finance Settings, Payroll.
 */
export function DeductionsPanel({ salary, entity, currency }: { salary: EmployeeSalary; entity: string; currency?: string | null }) {
  const dates = useDates();
  const { can } = useCan();
  const access = useFieldAccess(SALARY);
  const { data, isLoading, isError } = useGetEmployeeDeductionsQuery({ entity, salaryId: salary.id });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const [editing, setEditing] = useState<EmployeeDeduction | "new" | null>(null);
  const [stopping, setStopping] = useState<EmployeeDeduction | null>(null);
  const [stop, { isLoading: stoppingBusy }] = useStopEmployeeDeductionMutation();
  const showAmount = !access.isHidden("amount");
  const showLimit = !access.isHidden("total_limit");

  const doStop = async () => {
    if (!stopping) return;
    try { const res = await stop({ entity, id: stopping.id }).unwrap(); toast.success(res.message || "Deduction stopped."); setStopping(null); }
    catch { /* central */ }
  };

  if (editing) return <DeductionForm salary={salary} entity={entity} currency={currency} deduction={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      {can(P.FIN_CREATE_SALARY) ? (
        <div className="flex justify-end"><Button onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> Add deduction</Button></div>
      ) : null}
      {isLoading ? <p className="font-mont text-xs text-gray-05">Loading deductions…</p>
        : isError ? <p className="font-mont text-xs text-gray-05">Deductions could not be read.</p>
        : !rows.length ? <p className="rounded-md border border-dashed border-white-02 px-3 py-4 text-center font-mont text-xs text-gray-05">No voluntary deductions.</p>
        : (
          <div className="overflow-x-auto rounded-md border border-white-02">
            <table className="w-full min-w-[520px] border-collapse">
              <thead><tr>
                <th className={th}>Deduction</th>
                {showAmount ? <th className={cn(th, "text-right")}>Each month</th> : null}
                {showLimit ? <th className={cn(th, "text-right")}>Limit</th> : null}
                <th className={th}>Runs</th>
                <th className={th} />
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={td}>
                      <span className="font-medium">{row.deduction_type_name}</span>
                      {row.reference ? <span className="block text-[11px] text-gray-05">{row.reference}</span> : null}
                    </td>
                    {showAmount ? <td className={cn(td, "text-right tabular-nums")}>{formatMoney(row.amount ?? 0, currency)}</td> : null}
                    {showLimit ? <td className={cn(td, "text-right tabular-nums")}>{row.total_limit != null ? formatMoney(row.total_limit, currency) : "No limit"}</td> : null}
                    <td className={cn(td, "text-gray-05")}>
                      {!row.is_active ? <span className={cn(PILL, "bg-gray-03/60 text-gray-05")}>Stopped</span>
                        : `${row.start_date ? `From ${dates.day(row.start_date)}` : "From now"}${row.end_date ? ` to ${dates.day(row.end_date)}` : ""}`}
                    </td>
                    <td className={cn(td, "text-right")}>
                      {row.is_active ? (
                        <span className="inline-flex items-center gap-3">
                          {can(P.FIN_UPDATE_SALARY) ? <button type="button" aria-label="Change" onClick={() => setEditing(row)} className="text-gray-05 hover:text-primary"><Pencil className="size-3.5" /></button> : null}
                          {can(P.FIN_DELETE_SALARY) ? <button type="button" aria-label="Stop" onClick={() => setStopping(row)} className="text-gray-05 hover:text-destructive"><Ban className="size-3.5" /></button> : null}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <ConfirmActionModal open={!!stopping} onOpenChange={(open) => (open ? undefined : setStopping(null))}
        title={stopping ? `Stop ${stopping.deduction_type_name}?` : "Stop deduction?"}
        description="Nothing more is deducted from the next run. What was already deducted stays on the runs that took it."
        confirmText="Stop deduction" destructive loading={stoppingBusy} onConfirm={doStop} />
    </div>
  );
}

function DeductionForm({ salary, entity, currency, deduction, onDone }: {
  salary: EmployeeSalary;
  entity: string;
  currency?: string | null;
  deduction: EmployeeDeduction | null;
  onDone: () => void;
}) {
  const access = useFieldAccess(SALARY);
  const creating = !deduction;
  const mode = { creating };
  const { data: typeData } = useGetPayrollDeductionTypesQuery({ entity }, { skip: !creating });
  const types = useMemo(() => toArray(typeData?.data).filter((kind) => kind.is_active), [typeData]);
  const [kind, setKind] = useState("");
  const [amount, setAmount] = useState(deduction?.amount ?? 0);
  const [hasLimit, setHasLimit] = useState(deduction ? deduction.total_limit != null : false);
  const [limit, setLimit] = useState(deduction?.total_limit ?? 0);
  const [start, setStart] = useState(deduction?.start_date ?? "");
  const [end, setEnd] = useState(deduction?.end_date ?? "");
  const [reference, setReference] = useState(deduction?.reference ?? "");
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [create, { isLoading: creatingBusy }] = useCreateEmployeeDeductionMutation();
  const [update, { isLoading: updatingBusy }] = useUpdateEmployeeDeductionMutation();
  const busy = creatingBusy || updatingBusy;
  const amountOpen = !access.isReadOnly("amount", mode);
  const totalLimit = hasLimit ? limit : null;

  const submit = async () => {
    setDenied(null);
    try {
      if (deduction) {
        const changed: Record<string, unknown> = {};
        if ("amount" in deduction && amount !== deduction.amount) changed.amount = amount;
        if ("total_limit" in deduction && totalLimit !== deduction.total_limit) changed.total_limit = totalLimit;
        if ((start || null) !== deduction.start_date) changed.start_date = start || null;
        if ((end || null) !== deduction.end_date) changed.end_date = end || null;
        const res = await update({ entity, id: deduction.id, ...access.writableOnly(changed, mode) }).unwrap();
        toast.success(res.message || "Deduction updated.");
      } else {
        const res = await create({
          entity, salaryId: salary.id, deduction_type: Number(kind), amount,
          ...(totalLimit != null ? { total_limit: totalLimit } : {}),
          ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }).unwrap();
        toast.success(res.message || "Deduction added.");
      }
      onDone();
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };

  if (creating && !amountOpen) {
    return (
      <div className="space-y-3">
        <p className="font-mont text-xs text-gray-05">Your role may not set how much comes off someone&apos;s pay, so it cannot add a deduction.</p>
        <div className="flex justify-end"><Button variant="outline" onClick={onDone}>Back</Button></div>
      </div>
    );
  }
  if (creating && typeData && !types.length) {
    return (
      <div className="space-y-3">
        <p className="font-mont text-xs leading-5 text-gray-05">
          No kinds of deduction are set up yet. Someone who covers the whole school adds them, such as a staff loan or cooperative savings, under{" "}
          <Link to={`${routesPath.PROTECTED.FINANCE.SETTINGS}/payroll`} className="font-medium text-primary hover:underline">Finance Settings, Payroll</Link>.
        </p>
        <div className="flex justify-end"><Button variant="outline" onClick={onDone}>Back</Button></div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="font-mont text-sm font-semibold text-gray-01">{deduction ? `Change ${deduction.deduction_type_name}` : "Add a deduction"}</p>
      {creating ? (
        <FormField label="Kind" required>
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-9 w-full rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01">
            <option value="">Choose…</option>
            {types.map((type) => <option key={type.id} value={String(type.id)}>{type.name}</option>)}
          </select>
        </FormField>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccessField access={access} name="amount" label="Each month" required creating={creating} errors={denied}>
          <MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" />
        </AccessField>
        <AccessField access={access} name="total_limit" creating={creating} errors={denied}>
          <label className="mb-1 flex items-center gap-2 font-mont text-xs text-gray-05"><input type="checkbox" checked={hasLimit} onChange={(event) => setHasLimit(event.target.checked)} className="accent-primary" /> Stop at a total</label>
          {hasLimit ? <MoneyInput valueKobo={limit} onChangeKobo={setLimit} currency={currency} className="[&_input]:h-9" /> : null}
        </AccessField>
        <FormField label="First run on or after"><DatePickerInput value={start} onChange={(event) => setStart(event.target.value)} /></FormField>
        <FormField label="Last run on or before"><DatePickerInput min={start || undefined} value={end} onChange={(event) => setEnd(event.target.value)} /></FormField>
      </div>
      {creating ? (
        <FormField label="Reference"><Input value={reference} maxLength={64} onChange={(event) => setReference(event.target.value)} placeholder="e.g. Loan agreement number" className="h-9 bg-white" /></FormField>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button disabled={busy || (creating && (!kind || amount <= 0)) || (hasLimit && limit <= 0)} onClick={submit}>{busy ? "Saving…" : deduction ? "Save changes" : "Add deduction"}</Button>
      </div>
    </div>
  );
}

// ── Tax year ────────────────────────────────────────────────────────────────

/** The figures of one employer's earlier months, as a summary prints them. */
function EarlierBlock({ title, earlier, currency, note }: { title: string; earlier: TaxSummaryEarlier; currency?: string | null; note: string }) {
  const money = (kobo: number) => formatMoney(kobo, currency);
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-xs font-semibold text-gray-01">{title}</p>
      <p className="mb-2 font-mont text-[11px] text-gray-05">{note}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {([["Gross pay", earlier.gross], ["Taxable pay", earlier.taxable_pay], ["PAYE", earlier.paye], ["Pension", earlier.pension]] as const).map(([label, value]) => (
          <div key={label}><dt className="font-mont text-[11px] text-gray-05">{label}</dt><dd className="font-mont text-xs tabular-nums">{money(value)}</dd></div>
        ))}
      </dl>
      {earlier.evidence_reference ? <p className="mt-2 font-mont text-[11px] text-gray-05">Evidence {earlier.evidence_reference}</p> : null}
    </div>
  );
}

/**
 * A tax summary laid out for reading: this employer's months, its totals, and
 * the earlier months kept apart. Shared with My payslips, where the person
 * reads their own.
 */
export function TaxSummaryView({ summary, currency }: { summary: TaxSummary; currency?: string | null }) {
  const dates = useDates();
  const money = (kobo: number) => formatMoney(kobo, currency);
  return (
    <div className="space-y-3">
      <p className="font-mont text-xs text-gray-05">
        {[summary.issuer, summary.tax_id ? `Tax ID ${summary.tax_id}` : null, summary.tax_states.length ? `PAYE to ${summary.tax_states.join(", ")}` : null].filter(Boolean).join(" · ")}
      </p>
      {summary.months.length ? (
        <div className="overflow-x-auto rounded-md border border-white-02">
          <table className="w-full min-w-[520px] border-collapse">
            <thead><tr>
              <th className={th}>Month</th>
              <th className={cn(th, "text-right")}>Gross</th>
              <th className={cn(th, "text-right")}>PAYE</th>
              <th className={cn(th, "text-right")}>Pension</th>
              <th className={cn(th, "text-right")}>Net</th>
            </tr></thead>
            <tbody>
              {summary.months.map((month) => (
                <tr key={`${month.run}-${month.pay_date}`}>
                  <td className={td}>{month.period_label || dates.monthYear(month.pay_date)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{money(month.gross)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{money(month.paye)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{money(month.pension)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{money(month.net)}</td>
                </tr>
              ))}
              <tr>
                <td className={cn(td, "font-semibold")}>This employer&apos;s year</td>
                <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(summary.totals.gross)}</td>
                <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(summary.totals.paye)}</td>
                <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(summary.totals.pension)}</td>
                <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(summary.totals.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : <p className="font-mont text-xs text-gray-05">Nothing was paid through this payroll in {summary.year}.</p>}
      {summary.opening ? (
        <EarlierBlock title="Before this payroll" earlier={summary.opening} currency={currency}
          note="This school's own months before its payroll ran here. They are in this employer's year above." />
      ) : null}
      {summary.brought_forward ? (
        <EarlierBlock title={`Earlier this tax year with ${summary.brought_forward.employer_name || "a previous employer"}`} earlier={summary.brought_forward} currency={currency}
          note="Counted in PAYE, but that employer's pay, not this one's: it is not in the totals above." />
      ) : null}
    </div>
  );
}

export function TaxYearPanel({ salary, entity, currency, allowed }: { salary: EmployeeSalary; entity: string; currency?: string | null; allowed: boolean }) {
  const dates = useDates();
  const thisYear = Number(dates.today().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, isLoading, isError } = useGetSalaryTaxSummaryQuery(allowed ? { entity, salaryId: salary.id, year } : skipToken);
  const summary = data?.data;
  if (!allowed) {
    return <p className="font-mont text-xs text-gray-05">A tax summary shows every pay figure, and your role does not see them all.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Tax year"
          className="h-9 w-32 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01">
          {[thisYear, thisYear - 1, thisYear - 2].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <Button variant="outline" onClick={() => openSalaryTaxSummary(entity, salary.id, year)} className="gap-1.5"><Download className="size-4" /> Tax summary PDF</Button>
      </div>
      {isLoading ? <p className="font-mont text-xs text-gray-05">Loading the tax year…</p>
        : isError || !summary ? <p className="font-mont text-xs text-gray-05">The tax year could not be read.</p>
        : <TaxSummaryView summary={summary} currency={currency} />}
    </div>
  );
}
