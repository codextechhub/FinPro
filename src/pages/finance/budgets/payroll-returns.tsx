/**
 * The people behind payroll's tax returns: each return's schedule, and the
 * employer's annual PAYE return.
 *
 * A state revenue service wants each employee's PAYE, and a pension fund
 * administrator each member's contribution with their PIN; a return holds only
 * the totals. The schedule lists the people a return covers, and only what a
 * run here deducted: pay brought forward from a previous employer, or from this
 * school's months before its payroll ran here, is in no monthly schedule.
 *
 * The annual return is each person's year at this employer, including this
 * school's own months before its payroll ran here and never a previous
 * employer's. Both print every pay figure, so the server refuses them to a role
 * that may not read them all; this screen does not ask in that case and says
 * why instead. A branch-bound reader is sent their own branches' people only.
 */

import { useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { DetailDrawer, toArray, useFieldAccess, type FieldAccess } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { useReaderReach } from "../../../host";
import { useDates } from "../../../lib/display-prefs";
import { useGetAnnualPayeReturnQuery, useGetTaxFilingScheduleQuery } from "@/redux/services/finance/payroll-api";
import type { TaxFiling } from "@/redux/services/finance/ops-types";
import type { AnnualPayeReturnRow } from "@/redux/services/finance/payroll-types";

const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

/** The returns payroll raises, which carry a schedule of people. */
export const PAYROLL_OBLIGATIONS = ["PAYE", "PENSION", "NHF", "NSITF", "ITF"] as const;

/** Every line figure a schedule or payslip prints. */
const LINE_FIGURES = ["employee_name", "gross_amount", "paye_amount", "pension_amount", "net_amount", "components"];
/** The roster figures the annual return prints beside them. */
const SALARY_FIGURES = ["gross_amount", "paye_amount", "pension_amount"];

/** Whether a reader may see every pay figure on a payroll line. */
export const readsEveryLineFigure = (access: Pick<FieldAccess, "isHidden">) =>
  LINE_FIGURES.every((name) => !access.isHidden(name));

/** Whether a filing is a payroll return with people behind it. */
export const isPayrollReturn = (filing: Pick<TaxFiling, "obligation_type">) =>
  (PAYROLL_OBLIGATIONS as readonly string[]).includes(filing.obligation_type);

/** A return's schedule of people, for a payroll return. Nothing for any other. */
export function RemittanceSchedulePanel({ filing, entity, currency }: { filing: TaxFiling; entity: string; currency?: string | null }) {
  const dates = useDates();
  const access = useFieldAccess("finance.payrollrun");
  const allowed = readsEveryLineFigure(access);
  const payroll = isPayrollReturn(filing);
  const { data, isLoading, isError } = useGetTaxFilingScheduleQuery(payroll && allowed ? { entity, id: filing.id } : skipToken);
  const schedule = data?.data;
  const rows = useMemo(() => toArray(schedule?.rows), [schedule]);
  if (!payroll) return null;
  const pension = filing.obligation_type === "PENSION";
  const showState = filing.obligation_type === "PAYE";
  const showEmployer = !!schedule && schedule.employer_total > 0;
  const showBranch = new Set(rows.map((row) => row.branch_id)).size > 1;

  return (
    <div data-testid="remittance-schedule">
      <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">People on this return{rows.length ? ` · ${rows.length}` : ""}</p>
      {!allowed ? (
        <p className="font-mont text-xs text-gray-05">The schedule shows each person&apos;s pay, and your role does not see every figure on it.</p>
      ) : isLoading ? <p className="font-mont text-xs text-gray-05">Loading the schedule…</p>
        : isError ? <p className="font-mont text-xs text-gray-05">The schedule could not be read.</p>
        : !rows.length ? <p className="font-mont text-xs text-gray-05">No payroll deductions are on this return yet.</p>
        : (
          <div className="overflow-x-auto rounded-md border border-white-02">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr>
                <th className={th}>Employee</th>
                <th className={th}>{pension ? "Administrator and PIN" : "Tax ID"}</th>
                {showState ? <th className={th}>State</th> : null}
                {showBranch ? <th className={th}>Branch</th> : null}
                <th className={th}>Paid</th>
                <th className={cn(th, "text-right")}>{showEmployer ? "Employee" : "Amount"}</th>
                {showEmployer ? <th className={cn(th, "text-right")}>Employer</th> : null}
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.line_id}>
                    <td className={td}>{row.employee_name}</td>
                    <td className={cn(td, "text-gray-05")}>{pension ? [row.pfa, row.pension_pin].filter(Boolean).join(" · ") || "-" : row.tax_id || "-"}</td>
                    {showState ? <td className={cn(td, "text-gray-05")}>{row.tax_state || "-"}</td> : null}
                    {showBranch ? <td className={cn(td, "text-gray-05")}>{row.branch_name || "-"}</td> : null}
                    <td className={cn(td, "tabular-nums text-gray-05")}>{dates.day(row.pay_date)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{formatMoney(row.employee_amount, currency)}</td>
                    {showEmployer ? <td className={cn(td, "text-right tabular-nums")}>{formatMoney(row.employer_amount, currency)}</td> : null}
                  </tr>
                ))}
                <tr>
                  <td className={cn(td, "font-semibold")} colSpan={2 + (showState ? 1 : 0) + (showBranch ? 1 : 0) + 1}>Total</td>
                  <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(schedule!.employee_total, currency)}</td>
                  {showEmployer ? <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatMoney(schedule!.employer_total, currency)}</td> : null}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      <p className="mt-1.5 font-mont text-[11px] text-gray-05">Only what payroll deducted here. Earlier pay brought forward is in no monthly return.</p>
    </div>
  );
}

/** A row's key on the annual return: the person's account, else salary record, else where it sits. */
export function annualRowKey(row: Pick<AnnualPayeReturnRow, "employee_id" | "salary_id" | "employee_name" | "tax_id">, index: number): string {
  if (row.employee_id != null) return `user-${row.employee_id}`;
  if (row.salary_id != null) return `salary-${row.salary_id}`;
  return `typed-${index}-${row.employee_name}-${row.tax_id}`;
}

const sameName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

/**
 * What tells a person apart from a namesake on the same return, or null when
 * nobody else on it shares their name.
 *
 * Kemi Ade at Ikeja and Kemi Ade at Lekki are two people with two accounts, and
 * the server lists them as two rows. Two identical-looking names would read as
 * a duplicate, so each says which one it is: the tax number where one is known,
 * else that the person is on the roster or was typed by hand on a run.
 */
export function namesakeNote(row: AnnualPayeReturnRow, rows: AnnualPayeReturnRow[]): string | null {
  const name = sameName(row.employee_name);
  if (rows.filter((other) => sameName(other.employee_name) === name).length < 2) return null;
  if (row.tax_id) return `Tax ID ${row.tax_id}`;
  if (row.employee_id != null || row.salary_id != null) return "On the roster, with no tax ID recorded";
  return "Typed by hand on a payroll run, with no tax ID";
}

/**
 * The employer's annual PAYE return for a year, person by person.
 *
 * Rows are keyed by the person, not by name (`annualRowKey`), and a name that
 * appears twice says which person each row is (`namesakeNote`).
 */
export function AnnualPayeReturnDrawer({ open, entity, currency, onClose }: { open: boolean; entity: string; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
  const { wholeSchool } = useReaderReach();
  const lines = useFieldAccess("finance.payrollrun");
  const salary = useFieldAccess("finance.salary");
  const allowed = readsEveryLineFigure(lines) && SALARY_FIGURES.every((name) => !salary.isHidden(name));
  const thisYear = Number(dates.today().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, isLoading, isError } = useGetAnnualPayeReturnQuery(open && allowed ? { entity, year } : skipToken);
  const annual = data?.data;
  const rows = useMemo(() => toArray(annual?.rows), [annual]);
  const money = (kobo: number) => formatMoney(kobo, currency);
  const anyOpening = rows.some((row) => row.opening_gross > 0);

  return (
    <DetailDrawer open={open} onOpenChange={(next) => (next ? undefined : onClose())}
      title="Annual PAYE return" description="Each person's pay and PAYE at this employer for the year."
      widthClass="sm:max-w-4xl"
      footer={<><div className="flex-1" /><Button variant="outline" onClick={onClose}>Close</Button></>}>
      <div className="space-y-4" data-testid="annual-return">
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Tax year" value={year} onChange={(event) => setYear(Number(event.target.value))}
            className="h-9 w-32 rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01">
            {[thisYear, thisYear - 1, thisYear - 2].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <p className="font-mont text-[11px] leading-5 text-gray-05">
            Includes this school&apos;s own months before its payroll ran here. A previous employer&apos;s pay is never in it: that employer files it.
          </p>
        </div>
        {!wholeSchool && allowed ? <p className="font-mont text-xs text-gray-05">You are shown your branch&apos;s part of the return.</p> : null}
        {!allowed ? (
          <p className="font-mont text-xs text-gray-05">This return shows each person&apos;s pay, and your role does not see every figure on it.</p>
        ) : isLoading ? <p className="font-mont text-xs text-gray-05">Loading the return…</p>
          : isError || !annual ? <p className="font-mont text-xs text-gray-05">The return could not be read.</p>
          : !rows.length ? <p className="font-mont text-xs text-gray-05">{`Nobody was paid through this payroll in ${year}.`}</p>
          : (
            <div className="overflow-x-auto rounded-md border border-white-02">
              <table className="w-full min-w-[720px] border-collapse">
                <thead><tr>
                  <th className={th}>Employee</th>
                  <th className={th}>Tax ID</th>
                  <th className={th}>State</th>
                  <th className={cn(th, "text-right")}>Months here</th>
                  <th className={cn(th, "text-right")}>Gross</th>
                  <th className={cn(th, "text-right")}>Taxable pay</th>
                  <th className={cn(th, "text-right")}>PAYE</th>
                  <th className={cn(th, "text-right")}>Pension</th>
                </tr></thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={annualRowKey(row, index)}>
                      <td className={td}>
                        {row.employee_name}
                        {namesakeNote(row, rows) ? <span className="block text-[11px] text-gray-05">{namesakeNote(row, rows)}</span> : null}
                        {row.opening_gross > 0 ? <span className="block text-[11px] text-gray-05">{`Includes ${money(row.opening_gross)} pay and ${money(row.opening_paye)} PAYE before this payroll`}</span> : null}
                      </td>
                      <td className={cn(td, "text-gray-05")}>{row.tax_id || "-"}</td>
                      <td className={cn(td, "text-gray-05")}>{row.tax_states.join(", ") || "-"}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{row.months}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{money(row.gross)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{money(row.taxable_pay)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{money(row.paye)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{money(row.pension)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className={cn(td, "font-semibold")} colSpan={4}>Total</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(annual.totals.gross)}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(annual.totals.taxable_pay)}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(annual.totals.paye)}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{money(annual.totals.pension)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        {anyOpening ? <p className="font-mont text-[11px] text-gray-05">{`${money(annual!.totals.opening_paye)} of the PAYE was deducted before this payroll, on the school's earlier payroll.`}</p> : null}
      </div>
    </DetailDrawer>
  );
}
