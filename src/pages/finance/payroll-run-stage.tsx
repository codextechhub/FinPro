/**
 * What a payroll run's footer and notes offer at each stage of its approval and
 * payment.
 *
 * A draft is sent for approval (`finance.payrollrun.submit`) rather than posted
 * on its preparer's word: a second person approves it, and the person who
 * prepared it never can. A draft an approver sent back is corrected by the
 * person who sent it, who changes its period label and narration (Edit) and
 * resumes the request; anybody else is told only its sender may
 * (returned-correction.ts). An approved run is posted, then paid.
 *
 * Paying depends on the school's payroll payment route, read from the run's
 * payment progress: from the branch's own bank (the ordinary Pay net), or
 * through Paystack, where Pay sends every member of staff's net pay at once and
 * the progress panel follows it. A run posted before approvals existed cannot be
 * paid through Paystack and says so.
 *
 * The hook returns the pieces so the run drawer places them: `actions` in its
 * footer, `notes` in its body, `dialogs` beside it. Nothing here is offered to a
 * branch-bound reader looking at their part of a whole-school run.
 */

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Banknote, FilePenLine, Send } from "lucide-react";

import { ConfirmActionModal, FormField, FormModal } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { noAccessMessage } from "@/components/finance-ui/no-access";
import { ResumeButton, ReturnedNote, useFinanceReturned } from "@/components/finance-ui/returned-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/utils/money";
import { usePayPayrollRunMutation } from "@/redux/services/finance/ops-api";
import type { PayrollRun } from "@/redux/services/finance/ops-types";
import { useCorrectPayrollRunMutation, useSubmitPayrollRunMutation } from "@/redux/services/finance/payroll-paystack-api";
import type { PayrollPaymentRoute } from "@/redux/services/finance/payroll-paystack-types";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";
import { P } from "../../permissions";
import { providerInfo } from "./payment-providers";
import { approvalNote, runApprovalPhase, runOffers, wasRejected } from "./payroll-approval";
import { hasLinesToSend, someLinesGone } from "./payroll-payments-model";
import { useRunPayments } from "./payroll-payments-panel";

const AMBER = "rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 font-mont text-xs leading-5 text-amber-900";
const PERIOD_MAX = 40;
const NARRATION_MAX = 255;

/** What a run that nobody but its preparer could approve is told, from the server's own sentence. */
export function parkedSentence(approval: ApprovalParkState | undefined | null): string | null {
  if (!approval?.parked) return null;
  return `Nobody can approve this run yet. ${approval.requirement ? `${approval.requirement} ` : ""}Add someone to the payroll approvers, then it can move. The person who prepared a run can never approve it.`;
}

export interface PayrollRunStage {
  /** How posted runs are paid at this school; OWN_BANK until the progress read says otherwise. */
  route: PayrollPaymentRoute;
  actions: ReactNode;
  notes: ReactNode;
  dialogs: ReactNode;
}

export function usePayrollRunStage({ run, entity, currency, partOnly }: {
  run: PayrollRun | undefined;
  entity: string;
  currency?: string | null;
  partOnly: boolean;
}): PayrollRunStage {
  const { can } = useCan();
  const { standing, request, workflowId, requestNamed } = useFinanceReturned(run, { path: "payroll-runs", entity });
  const { payments } = useRunPayments(run?.id ?? null, entity, run?.run_status === "POSTED" || run?.run_status === "PAID");
  const [submit, { isLoading: submitting }] = useSubmitPayrollRunMutation();
  const [correct, { isLoading: correcting }] = useCorrectPayrollRunMutation();
  const [pay, { isLoading: paying }] = usePayPayrollRunMutation();
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [editing, setEditing] = useState(false);
  const [period, setPeriod] = useState("");
  const [narration, setNarration] = useState("");
  const [parked, setParked] = useState<{ runId: number; text: string } | null>(null);

  const route: PayrollPaymentRoute = payments?.payment_route ?? "OWN_BANK";
  if (!run) return { route, actions: null, notes: null, dialogs: null };

  const phase = runApprovalPhase(run);
  const offers = runOffers(run, standing === "sender");
  const approvalShown = run.approval_state !== undefined;
  const provider = providerInfo("PAYSTACK").label;
  // The server says whether the run was approved, under the payment status switch.
  const legacy = route === "PAYSTACK" && run.run_status === "POSTED" && payments?.approved === false;
  const payOffered = route === "PAYSTACK" && run.run_status === "POSTED" && !partOnly && !legacy
    && can(P.FIN_PAY_PAYROLL) && hasLinesToSend(payments);
  const gone = someLinesGone(payments?.lines ?? []);

  const openEdit = () => { setPeriod(run.period_label ?? ""); setNarration(run.narration ?? ""); setEditing(true); };
  const doSubmit = async () => {
    try {
      const res = await submit({ id: run.id, entity }).unwrap();
      toast.success(res.message || "Sent for approval.");
      setConfirmSubmit(false);
      const text = parkedSentence(res.data?.approval);
      if (text) setParked({ runId: run.id, text });
    } catch { /* central */ }
  };
  const doCorrect = async () => {
    try {
      const res = await correct({
        id: run.id, entity,
        ...(period.trim() !== (run.period_label ?? "") ? { period_label: period.trim() } : {}),
        ...(narration.trim() !== (run.narration ?? "") ? { narration: narration.trim() } : {}),
      }).unwrap();
      toast.success(res.message || "Run updated.");
      setEditing(false);
    } catch { /* central */ }
  };
  const doPay = async () => {
    try {
      const res = await pay({ id: run.id, entity }).unwrap();
      toast.success(res.message || `Sent for payment through ${provider}.`);
      setConfirmPay(false);
    } catch { /* central */ }
  };

  const changed = period.trim() !== (run.period_label ?? "") || narration.trim() !== (run.narration ?? "");
  const actions = partOnly ? null : (
    <>
      {offers.edit && can(P.FIN_CREATE_PAYROLL) ? (
        <Button variant="outline" onClick={openEdit} className="gap-1.5"><FilePenLine className="size-4" /> Edit</Button>
      ) : null}
      {standing === "sender" ? <ResumeButton workflowId={workflowId} tags={["FinancePayroll"]} /> : null}
      {offers.submit && can(P.FIN_SUBMIT_PAYROLL) ? (
        <Button onClick={() => setConfirmSubmit(true)} disabled={submitting} className="gap-1.5"><Send className="size-4" /> Submit for approval</Button>
      ) : null}
      {payOffered ? (
        <Button onClick={() => setConfirmPay(true)} disabled={paying} className="gap-1.5">
          <Banknote className="size-4" /> {gone ? `Send the rest through ${provider}` : `Pay through ${provider}`}
        </Button>
      ) : null}
    </>
  );

  const phaseNote = approvalShown ? approvalNote(phase, wasRejected(run)) : null;
  const parkedText = parked?.runId === run.id ? parked.text : null;
  const notes = (
    <>
      {standing ? (
        <ReturnedNote standing={standing} request={request} requestNamed={requestNamed}
          senderHint="Correct its period label or narration with Edit, then Resume to send it back to the approver." />
      ) : phaseNote && phase !== "settled" ? (
        <p role="note" data-testid="payroll-approval-note" className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-xs leading-5 text-gray-05">{phaseNote}</p>
      ) : null}
      {phase === "draft" && !partOnly && !can(P.FIN_SUBMIT_PAYROLL) ? (
        <p className={AMBER}>{`This run needs a second person's approval before it is posted. ${noAccessMessage("submit payroll runs")}`}</p>
      ) : null}
      {parkedText ? <p role="alert" data-testid="payroll-parked" className={AMBER}>{parkedText}</p> : null}
      {legacy ? (
        <div role="alert" data-testid="payroll-legacy-note" className={AMBER}>
          <p className="font-semibold">Approve this run before paying through {provider}, or record it as paid from the bank.</p>
          <p className="mt-1">A run posted before payroll approvals existed cannot be approved now. Choose the staff below and record them as paid from the branch&apos;s bank.</p>
        </div>
      ) : null}
    </>
  );

  const dialogs = (
    <>
      <ConfirmActionModal
        open={confirmSubmit} onOpenChange={setConfirmSubmit}
        title={`Send ${run.document_number} for approval?`}
        description="A second person approves each payroll run before it is posted. The person who prepared this run, and the person who sends it, cannot approve it. Nothing is booked until it is approved and posted."
        confirmText="Send for approval" loading={submitting} onConfirm={doSubmit} />
      <ConfirmActionModal
        open={confirmPay} onOpenChange={setConfirmPay}
        title={`Pay staff through ${provider}?`}
        description={`Sends each member of staff's net pay (${formatMoney(run.net_total, currency)} in all) to their bank account from the money ${provider} holds for their branch. A branch short of funds waits while the others are paid. Staff with no checked bank account are skipped and listed.`}
        confirmText="Pay staff" loading={paying} onConfirm={doPay} />
      <FormModal
        open={editing} onOpenChange={setEditing} title={`Edit ${run.document_number}`}
        description="Change what the run is called. Its staff and figures stay as they are."
        submitText="Save changes" loading={correcting} canSubmit={changed && period.trim().length <= PERIOD_MAX && narration.trim().length <= NARRATION_MAX}
        onSubmit={doCorrect}>
        <FormField label="Period"><Input aria-label="Period" maxLength={PERIOD_MAX} value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-white" /></FormField>
        <FormField label="Narration"><Input aria-label="Narration" maxLength={NARRATION_MAX} value={narration} onChange={(e) => setNarration(e.target.value)} className="bg-white" /></FormField>
      </FormModal>
    </>
  );

  return { route, actions, notes, dialogs };
}
