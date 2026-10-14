/**
 * How paying a payroll run through Paystack is going.
 *
 * Shown on a posted or paid run at a school that pays its staff through the
 * payment provider (and on a run that has any line settled that way). Each
 * branch's staff are sent their net pay from the money held for that branch, in
 * one batch per branch, so at a school with several branches the panel lists
 * each branch's batch and the lines under it; a branch short of funds waits
 * while the others are paid, and nothing half-pays a branch. At a school with
 * one branch the branch is not named.
 *
 * - Retry failed sends again the lines whose transfer failed.
 * - Record as paid from the bank is for staff the provider cannot pay: it books
 *   the chosen lines of one branch as paid from that branch's own bank account.
 *   Both need `finance.payrollrun.pay`, and the reach to act on the whole run.
 *
 * The status, its reason, the staff names and their net pay are Field Access
 * switches of `finance.payrollrun`: a role without one sees no such column, and
 * a role that may not read the status sees how to pay and nothing else.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Banknote, RefreshCw } from "lucide-react";

import { BankAccountPicker, ConfirmActionModal, FormField, Money, PostingDateField, useFieldAccess } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useGetPayrollRunPaymentsQuery,
  useRecordPayrollLinesPaidFromBankMutation,
  useRetryPayrollPaymentsMutation,
} from "@/redux/services/finance/payroll-paystack-api";
import type { PayrollRun } from "@/redux/services/finance/ops-types";
import type { PayrollPaymentLine } from "@/redux/services/finance/payroll-paystack-types";
import { P } from "../../permissions";
import { providerInfo } from "./payment-providers";
import { usePaymentBranchColumn } from "./payment-branches";
import {
  batchWord, failedLines, payStateWord, progressSentence, recordSelection, recordableLines,
} from "./payroll-payments-model";

const RESOURCE = "finance.payrollrun";
const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

/** Reads a run's payment progress; `enabled` is false for a run not yet posted. */
export function useRunPayments(runId: number | null, entity: string, enabled: boolean) {
  const query = useGetPayrollRunPaymentsQuery({ id: runId ?? 0, entity }, { skip: !enabled || runId == null });
  return { payments: query.data?.data, refetch: query.refetch, isFetching: query.isFetching };
}

export function PayrollPaymentsPanel({ run, entity, currency, canAct }: {
  run: PayrollRun;
  entity: string;
  currency?: string | null;
  /** The reader covers what the run covers, so paying, retrying and recording are theirs to do. */
  canAct: boolean;
}) {
  const { can } = useCan();
  const access = useFieldAccess(RESOURCE);
  const branchColumn = usePaymentBranchColumn();
  const { payments, refetch, isFetching } = useRunPayments(run.id, entity, run.run_status === "POSTED" || run.run_status === "PAID");
  const [retry, { isLoading: retrying }] = useRetryPayrollPaymentsMutation();
  const [recordPaid, { isLoading: recording }] = useRecordPayrollLinesPaidFromBankMutation();
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [recordOpen, setRecordOpen] = useState(false);
  const [bank, setBank] = useState("");
  const [payDate, setPayDate] = useState(run.pay_date || "");

  const lines = useMemo(() => payments?.lines ?? [], [payments]);
  const settledThisWay = lines.some((line) => !!line.pay_state);
  if (!payments || (payments.payment_route !== "PAYSTACK" && !settledThisWay)) return null;

  const provider = providerInfo("PAYSTACK").label;
  const mayPay = canAct && can(P.FIN_PAY_PAYROLL);
  const statusShown = !access.isHidden("pay_state") && lines.every((line) => line.pay_state !== undefined);
  const showName = lines.some((line) => line.employee_name !== undefined);
  const showNet = lines.some((line) => line.net_amount !== undefined);
  const showNote = lines.some((line) => !!line.pay_note);
  const showBranch = branchColumn.show;
  const failed = failedLines(lines);
  const recordable = mayPay && statusShown ? recordableLines(lines) : [];
  const recordableIds = new Set(recordable.map((line) => line.id));
  const selection = recordSelection(lines, chosen);
  const sentence = statusShown ? progressSentence(payments) : null;
  const counts = statusShown ? payments.counts : undefined;
  const waitingForBank = counts?.needs_bank_details ?? 0;

  const toggle = (id: number) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const doRetry = async () => {
    try {
      const res = await retry({ id: run.id, entity, line_ids: failed.map((line) => line.id) }).unwrap();
      toast.success(res.message || "Sent again.");
    } catch { /* central */ }
  };
  const doRecord = async () => {
    try {
      const res = await recordPaid({
        id: run.id, entity, line_ids: [...chosen], bank_account: Number(bank), ...(payDate ? { pay_date: payDate } : {}),
      }).unwrap();
      toast.success(res.message || "Recorded as paid from the bank.");
      setRecordOpen(false);
      setChosen(new Set());
      setBank("");
    } catch { /* central */ }
  };

  return (
    <section data-testid="payroll-payments" className="space-y-3 rounded-md border border-white-02 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Paying staff through {provider}</p>
        <Button size="sm" variant="ghost" disabled={isFetching} onClick={() => void refetch()} className="gap-1.5" aria-label="Refresh payment progress">
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      {!statusShown ? (
        <p className="font-mont text-xs leading-5 text-gray-05">Your role does not see how each payment is going.</p>
      ) : null}
      {sentence ? <p data-testid="payroll-payments-sentence" className="font-mont text-sm font-semibold text-black-01">{sentence}</p> : null}

      {counts ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ["Paid", counts.paid], ["Sent", counts.sent], ["Failed", counts.failed],
            ["Waiting for funds", counts.waiting_for_funds], ["Needs bank details", counts.needs_bank_details], ["Not sent yet", counts.not_sent],
          ] as const).map(([label, n]) => (
            <div key={label} className="rounded-md border border-white-02 px-3 py-2">
              <p className="font-mont text-[11px] text-gray-05">{label}</p>
              <p className="mt-0.5 font-mont text-sm font-semibold tabular-nums text-black-01">{n}</p>
            </div>
          ))}
        </div>
      ) : null}

      {waitingForBank > 0 ? (
        <p className="font-mont text-xs leading-5 text-amber-900">
          {`${waitingForBank} ${waitingForBank === 1 ? "person has" : "people have"} no checked bank account, so nothing was sent to them. Check their account under Bank accounts and pay again, or record them as paid from the bank.`}
        </p>
      ) : null}
      {(counts?.waiting_for_funds ?? 0) > 0 ? (
        <p className="font-mont text-xs leading-5 text-gray-05">A branch that holds less than its batch needs waits. It is sent as soon as online payments bring in enough, while the other branches are paid.</p>
      ) : null}

      {showBranch && payments.branches.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-white-02">
          <table className="w-full min-w-[480px] border-collapse" data-testid="payroll-payments-branches">
            <thead><tr>
              <th className={thCls}>Branch</th>
              <th className={cn(thCls, "text-right")}>Staff</th>
              {payments.branches.some((b) => b.net_total !== undefined) ? <th className={cn(thCls, "text-right")}>Net pay</th> : null}
              {payments.branches.some((b) => b.paid_total !== undefined) ? <th className={cn(thCls, "text-right")}>Paid</th> : null}
              {payments.branches.some((b) => b.batch !== undefined) ? <th className={thCls}>Batch</th> : null}
            </tr></thead>
            <tbody>
              {payments.branches.map((b) => (
                <tr key={b.branch_id ?? "none"}>
                  <td className={tdCls}>{b.branch_name || branchColumn.name(b.branch_id)}</td>
                  <td className={cn(tdCls, "text-right tabular-nums")}>{b.lines}</td>
                  {payments.branches.some((x) => x.net_total !== undefined) ? <td className={cn(tdCls, "text-right tabular-nums")}>{b.net_total !== undefined ? <Money kobo={b.net_total} currency={currency} align="right" /> : null}</td> : null}
                  {payments.branches.some((x) => x.paid_total !== undefined) ? <td className={cn(tdCls, "text-right tabular-nums")}>{b.paid_total !== undefined ? <Money kobo={b.paid_total} currency={currency} align="right" /> : null}</td> : null}
                  {payments.branches.some((x) => x.batch !== undefined) ? <td className={tdCls}>{b.batch ? `${batchWord(b.batch.status)}` : "Not sent yet"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {lines.length > 0 && (statusShown || showName || showNet) ? (
        <div className="overflow-x-auto rounded-md border border-white-02">
          <table className="w-full min-w-[520px] border-collapse" data-testid="payroll-payments-lines">
            <thead><tr>
              {recordable.length > 0 ? <th className={cn(thCls, "w-8")} aria-label="Choose" /> : null}
              {showName ? <th className={thCls}>Staff</th> : null}
              {showBranch ? <th className={thCls}>Branch</th> : null}
              {showNet ? <th className={cn(thCls, "text-right")}>Net pay</th> : null}
              {statusShown ? <th className={thCls}>Status</th> : null}
              {showNote ? <th className={thCls}>Why</th> : null}
            </tr></thead>
            <tbody>
              {lines.map((line: PayrollPaymentLine) => {
                const word = payStateWord(line.pay_state, line.pay_state_label);
                return (
                  <tr key={line.id} data-testid={`payroll-payment-line-${line.id}`}>
                    {recordable.length > 0 ? (
                      <td className={tdCls}>
                        {recordableIds.has(line.id)
                          ? <input type="checkbox" aria-label={`Choose ${line.employee_name ?? `line ${line.line_no}`}`} checked={chosen.has(line.id)} onChange={() => toggle(line.id)} />
                          : null}
                      </td>
                    ) : null}
                    {showName ? <td className={cn(tdCls, "whitespace-nowrap")}>{line.employee_name || "-"}</td> : null}
                    {showBranch ? <td className={cn(tdCls, "text-gray-05")}>{line.branch_name || branchColumn.name(line.branch_id)}</td> : null}
                    {showNet ? <td className={cn(tdCls, "text-right tabular-nums")}>{line.net_amount !== undefined ? <Money kobo={line.net_amount} currency={currency} align="right" /> : null}</td> : null}
                    {statusShown ? <td className={tdCls}><span className={cn(PILL, word.tone)}>{word.label}</span></td> : null}
                    {showNote ? <td className={cn(tdCls, "text-gray-05")}>{line.pay_note || ""}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {mayPay && statusShown ? (
        <div className="flex flex-wrap items-center gap-2">
          {failed.length > 0 ? (
            <Button size="sm" disabled={retrying} onClick={doRetry} className="gap-1.5">
              <RefreshCw className={cn("size-4", retrying && "animate-spin")} />{retrying ? "Sending…" : `Retry failed (${failed.length})`}
            </Button>
          ) : null}
          {recordable.length > 0 ? (
            <Button size="sm" variant="outline" disabled={!selection.ok} onClick={() => setRecordOpen(true)} className="gap-1.5">
              <Banknote className="size-4" /> Record as paid from the bank
            </Button>
          ) : null}
          {selection.reason ? <p role="alert" className="font-mont text-[11px] text-destructive">{selection.reason}</p> : null}
        </div>
      ) : null}

      <ConfirmActionModal
        open={recordOpen}
        onOpenChange={setRecordOpen}
        title="Record these staff as paid from the bank?"
        description={`Books ${chosen.size} ${chosen.size === 1 ? "person" : "people"} as paid from the branch's own bank account, for staff ${provider} could not pay. Nothing is sent to ${provider} for them.`}
        confirmText="Record as paid"
        loading={recording}
        confirmDisabled={!bank || !payDate}
        onConfirm={doRecord}
      >
        <div className="space-y-3">
          <FormField label="Bank account they were paid from" required>
            <BankAccountPicker entity={entity} value={bank} onChange={setBank} documentBranchId={selection.branchId} />
          </FormField>
          <PostingDateField label="Payment date" entity={entity} value={payDate} onChange={setPayDate}
            notBefore={run.pay_date} notBeforeLabel={`payroll run ${run.document_number}`} />
        </div>
      </ConfirmActionModal>
    </section>
  );
}
