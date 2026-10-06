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
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Plus, Send } from "lucide-react";
import {
  ConfirmActionModal, CustomerPicker, DataTable, DetailDrawer, FormField, Money, MoneyInput,
  PostingDateField, RaisingBranchChoiceField, StatusPill, customerBranchHint, toArray,
  useCustomerBranch, useRaisingBranchChoice, type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
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
import { DetailField, Note, useBranchColumn } from "./fees-parts";
import { ListBranchSelect, listBranchArg, useListBranch } from "./list-branch";
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
  const { can } = useCan();
  const branches = useBranchColumn();
  const list = useListBranch();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CustomerCreditTransfer | null>(null);
  const params = useMemo(() => ({ entity, page, ...(status ? { status } : {}), ...listBranchArg(list.view) }), [entity, page, status, list.view]);
  const { data, isLoading, isFetching, isError, refetch } = useGetCreditTransfersQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const open = selected ? rows.find((r) => r.id === selected.id) ?? selected : null;

  const columns: Column<CustomerCreditTransfer>[] = [
    { header: "Ref", cell: (t) => <span className="font-semibold tabular-nums">{t.document_number}</span> },
    { header: "From", cell: (t) => <span className="font-medium text-gray-01">{t.from_customer_name}</span> },
    { header: "To", cell: (t) => <span className="font-medium text-gray-01">{t.to_customer_name}</span> },
    ...(branches.show && list.view.selected === "all" ? [{ header: "Branch", cell: (t: CustomerCreditTransfer) => branches.name(t.branch_id) }] : []),
    { header: "Amount", align: "right", cell: (t) => <Money kobo={t.amount} currency={currency} align="right" /> },
    { header: "Date", cell: (t) => <span className="tabular-nums">{dates.day(t.transfer_date)}</span> },
    { header: "Status", cell: (t) => <StatusPill status={t.status} label={CREDIT_TRANSFER_STATUS[t.status]} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls} aria-label="Status">
            <option value="">All statuses</option>
            {FILTER_STATUSES.map((code) => <option key={code} value={code}>{CREDIT_TRANSFER_STATUS[code]}</option>)}
          </select>
          <ListBranchSelect view={list.view} onChange={(v) => { setPage(1); list.choose(v); }} />
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

/** The credit a customer holds that a transfer may move, summed across the branches the reader sees. */
function useAvailableCredit(entity: string, customer: string) {
  const { data, isFetching } = useGetRefundAvailabilityQuery(
    { entity, search: customer, page_size: 50 }, { skip: !customer },
  );
  const rows = toArray(data?.data).filter((r) => r.customer_code === customer);
  return { amount: rows.reduce((sum, r) => sum + r.refundable_credit, 0), known: !!customer && !isFetching };
}

function NewTransferDrawer({ open, onClose, entity, currency }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null;
}) {
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
  const ready = !!from && !!to && from !== to && amount > 0 && !!date && reason.trim() !== "" && branch.ready;

  const reset = () => { setFrom(""); setTo(""); setAmount(0); setDate(""); setReason(""); branch.reset(); };
  const close = () => { reset(); onClose(); };
  const save = async (send: boolean) => {
    try {
      const res = await create({
        entity, from_customer: from, to_customer: to, amount, transfer_date: date,
        reason: reason.trim(), ...branch.body(),
      }).unwrap();
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
          <FormField label="From customer" required><CustomerPicker entity={entity} value={from} onChange={setFrom} /></FormField>
          <FormField label="To customer" required><CustomerPicker entity={entity} value={to} onChange={setTo} /></FormField>
        </div>
        {from && to && from === to ? <p className="font-mont text-[11px] text-destructive">Choose a different customer to receive the credit.</p> : null}
        {from && credit.known ? (
          <p className="font-mont text-xs text-gray-05">Unused credit available: <span className="font-semibold tabular-nums text-gray-01">{formatMoney(credit.amount, currency)}</span></p>
        ) : null}
        <RaisingBranchChoiceField choice={branch} hint={customerBranchHint(fromBranch)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} /></FormField>
          <PostingDateField label="Transfer date" entity={entity} value={date} onChange={setDate} />
        </div>
        <FormField label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="e.g. Family asked for Tunde's overpayment to pay Ada's fees" className="bg-white" />
        </FormField>
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
  const { can } = useCan();
  const branches = useBranchColumn();
  const [confirm, setConfirm] = useState<"submit" | "void" | null>(null);
  const [submit, { isLoading: submitting }] = useSubmitCreditTransferMutation();
  const [voidTransfer, { isLoading: voiding }] = useVoidCreditTransferMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "credit transfer" });
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
        description={`${transfer.from_customer_name} to ${transfer.to_customer_name}`}
        widthClass="sm:max-w-lg"
        footer={<>
          {transfer.status === "POSTED" && can(P.FIN_REVERSE_CREDIT_TRANSFER) ? (
            <Button variant="outline" onClick={() => setConfirm("void")} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" /> Void</Button>
          ) : null}
          {transfer.status === "DRAFT" && can(P.FIN_SUBMIT_CREDIT_TRANSFER) ? (
            <Button onClick={() => setConfirm("submit")} className="gap-1.5"><Send className="size-4" /> Submit for approval</Button>
          ) : null}
        </>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="Amount"><Money kobo={transfer.amount} currency={currency} /></DetailField>
            <DetailField label="Status"><StatusPill status={transfer.status} label={CREDIT_TRANSFER_STATUS[transfer.status]} /></DetailField>
            <DetailField label="From">{transfer.from_customer_name} <span className="font-normal text-gray-05">{transfer.from_customer_code}</span></DetailField>
            <DetailField label="To">{transfer.to_customer_name} <span className="font-normal text-gray-05">{transfer.to_customer_code}</span></DetailField>
            <DetailField label="Date">{dates.day(transfer.transfer_date)}</DetailField>
            {branches.show ? <DetailField label="Branch">{branches.name(transfer.branch_id)}</DetailField> : null}
            {transfer.receipt_number ? <DetailField label="Receipt to the new customer">{transfer.receipt_number}</DetailField> : null}
          </div>
          <DetailField label="Reason"><span className="font-normal">{transfer.reason || "-"}</span></DetailField>
          {transfer.status === "DRAFT" || transfer.status === "PENDING_APPROVAL" ? (
            <Note>A credit transfer always needs a second person&apos;s approval. Nothing moves until it is approved.</Note>
          ) : null}
        </div>
      </DetailDrawer>
      <ConfirmActionModal
        open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "void" ? "Void this credit transfer?" : "Submit this credit transfer for approval?"}
        description={confirm === "void"
          ? `Gives ${formatMoney(transfer.amount, currency)} of credit back to ${transfer.from_customer_name}. Any bill of ${transfer.to_customer_name}'s it paid is reopened.`
          : `Sends ${transfer.document_number} for approval. Nothing moves until it is approved.`}
        confirmText={confirm === "void" ? "Void transfer" : "Submit"} destructive={confirm === "void"}
        loading={submitting || voiding} onConfirm={act}
      />
      {noApproverDialog}
    </>
  );
}
