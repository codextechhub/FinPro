/**
 * A tax return read whole: each branch's share, the late items it declares,
 * the payments made against it and, for a payroll return, the people behind it.
 *
 * Bright Star's October VAT is ₦120,000: Ikeja's share ₦80,000 and Lekki's
 * ₦40,000. Each branch pays its own share from its own bank, so the return
 * lists the shares and Pay asks which one. A share still marked "No branch
 * yet" holds lines nobody has placed; at a school with several branches it
 * blocks filing until they are. A September invoice posted in October is
 * declared on October's return as a late item "from September", so October is
 * not short and September's filed figure does not move.
 *
 * At a school with one branch the return has one share and none of this is
 * shown: the totals already say it.
 */

import { useState } from "react";
import { AlertTriangle, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";

import { ConfirmActionModal, ReasonField, hasReason } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { ErrorState, ForbiddenState, LoadingState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { useGetTaxFilingScheduleQuery, useReverseTaxRemittanceMutation } from "@/redux/services/finance/tax-api";
import type { TaxFilingDetail, TaxFilingShare, TaxRemittance } from "@/redux/services/finance/tax-types";
import { P } from "../../../permissions";
import { useReaderReach } from "../../../host";
import { useDates } from "../../../lib/display-prefs";
import { isForbidden } from "../../../lib/api-errors";

/** Obligation types whose return is built from payroll lines, so it has people behind it. */
export const PAYROLL_RETURN_TYPES = new Set(["PAYE", "PENSION", "OTHER"]);

/** Whether the shares say more than the totals: several of them, or lines with no branch yet. */
export function showsShares(shares: TaxFilingShare[] | undefined): boolean {
  const rows = shares ?? [];
  return rows.length > 1 || rows.some((share) => share.branch_pending);
}

/** The shares a payment may settle: placed on a branch and not yet paid off. */
export function payableShares(shares: TaxFilingShare[] | undefined): TaxFilingShare[] {
  return (shares ?? []).filter((share) => !share.branch_pending && share.branch_id != null && share.balance_due > 0);
}

/** The branches that may bear a penalty: every placed share. */
export function penaltyBranches(shares: TaxFilingShare[] | undefined): { id: number; name: string }[] {
  return (shares ?? [])
    .filter((share) => !share.branch_pending && share.branch_id != null)
    .map((share) => ({ id: share.branch_id as number, name: share.branch_name ?? share.label }));
}

const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums";
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">{children}</p>
);

export function TaxReturnShares({ filing, currency }: { filing: TaxFilingDetail; currency?: string | null }) {
  const shares = filing.branch_breakdown ?? [];
  if (!showsShares(shares)) return null;
  const pending = shares.some((share) => share.branch_pending);
  const money = (kobo: number) => formatMoney(kobo, currency);
  return (
    <section aria-label="Each branch's share">
      <SectionTitle>Each branch's share</SectionTitle>
      {pending ? (
        <p className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Some lines on this return have no branch yet. Give them a branch before filing: a school with several branches files each branch's share.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-md border border-white-02">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr>
              <th className={thCls}>Branch</th>
              <th className={cn(thCls, "text-right")}>Tax</th>
              <th className={cn(thCls, "text-right")}>Recoverable</th>
              <th className={cn(thCls, "text-right")}>Penalty</th>
              <th className={cn(thCls, "text-right")}>Due</th>
              <th className={cn(thCls, "text-right")}>Paid</th>
              <th className={cn(thCls, "text-right")}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((share) => (
              <tr key={share.id} className={share.branch_pending ? "bg-amber-50/60" : undefined}>
                <td className={cn(tdCls, "text-gray-01")}>{share.label}<span className="ml-1 text-gray-05">· {share.line_count} {share.line_count === 1 ? "line" : "lines"}</span></td>
                <td className={cn(tdCls, "text-right")}>{money(share.gross_liability)}</td>
                <td className={cn(tdCls, "text-right text-gray-05")}>{money(share.recoverable_amount + share.brought_forward_credit)}</td>
                <td className={cn(tdCls, "text-right text-gray-05")}>{share.adjustment_amount ? money(share.adjustment_amount) : "-"}</td>
                <td className={cn(tdCls, "text-right")}>{money(share.amount_due)}</td>
                <td className={cn(tdCls, "text-right text-gray-05")}>{money(share.amount_paid)}</td>
                <td className={cn(tdCls, "text-right font-semibold", share.balance_due > 0 ? "text-destructive" : "text-gray-05")}>
                  {share.balance_due > 0 ? money(share.balance_due) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TaxReturnLines({ filing, currency }: { filing: TaxFilingDetail; currency?: string | null }) {
  const late = filing.late_items ?? [];
  const declared = filing.declared_line_count ?? 0;
  return (
    <section aria-label="What the return declares">
      <SectionTitle>What it declares</SectionTitle>
      <p className="font-mont text-xs leading-5 text-gray-05">
        {declared === 0
          ? "No transactions are declared on this return."
          : `${declared} ${declared === 1 ? "transaction line" : "transaction lines"}, ${filing.late_line_count ?? 0} of them late.`}
        {" "}Each line is declared once, so the next return is never short.
      </p>
      {late.length ? (
        <ul className="mt-2 divide-y divide-white-02 rounded-md border border-white-02 bg-white">
          {late.map((item) => (
            <li key={item.month} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-mont text-xs">
              <span className="text-gray-01">
                Late items <span className="font-semibold">{item.label}</span>
                <span className="ml-1 text-gray-05">· {item.line_count} {item.line_count === 1 ? "line" : "lines"}</span>
              </span>
              <span className="tabular-nums text-gray-01">{formatMoney(item.net, currency)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Payments made against the return, each reversible while it stands. Reversing
 * changes the whole return, so the server keeps it for somebody who covers the
 * whole school and holds the pay key; it needs a reason.
 */
export function TaxRemittances({ filing, entity, currency, showBranch }: {
  filing: TaxFilingDetail;
  entity: string;
  currency?: string | null;
  showBranch: boolean;
}) {
  const dates = useDates();
  const { wholeSchool } = useReaderReach();
  const [target, setTarget] = useState<TaxRemittance | null>(null);
  const [reason, setReason] = useState("");
  const [reverse, { isLoading }] = useReverseTaxRemittanceMutation();
  const rows = filing.remittances ?? [];
  if (!rows.length) return null;

  const close = () => { setTarget(null); setReason(""); };
  const confirm = async () => {
    if (!target) return;
    try {
      const response = await reverse({ id: filing.id, remittanceId: target.id, entity, reason: reason.trim() }).unwrap();
      toast.success(response.message || "Payment reversed.");
      close();
    } catch { /* central */ }
  };

  return (
    <section aria-label="Payments">
      <SectionTitle>Payments</SectionTitle>
      <ul className="divide-y divide-white-02 rounded-md border border-white-02 bg-white">
        {rows.map((row) => (
          <li key={row.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-mont text-xs", row.is_reversed && "opacity-70")}>
            <span className="min-w-0 text-gray-01">
              {dates.day(row.pay_date)} · {row.bank_account_name}{showBranch && row.branch_name ? ` · ${row.branch_name}` : ""}
              {row.is_reversed ? (
                <span className="mt-0.5 block text-gray-05">Reversed{row.reversed_at ? ` ${dates.day(row.reversed_at)}` : ""}{row.reversal_reason ? `: ${row.reversal_reason}` : ""}</span>
              ) : null}
            </span>
            <span className="flex items-center gap-2">
              <span className={cn("tabular-nums", row.is_reversed ? "text-gray-05 line-through" : "text-gray-01")}>{formatMoney(row.amount, currency)}</span>
              {!row.is_reversed && wholeSchool ? (
                <Can permission={P.FIN_PAY_TAX}>
                  <Button variant="outline" size="sm" onClick={() => setTarget(row)} className="h-7 gap-1 px-2 text-xs">
                    <RotateCcw className="size-3" /> Reverse
                  </Button>
                </Can>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <ConfirmActionModal
        open={target != null}
        onOpenChange={(open) => !open && close()}
        title={`Reverse the ${target ? formatMoney(target.amount, currency) : ""} payment${showBranch && target?.branch_name ? ` for ${target.branch_name}` : ""}?`}
        description="Reverses the payment's journal and takes it off the return, which goes back to Filed with that share unpaid. Use it for a payment recorded in error."
        confirmText="Reverse payment"
        destructive
        loading={isLoading}
        confirmDisabled={!hasReason(reason)}
        onConfirm={confirm}
      >
        <ReasonField
          value={reason}
          onChange={setReason}
          disabled={isLoading}
          placeholder="For example: paid from the wrong bank account"
          hint="Kept on the audit trail with your name."
        />
      </ConfirmActionModal>
    </section>
  );
}

/**
 * The people behind a payroll return, for the revenue service's or the PFA's
 * schedule. Read only when opened, because it carries each person's pay; a
 * reader whose role may not see pay figures is refused by the server.
 */
export function TaxReturnPeople({ filing, entity, currency, showBranch }: {
  filing: TaxFilingDetail;
  entity: string;
  currency?: string | null;
  showBranch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const query = useGetTaxFilingScheduleQuery({ id: filing.id, entity }, { skip: !open });
  if (!PAYROLL_RETURN_TYPES.has(filing.obligation_type)) return null;
  const data = query.data?.data;
  const money = (kobo: number) => formatMoney(kobo, currency);
  return (
    <section aria-label="People on this return">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionTitle>People on this return</SectionTitle>
        {!open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-7 gap-1 px-2 text-xs">
            <Users className="size-3" /> Show people
          </Button>
        ) : null}
      </div>
      {!open ? null : query.isLoading || query.isFetching ? (
        <LoadingState rows={3} label="Reading the schedule…" />
      ) : query.isError ? (
        isForbidden(query.error)
          ? <ForbiddenState message="This schedule shows each person's pay, and your role may not see it." />
          : <ErrorState onRetry={query.refetch} />
      ) : data && data.rows.length ? (
        <div className="overflow-x-auto rounded-md border border-white-02">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr>
                <th className={thCls}>Person</th>
                <th className={thCls}>{filing.obligation_type === "PENSION" ? "PIN / PFA" : "Tax ID"}</th>
                {showBranch ? <th className={thCls}>Branch</th> : null}
                <th className={cn(thCls, "text-right")}>Employee</th>
                <th className={cn(thCls, "text-right")}>Employer</th>
                <th className={cn(thCls, "text-right")}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.line_id}>
                  <td className={cn(tdCls, "text-gray-01")}>{row.employee_name}<span className="block text-[11px] text-gray-05">{row.run}</span></td>
                  <td className={cn(tdCls, "text-gray-05")}>
                    {filing.obligation_type === "PENSION" ? [row.pension_pin, row.pfa].filter(Boolean).join(" · ") || "-" : row.tax_id || "-"}
                  </td>
                  {showBranch ? <td className={cn(tdCls, "text-gray-05")}>{row.branch_name || "-"}</td> : null}
                  <td className={cn(tdCls, "text-right")}>{money(row.employee_amount)}</td>
                  <td className={cn(tdCls, "text-right")}>{money(row.employer_amount)}</td>
                  <td className={cn(tdCls, "text-right font-semibold")}>{money(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={cn(tdCls, "font-semibold")} colSpan={showBranch ? 3 : 2}>Total</td>
                <td className={cn(tdCls, "text-right font-semibold")}>{money(data.employee_total)}</td>
                <td className={cn(tdCls, "text-right font-semibold")}>{money(data.employer_total)}</td>
                <td className={cn(tdCls, "text-right font-semibold")}>{money(data.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="font-mont text-xs text-gray-05">Nobody is on this return.</p>
      )}
    </section>
  );
}
