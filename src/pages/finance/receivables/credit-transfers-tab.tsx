/**
 * Receivables -> Credit Transfers: moving one customer's unused credit to another.
 *
 * A receipt settles only its own customer's bills, so when Mr Okafor asks for
 * the N15,000 Tunde overpaid to go towards his sister Ada's fees, that is a
 * transfer: raised here as a draft, submitted, and posted only when a second
 * person approves it (there is no direct post). Once posted, Tunde's credit
 * drops and Ada's rises by the same amount; voiding it gives the credit back.
 *
 * A transfer belongs to the source customer's branch, or, for a customer every
 * branch shares, to the branch the person raising it names, and both customers
 * must be filed under that branch or shared.
 *
 * The list answers for one branch and one stretch of time
 * (`useFinanceListScope`), each transfer placed by its transfer date.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Plus, Send } from "lucide-react";
import {
  AccessField, ConfirmActionModal, CustomerPicker, DataTable, DetailDrawer, FormField, Money, MoneyInput,
  PostingDateField, RaisingBranchChoiceField, StatusPill, customerBranchHint, toArray,
  useCustomerBranch, useFieldAccess, useRaisingBranchChoice, writableOnlyFollowing, type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { RETURNED_HINT, SENT_BACK_FILTER, SENT_BACK_WORD, sentBackPill, statusFilterArgs } from "@/components/finance-ui/returned-correction";
import { ResumeButton, ReturnedNote, useFinanceReturned } from "@/components/finance-ui/returned-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import { useGetRefundAvailabilityQuery } from "@/redux/services/finance/ar-api";
import {
  useCreateCreditTransferMutation, useGetCreditTransfersQuery, useSubmitCreditTransferMutation,
  useVoidCreditTransferMutation,
} from "@/redux/services/finance/fees-api";
import type { CustomerCreditTransfer } from "@/redux/services/finance/fees-types";
import { CUSTOMER_RESOURCE, customerCreditReadable } from "./customer-credit-access";
import { DetailField, Note, useBranchColumn } from "./fees-parts";
import { useFinanceListScope } from "../list-scope";
import { DOCUMENT_STATUS_WORDS } from "@/components/finance-ui/status-words";

const selectCls = "h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01";

/**
 * The one word for each state a credit transfer takes (vs_finance
 * DocumentStatus), read by the status filter, the row pill and the drawer
 * alike: the receivables documents' shared words (status-words.ts). APPROVED
 * lasts only while an approved transfer posts, so the filter does not offer it.
 */
export const CREDIT_TRANSFER_STATUS: Readonly<Record<string, string>> = DOCUMENT_STATUS_WORDS;
const FILTER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "POSTED", "REVERSED"] as const;

export function CreditTransfersTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const access = useFieldAccess("finance.credittransfer");
  const { can } = useCan();
  const branches = useBranchColumn();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { scope, filters, branchView } = useFinanceListScope(entity, () => setPage(1));
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CustomerCreditTransfer | null>(null);
  const params = useMemo(() => ({ entity, page, ...statusFilterArgs(status), ...scope }), [entity, page, status, scope]);
  const { data, isLoading, isFetching, isError, refetch } = useGetCreditTransfersQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const open = selected ? rows.find((r) => r.id === selected.id) ?? selected : null;

  const columns: Column<CustomerCreditTransfer>[] = [
    { header: "Ref", cell: (t) => <span className="font-semibold tabular-nums">{t.document_number}</span> },
    ...(!access.isHidden("from_customer_name") ? [{ header: "From", cell: (t: CustomerCreditTransfer) => <span className="font-medium text-gray-01">{t.from_customer_name}</span> }] : []),
    ...(!access.isHidden("to_customer_name") ? [{ header: "To", cell: (t: CustomerCreditTransfer) => <span className="font-medium text-gray-01">{t.to_customer_name}</span> }] : []),
    ...(branches.show && branchView.selected === "all" ? [{ header: "Branch", cell: (t: CustomerCreditTransfer) => branches.name(t.branch_id) }] : []),
    ...(!access.isHidden("amount") ? [{ header: "Amount", align: "right" as const, cell: (t: CustomerCreditTransfer) => <Money kobo={t.amount} currency={currency} align="right" /> }] : []),
    ...(!access.isHidden("transfer_date") ? [{ header: "Date", cell: (t: CustomerCreditTransfer) => <span className="tabular-nums">{dates.day(t.transfer_date)}</span> }] : []),
    ...(!access.isHidden("status") ? [{ header: "Status", cell: (t: CustomerCreditTransfer) => <StatusPill {...sentBackPill(t, t.status, CREDIT_TRANSFER_STATUS[t.status], true)} /> }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!access.isHidden("status") ? <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls} aria-label="Status">
            <option value="">All statuses</option>
            {FILTER_STATUSES.map((code) => <option key={code} value={code}>{CREDIT_TRANSFER_STATUS[code]}</option>)}
            <option value={SENT_BACK_FILTER}>{SENT_BACK_WORD}</option>
          </select> : null}
          {filters}
        </div>
        {can(P.FIN_CREATE_CREDIT_TRANSFER) ? (
          <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New transfer</Button>
        ) : null}
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(t) => t.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No credit transfers"
        emptyMessage="Move a customer's unused credit to another customer, such as a sibling, with New transfer."
      />
      <NewTransferDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
      <TransferDrawer transfer={open} entity={entity} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}

/**
 * The credit a customer holds that a transfer may move, summed across the
 * branches the reader sees. Not asked for, and so never `known`, when the role
 * may not read a customer's balance: the server would answer with an empty list
 * that reads as "no credit".
 */
function useAvailableCredit(entity: string, customer: string) {
  const readable = customerCreditReadable(useFieldAccess(CUSTOMER_RESOURCE));
  const { data, isFetching } = useGetRefundAvailabilityQuery(
    { entity, search: customer, page_size: 50 }, { skip: !customer || !readable },
  );
  const rows = toArray(data?.data).filter((r) => r.customer_code === customer);
  return { amount: rows.reduce((sum, r) => sum + r.refundable_credit, 0), known: readable && !!customer && !isFetching };
}

function NewTransferDrawer({ open, onClose, entity, currency }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null;
}) {
  const access = useFieldAccess("finance.credittransfer");
  const { can } = useCan();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [create, { isLoading: creating }] = useCreateCreditTransferMutation();
  const [submit, { isLoading: submitting }] = useSubmitCreditTransferMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "credit transfer" });
  const fromBranch = useCustomerBranch(entity, from);
  const branch = useRaisingBranchChoice({ unless: fromBranch != null });
  const credit = useAvailableCredit(entity, from);
  const busy = creating || submitting;
  const ready = !!from && !!to && from !== to && amount > 0 && !!date && reason.trim() !== "" && branch.ready
    && !access.isReadOnly("amount", { creating: true })
    && !access.isReadOnly("from_customer", { creating: true })
    && !access.isReadOnly("transfer_date", { creating: true })
    && !access.isReadOnly("reason", { creating: true });

  const reset = () => { setFrom(""); setTo(""); setAmount(0); setDate(""); setReason(""); branch.reset(); };
  const close = () => { reset(); onClose(); };
  const save = async (send: boolean) => {
    try {
      const res = await create(writableOnlyFollowing(access, {
        entity, from_customer: from, to_customer: to, amount, transfer_date: date,
        reason: reason.trim(), ...branch.body(),
      }, { from_customer: "from_customer_name", to_customer: "to_customer_name" }, { creating: true })).unwrap();
      if (!send) {
        toast.success(res.message || "Credit transfer saved as draft.");
        close();
        return;
      }
      const sent = await submit({ entity, id: res.data.id }).unwrap();
      toast.success(sent.message || "Credit transfer submitted for approval.");
      promptIfParked(sent.data?.approval);
      if (!sent.data?.approval?.parked) close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New credit transfer"
      description="Moves unused credit from one customer to another. It posts only after a second person approves it."
      widthClass="sm:max-w-xl"
      footer={<>
        <Button variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button variant="outline" disabled={busy || !ready} onClick={() => save(false)}>Save draft</Button>
        {can(P.FIN_SUBMIT_CREDIT_TRANSFER) ? (
          <Button disabled={busy || !ready} onClick={() => save(true)} className="gap-1.5"><Send className="size-4" />{busy ? "Working..." : "Submit for approval"}</Button>
        ) : null}
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccessField access={access} name="from_customer_name" creating><FormField label="From customer" required><CustomerPicker entity={entity} value={from} onChange={setFrom} /></FormField></AccessField>
          <AccessField access={access} name="to_customer_name" creating><FormField label="To customer" required><CustomerPicker entity={entity} value={to} onChange={setTo} /></FormField></AccessField>
        </div>
        {from && to && from === to ? <p className="font-mont text-[11px] text-destructive">Choose a different customer to receive the credit.</p> : null}
        {from && credit.known ? (
          <p className="font-mont text-xs text-gray-05">Unused credit available: <span className="font-semibold tabular-nums text-gray-01">{formatMoney(credit.amount, currency)}</span></p>
        ) : null}
        <RaisingBranchChoiceField choice={branch} hint={customerBranchHint(fromBranch)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccessField access={access} name="amount" creating><FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} /></FormField></AccessField>
          <AccessField access={access} name="transfer_date" creating><PostingDateField label="Transfer date" entity={entity} value={date} onChange={setDate} /></AccessField>
        </div>
        <AccessField access={access} name="reason" creating><FormField label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="e.g. Family asked for Tunde's overpayment to pay Ada's fees" className="bg-white" />
        </FormField></AccessField>
        <Note>Approve it under Workflow, Approvals. Until then neither customer&apos;s credit changes.</Note>
      </div>
      {noApproverDialog}
    </DetailDrawer>
  );
}

function TransferDrawer({ transfer, entity, currency, onClose }: {
  transfer: CustomerCreditTransfer | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const access = useFieldAccess("finance.credittransfer", transfer);
  const { can } = useCan();
  const branches = useBranchColumn();
  const [confirm, setConfirm] = useState<"submit" | "void" | null>(null);
  const [submit, { isLoading: submitting }] = useSubmitCreditTransferMutation();
  const [voidTransfer, { isLoading: voiding }] = useVoidCreditTransferMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "credit transfer" });
  // No edit route: one sent back is resumed as it is, or withdrawn to change it.
  const { standing, request, workflowId, requestNamed } = useFinanceReturned(transfer, { path: "credit-transfers", entity });
  if (!transfer) return null;

  const act = async () => {
    try {
      if (confirm === "submit") {
        const res = await submit({ entity, id: transfer.id }).unwrap();
        toast.success(res.message || "Credit transfer submitted for approval.");
        promptIfParked(res.data?.approval);
        setConfirm(null);
        if (!res.data?.approval?.parked) onClose();
        return;
      }
      const res = await voidTransfer({ entity, id: transfer.id }).unwrap();
      toast.success(res.message || "Credit transfer voided.");
      setConfirm(null);
      onClose();
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o ? undefined : onClose())}
        title={transfer.document_number}
        description={access.isHidden("from_customer_name") ? undefined : `${transfer.from_customer_name} to ${transfer.to_customer_name}`}
        widthClass="sm:max-w-lg"
        footer={<>
          {transfer.status === "POSTED" && can(P.FIN_REVERSE_CREDIT_TRANSFER) ? (
            <Button variant="outline" onClick={() => setConfirm("void")} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" /> Void</Button>
          ) : null}
          {standing === "sender" ? <ResumeButton workflowId={workflowId} tags={["FinanceCreditTransfers"]} onResumed={onClose} /> : null}
          {transfer.status === "DRAFT" && !standing && can(P.FIN_SUBMIT_CREDIT_TRANSFER) ? (
            <Button onClick={() => setConfirm("submit")} className="gap-1.5"><Send className="size-4" /> Submit for approval</Button>
          ) : null}
        </>}
      >
        <div className="space-y-4">
          <ReturnedNote standing={standing} request={request} requestNamed={requestNamed} senderHint={RETURNED_HINT.resumeOnly} />
          <div className="grid grid-cols-2 gap-4">
            {!access.isHidden("amount") ? <DetailField label="Amount"><Money kobo={transfer.amount} currency={currency} /></DetailField> : null}
            {!access.isHidden("status") ? <DetailField label="Status"><StatusPill {...sentBackPill(transfer, transfer.status, CREDIT_TRANSFER_STATUS[transfer.status], true)} /></DetailField> : null}
            {!access.isHidden("from_customer_name") ? <DetailField label="From">{transfer.from_customer_name} <span className="font-normal text-gray-05">{transfer.from_customer_code}</span></DetailField> : null}
            {!access.isHidden("to_customer_name") ? <DetailField label="To">{transfer.to_customer_name} <span className="font-normal text-gray-05">{transfer.to_customer_code}</span></DetailField> : null}
            {!access.isHidden("transfer_date") ? <DetailField label="Date">{dates.day(transfer.transfer_date)}</DetailField> : null}
            {branches.show ? <DetailField label="Branch">{branches.name(transfer.branch_id)}</DetailField> : null}
            {!access.isHidden("receipt_number") && transfer.receipt_number ? <DetailField label="Receipt to the new customer">{transfer.receipt_number}</DetailField> : null}
          </div>
          {!access.isHidden("reason") ? <DetailField label="Reason"><span className="font-normal">{transfer.reason || "-"}</span></DetailField> : null}
          {transfer.status === "DRAFT" || transfer.status === "PENDING_APPROVAL" ? (
            <Note>A credit transfer always needs a second person&apos;s approval. Nothing moves until it is approved.</Note>
          ) : null}
        </div>
      </DetailDrawer>
      <ConfirmActionModal
        open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "void" ? "Void this credit transfer?" : "Submit this credit transfer for approval?"}
        description={confirm === "void"
          ? `Returns the transferred credit to its source customer. Any bill it paid is reopened.`
          : `Sends ${transfer.document_number} for approval. Nothing moves until it is approved.`}
        confirmText={confirm === "void" ? "Void transfer" : "Submit"} destructive={confirm === "void"}
        loading={submitting || voiding} onConfirm={act}
      />
      {noApproverDialog}
    </>
  );
}
