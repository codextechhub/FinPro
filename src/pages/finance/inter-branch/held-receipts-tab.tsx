/**
 * Between Branches -> Held Receipts: money one branch collected for another.
 *
 * Mr Okafor pays N300,000 at Ikeja's desk for Emeka's Lekki bill. Ikeja cannot
 * settle a Lekki bill, so it records the money as held for Lekki (booked to
 * Held for other branches, 2190). Forwarding it sends the money to Lekki through
 * Ikeja's approval route, as a cash transfer goes; at Lekki it becomes a receipt
 * against Mr Okafor and settles the bill there.
 *
 * The branch that received the money records, forwards and voids it. A receipt
 * already being forwarded cannot be voided: the transfer is voided first.
 * `?document=<id>` opens one receipt, which is how a transfer links here.
 */

import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import { ArrowRight, Ban, Forward, Plus } from "lucide-react";

import {
  BankAccountPicker, ConfirmActionModal, CustomerPicker, DataTable, DetailDrawer, FormDrawer, FormField, Money,
  MoneyInput, PostingDateField, RaisingBranchChoiceField, toArray, useRaisingBranchChoice, type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { ErrorState, LoadingState } from "@/components/finance-ui/states";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useSourceDocumentParam } from "@/lib/source-document-route";
import { formatMoney } from "@/utils/money";
import {
  useForwardHeldReceiptMutation, useGetHeldReceiptQuery, useGetHeldReceiptsQuery, useRecordHeldReceiptMutation, useVoidHeldReceiptMutation,
} from "@/redux/services/finance/interbranch-api";
import type { HeldReceipt } from "@/redux/services/finance/interbranch-types";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import { transferLink } from "./links";
import { BranchSelect, Fact, Note, TonePill } from "./parts";
import type { InterBranchReader } from "./use-inter-branch";

const METHODS = [
  ["BANK_TRANSFER", "Bank transfer"], ["CASH", "Cash"], ["CARD", "Card"],
  ["CHEQUE", "Cheque"], ["ONLINE", "Online"], ["OTHER", "Other"],
] as const;

/** What the reader may do with a held receipt, as the server decides it. */
export function heldActions(h: HeldReceipt, { canForward, canVoid, covers }: {
  canForward: boolean; canVoid: boolean; covers: (ids: number[]) => boolean;
}): { forward: boolean; void: boolean } {
  const open = h.status === "POSTED" && !h.forwarded_by;
  const own = covers([h.branch_id]);
  return { forward: open && own && canForward, void: open && own && canVoid };
}

function HeldStatus({ h }: { h: HeldReceipt }) {
  if (h.status === "REVERSED") return <TonePill tone="closed">Voided</TonePill>;
  if (h.forwarded_by) {
    return <TonePill tone={h.forwarded_by.status === "POSTED" ? "good" : "waiting"}>{h.forwarded_by.status === "POSTED" ? "Forwarded" : "Forwarding"}</TonePill>;
  }
  return <TonePill tone="waiting">Held</TonePill>;
}

export function HeldReceiptsTab({ entity, currency, reader }: { entity: string; currency?: string | null; reader: InterBranchReader }) {
  const dates = useDates();
  const { can } = useCan();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  useSourceDocumentParam(setOpen);
  const { data, isLoading, isFetching, isError, refetch } = useGetHeldReceiptsQuery({ entity, status: status || undefined, page, page_size: 25 });
  const rows = toArray(data?.data);

  const columns: Column<HeldReceipt>[] = [
    { header: "Number", cell: (h) => <span className="font-semibold tabular-nums text-gray-01">{h.document_number}</span> },
    { header: "Date", cell: (h) => <span className="tabular-nums text-gray-05">{dates.day(h.receipt_date, h.branch_id)}</span> },
    { header: "Collected at", cell: (h) => h.branch_name },
    { header: "For", cell: (h) => h.for_branch_name },
    { header: "Customer", cell: (h) => h.customer_name },
    { header: "Amount", align: "right", cell: (h) => <Money kobo={h.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (h) => <HeldStatus h={h} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">Held, forwarded and voided</option>
          <option value="POSTED">Held or forwarded</option>
          <option value="REVERSED">Voided</option>
        </NativeSelect>
        {can(P.FIN_RECORD_PAYMENT) ? (
          <Button onClick={() => setRecording(true)} className="gap-1.5"><Plus className="size-4" /> Record money for another branch</Button>
        ) : null}
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(h) => h.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={(h) => setOpen(h.id)}
        page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage}
        emptyTitle="No held receipts" emptyMessage="Money a branch collects for another branch's bills shows here."
      />
      <HeldReceiptDrawer id={open} entity={entity} currency={currency} reader={reader} onClose={() => setOpen(null)} />
      {recording ? <RecordHeldDrawer entity={entity} currency={currency} reader={reader} onClose={() => setRecording(false)} /> : null}
    </div>
  );
}

function HeldReceiptDrawer({ id, entity, currency, reader, onClose }: {
  id: number | null; entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void;
}) {
  const dates = useDates();
  const { data, isLoading, isError, refetch } = useGetHeldReceiptQuery(id ? { id, entity } : skipToken);
  const held = id ? data?.data ?? null : null;
  const { can } = useCan();
  const [action, setAction] = useState<null | "forward" | "void">(null);
  const allowed = held
    ? heldActions(held, { canForward: reader.keys.transfer, canVoid: can(P.FIN_REVERSE_PAYMENT), covers: reader.reach.covers })
    : { forward: false, void: false };

  return (
    <>
      <DetailDrawer
        open={id != null} onOpenChange={(o) => (o ? undefined : onClose())}
        title={held?.document_number ?? "Held receipt"}
        description={held ? `Collected at ${held.branch_name} for ${held.for_branch_name}` : undefined}
        widthClass="sm:max-w-lg"
        footer={held && (allowed.forward || allowed.void) ? (
          <>
            {allowed.void ? <Button variant="outline" onClick={() => setAction("void")} className="gap-1.5 text-destructive hover:text-destructive"><Ban className="size-4" /> Void</Button> : null}
            {allowed.forward ? <Button onClick={() => setAction("forward")} className="gap-1.5"><Forward className="size-4" /> Forward to {held.for_branch_name}</Button> : null}
          </>
        ) : undefined}
      >
        {isLoading ? <LoadingState rows={5} /> : isError || !held ? <ErrorState onRetry={refetch} /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <HeldStatus h={held} />
              <Money kobo={held.amount} currency={currency} className="text-lg font-semibold" />
            </div>
            <dl className="grid grid-cols-1 gap-3 rounded-md border border-white-02 p-4 sm:grid-cols-2">
              <Fact label="Customer">{held.customer_name}</Fact>
              <Fact label="Received">{dates.day(held.receipt_date, held.branch_id)}</Fact>
              <Fact label="Into">{held.bank_account_name}</Fact>
              <Fact label="Method">{METHODS.find(([v]) => v === held.method)?.[1] ?? held.method}</Fact>
              {held.reference ? <Fact label="Reference">{held.reference}</Fact> : null}
              {held.narration ? <Fact label="Note">{held.narration}</Fact> : null}
            </dl>
            {held.forwarded_by ? (
              <div className="space-y-2">
                <Note>{`Forwarded by ${held.forwarded_by.document_number}. To void this receipt, void that transfer first.`}</Note>
                <Link to={transferLink(held.forwarded_by.id)} className="inline-flex items-center gap-1 font-mont text-xs font-medium text-primary hover:underline">
                  Open the transfer <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ) : held.status === "POSTED" ? (
              <Note>{`${held.branch_name} holds this for ${held.for_branch_name} (Held for other branches). ${held.for_branch_name}'s bill is settled once it is forwarded.`}</Note>
            ) : null}
          </div>
        )}
      </DetailDrawer>
      {held && action === "forward" ? <ForwardDrawer held={held} entity={entity} currency={currency} reader={reader} onClose={() => setAction(null)} /> : null}
      {held && action === "void" ? <VoidHeldDialog held={held} entity={entity} currency={currency} onClose={() => setAction(null)} /> : null}
    </>
  );
}

function ForwardDrawer({ held, entity, currency, reader, onClose }: {
  held: HeldReceipt; entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void;
}) {
  const [toAccount, setToAccount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [date, setDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [forward, { isLoading }] = useForwardHeldReceiptMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "forwarded receipt" });
  const submit = async () => {
    try {
      const res = await forward({
        id: held.id, entity, to_bank_account: toAccount ? Number(toAccount) : undefined,
        from_bank_account: fromAccount ? Number(fromAccount) : undefined, transfer_date: date || undefined,
        purpose: purpose.trim() || undefined,
      }).unwrap();
      toast.success(res.message || "Receipt forwarded.");
      promptIfParked(res.data?.approval);
      onClose();
    } catch { /* central */ }
  };
  return (
    <>
      <FormDrawer
        open onOpenChange={(o) => !o && onClose()}
        title={`Forward ${formatMoney(held.amount, currency)} to ${held.for_branch_name}`}
        description="It follows the approval route for money sent between branches. Once sent, it settles the customer's bills there."
        onSubmit={submit} submitText="Forward" loading={isLoading}
      >
        <FormField label="Paid from">
          <BankAccountPicker entity={entity} value={fromAccount} onChange={setFromAccount} documentBranchId={held.branch_id} placeholder={held.bank_account_name} />
        </FormField>
        {reader.reach.covers([held.for_branch_id]) ? (
          <FormField label="Paid into">
            <BankAccountPicker entity={entity} value={toAccount} onChange={setToAccount} documentBranchId={held.for_branch_id} placeholder="Its collection account" />
          </FormField>
        ) : (
          <Note>{`The money lands in ${held.for_branch_name}'s collection account.`}</Note>
        )}
        <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        <FormField label="Note">
          <Input value={purpose} maxLength={255} onChange={(e) => setPurpose(e.target.value)} placeholder={`Forwarding ${held.customer_name}'s payment`} className="h-9 bg-white" />
        </FormField>
      </FormDrawer>
      {noApproverDialog}
    </>
  );
}

function VoidHeldDialog({ held, entity, currency, onClose }: {
  held: HeldReceipt; entity: string; currency?: string | null; onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [voidHeld, { isLoading }] = useVoidHeldReceiptMutation();
  const submit = async () => {
    try {
      const res = await voidHeld({ id: held.id, entity, date: date || undefined }).unwrap();
      toast.success(res.message || "Held receipt voided.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()} loading={isLoading} onConfirm={submit} destructive
      title={`Void ${held.document_number}?`}
      description={`Reverses the ${formatMoney(held.amount, currency)} ${held.branch_name} recorded for ${held.for_branch_name}. Refused while it is matched to a bank statement line.`}
      confirmText="Void receipt"
    >
      <FormField label="Date the reversal">
        <DatePickerInput value={date} onChange={(e) => setDate(e.target.value)} className="bg-white" />
      </FormField>
    </ConfirmActionModal>
  );
}

function RecordHeldDrawer({ entity, currency, reader, onClose }: {
  entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void;
}) {
  const collecting = useRaisingBranchChoice();
  const [bank, setBank] = useState("");
  const [forBranch, setForBranch] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [record, { isLoading }] = useRecordHeldReceiptMutation();
  const others = reader.branches.filter((b) => b.id !== collecting.branchId);
  const canListCustomers = !!forBranch && reader.reach.covers([Number(forBranch)]);
  const canSubmit = collecting.ready && !!bank && !!forBranch && !!customer.trim() && amount > 0 && !!date;

  const submit = async () => {
    try {
      const res = await record({
        entity, bank_account: Number(bank), for_branch: Number(forBranch), customer: customer.trim(),
        amount, receipt_date: date, method, reference: reference.trim() || undefined,
        narration: narration.trim() || undefined,
      }).unwrap();
      toast.success(res.message || "Held for the other branch.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !o && onClose()} title="Record money for another branch"
      description="Money paid into this branch's bank for another branch's bill. It is held until forwarded."
      onSubmit={submit} submitText={amount > 0 ? `Hold ${formatMoney(amount, currency)}` : "Hold"} loading={isLoading} canSubmit={canSubmit}
    >
      <RaisingBranchChoiceField choice={{ ...collecting, setValue: (v) => { collecting.setValue(v); setBank(""); if (v === forBranch) setForBranch(""); } }} label="Collected at" />
      <FormField label="Paid into" required>
        <BankAccountPicker entity={entity} value={bank} onChange={setBank} documentBranchId={collecting.branchId} />
      </FormField>
      <FormField label="For branch" required>
        <BranchSelect label="For branch" branches={others} value={forBranch} onChange={(v) => { setForBranch(v); setCustomer(""); }} />
      </FormField>
      <FormField label="Customer who paid" required>
        {canListCustomers
          ? <CustomerPicker entity={entity} value={customer} onChange={setCustomer} />
          : <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder={forBranch ? `Customer code at ${reader.nameOf(Number(forBranch))}` : "Choose the branch first"} disabled={!forBranch} className="h-9 bg-white" />}
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
        <PostingDateField label="Received on" entity={entity} value={date} onChange={setDate} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Method">
          <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
            {METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Reference"><Input value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} className="h-9 bg-white" /></FormField>
      </div>
      <FormField label="Note"><Input value={narration} maxLength={255} onChange={(e) => setNarration(e.target.value)} className="h-9 bg-white" /></FormField>
    </FormDrawer>
  );
}
