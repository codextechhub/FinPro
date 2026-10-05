/**
 * Between Branches -> Inter-branch Transfers: the register of everything that
 * passed between two branches, and the money that moves between them.
 *
 * The register lists every transfer whose sending or receiving branch the
 * reader works in, filtered by stage, kind and branch pair. The filters live in
 * the page address (`?status=&kind=&branch=&counterparty=`), so a link from the
 * balances grid opens the transfers behind one pair, and two tabs can hold two
 * different views. `?document=<id>` opens one transfer, which is how the bank
 * split's result and an approval link land on it.
 *
 * Who may act follows the backend (see transfer-actions.ts): the receiving
 * branch asks for money and confirms it arrived, the sending branch sends or
 * declines what it was asked for, and only somebody in both branches voids.
 * Moving a customer's whole balance binds two branches' books and another
 * branch's lists, so it is offered only to a whole-school reader.
 */

import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import { ArrowRight, Ban, CheckCheck, HandCoins, Send, Users, XCircle } from "lucide-react";

import {
  BankAccountPicker, ConfirmActionModal, DataTable, DetailDrawer, FormDrawer, FormField, Money, MoneyInput,
  PostingDateField, RaisingBranchChoiceField, toArray, useRaisingBranchChoice, type Column,
} from "@/components/finance-ui";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { ErrorState, LoadingState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useSourceDocumentParam } from "@/lib/source-document-route";
import { formatMoney } from "@/utils/money";
import {
  useConfirmInterBranchArrivalMutation, useDeclineInterBranchRequestMutation, useGetInterBranchTransferQuery,
  useGetInterBranchTransfersQuery, useRequestInterBranchMoneyMutation, useSendInterBranchMoneyMutation,
  useSendRequestedTransferMutation, useVoidInterBranchTransferMutation,
} from "@/redux/services/finance/interbranch-api";
import type { InterBranchKind, InterBranchTransfer } from "@/redux/services/finance/interbranch-types";
import { useDates } from "../../../lib/display-prefs";
import { heldReceiptLink, rechargeLink } from "./links";
import { MoveBalanceDrawer } from "./move-balance-drawer";
import { BranchSelect, Fact, Note, StagePill } from "./parts";
import {
  KIND_LABELS, MONEY_KINDS, STATUS_FILTERS, isOpenRequest, transferActions, transferMeaning, voidBlockedByKind,
  voidConditions, voidReachNote, type TransferAction,
} from "./transfer-actions";
import type { InterBranchReader } from "./use-inter-branch";

const KIND_FILTERS = Object.entries(KIND_LABELS) as [InterBranchKind, string][];
const FILTER_KEYS = ["status", "kind", "branch", "counterparty"] as const;

/** The register's filters, read from and written to the page address. */
function useRegisterFilters() {
  const [params, setParams] = useSearchParams();
  const value = (key: (typeof FILTER_KEYS)[number]) => params.get(key) ?? "";
  const set = (key: (typeof FILTER_KEYS)[number], next: string) => {
    const copy = new URLSearchParams(params);
    if (next) copy.set(key, next); else copy.delete(key);
    if (key === "branch" && !next) copy.delete("counterparty");
    setParams(copy, { replace: true });
  };
  return { value, set };
}

export function TransfersTab({ entity, currency, reader }: { entity: string; currency?: string | null; reader: InterBranchReader }) {
  const dates = useDates();
  const filters = useRegisterFilters();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [form, setForm] = useState<null | "send" | "request" | "move">(null);
  useSourceDocumentParam(setOpenId);

  const branch = filters.value("branch");
  const counterparty = filters.value("counterparty");
  const { data, isLoading, isFetching, isError, refetch } = useGetInterBranchTransfersQuery({
    entity, page, page_size: 25,
    status: filters.value("status") || undefined,
    kind: filters.value("kind") || undefined,
    branch: branch ? Number(branch) : undefined,
    counterparty: branch && counterparty ? Number(counterparty) : undefined,
  });
  const rows = toArray(data?.data);
  const setFilter = (key: (typeof FILTER_KEYS)[number], next: string) => { setPage(1); filters.set(key, next); };

  const columns: Column<InterBranchTransfer>[] = [
    { header: "Number", cell: (t) => <span className="font-semibold tabular-nums text-gray-01">{t.document_number || `#${t.id}`}</span> },
    { header: "Date", cell: (t) => <span className="tabular-nums text-gray-05">{dates.day(t.transfer_date, t.branch_id)}</span> },
    { header: "What", cell: (t) => KIND_LABELS[t.kind] ?? t.kind_label },
    { header: "From", cell: (t) => t.branch_name },
    { header: "To", cell: (t) => t.to_branch_name },
    { header: "Amount", align: "right", cell: (t) => <Money kobo={t.amount} currency={currency} align="right" /> },
    { header: "Stage", cell: (t) => <StagePill transfer={t} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={filters.value("status")} onChange={(e) => setFilter("status", e.target.value)} aria-label="Stage">
            {STATUS_FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </NativeSelect>
          <NativeSelect value={filters.value("kind")} onChange={(e) => setFilter("kind", e.target.value)} aria-label="Kind">
            <option value="">Any kind</option>
            {KIND_FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </NativeSelect>
          <BranchSelect label="Branch" branches={reader.branches} value={branch} onChange={(v) => setFilter("branch", v)} placeholder="Any branch" allowEmpty />
          {branch ? (
            <BranchSelect
              label="With branch" placeholder="With any branch" allowEmpty
              branches={reader.branches.filter((b) => String(b.id) !== branch)}
              value={counterparty} onChange={(v) => setFilter("counterparty", v)}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {reader.keys.request ? (
            <Button variant="outline" onClick={() => setForm("request")} className="gap-1.5"><HandCoins className="size-4" /> Ask for money</Button>
          ) : null}
          {reader.keys.transfer && reader.reach.wholeSchool ? (
            <Button variant="outline" onClick={() => setForm("move")} className="gap-1.5"><Users className="size-4" /> Move a customer's balance</Button>
          ) : null}
          {reader.keys.transfer ? (
            <Button onClick={() => setForm("send")} className="gap-1.5"><Send className="size-4" /> Send money</Button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(t) => t.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch}
        onRowClick={(t) => setOpenId(t.id)}
        page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage}
        emptyTitle="No transfers"
        emptyMessage={FILTER_KEYS.some((k) => filters.value(k)) ? "Nothing matches these filters." : "Money sent or asked for between branches appears here."}
      />

      <TransferDrawer id={openId} entity={entity} currency={currency} reader={reader} onClose={() => setOpenId(null)} />
      {form === "send" ? <SendMoneyDrawer entity={entity} currency={currency} reader={reader} onClose={() => setForm(null)} onSent={setOpenId} /> : null}
      {form === "request" ? <RequestMoneyDrawer entity={entity} currency={currency} reader={reader} onClose={() => setForm(null)} onSent={setOpenId} /> : null}
      {form === "move" ? <MoveBalanceDrawer entity={entity} currency={currency} reader={reader} onClose={() => setForm(null)} onOpenTransfer={setOpenId} /> : null}
    </div>
  );
}

function TransferDrawer({ id, entity, currency, reader, onClose }: {
  id: number | null; entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void;
}) {
  const dates = useDates();
  const { data, isLoading, isError, refetch } = useGetInterBranchTransferQuery(id ? { id, entity } : skipToken);
  const t = id ? data?.data : undefined;
  const [action, setAction] = useState<TransferAction | null>(null);
  const money = (kobo: number) => formatMoney(kobo, currency);
  const actions = t ? transferActions(t, reader.keys, reader.reach) : [];
  const blocked = t && t.status === "POSTED" ? voidBlockedByKind(t) : null;
  const reachNote = t ? voidReachNote(t, reader.keys, reader.reach) : null;

  return (
    <>
      <DetailDrawer
        open={id != null} onOpenChange={(o) => (o ? undefined : onClose())}
        title={t ? (t.document_number || `Transfer #${t.id}`) : "Transfer"}
        description={t ? `${KIND_LABELS[t.kind] ?? t.kind_label} · ${t.branch_name} to ${t.to_branch_name}` : undefined}
        widthClass="sm:max-w-xl"
        footer={t && actions.length ? (
          <div className="flex w-full flex-wrap justify-end gap-2">
            {actions.includes("void") ? (
              <Button variant="outline" onClick={() => setAction("void")} className="gap-1.5 text-destructive hover:text-destructive"><Ban className="size-4" /> Void</Button>
            ) : null}
            {actions.includes("decline") ? (
              <Button variant="outline" onClick={() => setAction("decline")} className="gap-1.5"><XCircle className="size-4" /> Decline</Button>
            ) : null}
            {actions.includes("confirm") ? (
              <Button onClick={() => setAction("confirm")} className="gap-1.5"><CheckCheck className="size-4" /> Confirm it arrived</Button>
            ) : null}
            {actions.includes("send") ? (
              <Button onClick={() => setAction("send")} className="gap-1.5"><Send className="size-4" /> Send</Button>
            ) : null}
          </div>
        ) : undefined}
      >
        {isLoading ? <LoadingState rows={6} /> : isError || !t ? <ErrorState onRetry={refetch} /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StagePill transfer={t} />
              <Money kobo={t.amount} currency={currency} className="text-lg font-semibold" />
            </div>
            <Note>{transferMeaning(t, money)}</Note>
            <dl className="grid grid-cols-1 gap-3 rounded-md border border-white-02 p-4 sm:grid-cols-2">
              <Fact label="From">{t.branch_name}</Fact>
              <Fact label="To">{t.to_branch_name}</Fact>
              <Fact label="Date">{dates.day(t.transfer_date, t.branch_id)}</Fact>
              <Fact label="Purpose">{t.purpose || "-"}</Fact>
              {t.from_bank_account_name ? <Fact label="Paid from">{t.from_bank_account_name}</Fact> : null}
              {t.to_bank_account_name ? <Fact label="Paid into">{t.to_bank_account_name}</Fact> : null}
              {t.customer_name ? <Fact label="Customer">{t.customer_name}</Fact> : null}
              {t.reference ? <Fact label="Reference">{t.reference}</Fact> : null}
              {t.repay_by ? <Fact label="Repay by">{dates.day(t.repay_by)}</Fact> : null}
              {t.requested_at ? <Fact label="Asked for">{dates.dateTime(t.requested_at, t.to_branch_id)}</Fact> : null}
              {t.sent_at ? <Fact label="Sent">{dates.dateTime(t.sent_at, t.branch_id)}</Fact> : null}
              {t.arrival_date ? <Fact label="Arrived">{dates.day(t.arrival_date, t.to_branch_id)}</Fact> : null}
              {t.declined_at ? <Fact label="Declined">{`${dates.dateTime(t.declined_at, t.branch_id)}${t.decline_reason ? `: ${t.decline_reason}` : ""}`}</Fact> : null}
            </dl>
            {t.journals.length ? (
              <section className="space-y-1.5">
                <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Journals</p>
                <ul className="space-y-1">
                  {t.journals.map((leg) => (
                    <li key={leg.role} className="font-mont text-xs text-gray-01">
                      {reader.nameOf(leg.branch_id)}: {leg.journal_id ? `journal #${leg.journal_id}` : leg.role === "RECEIVING" && t.receipt_id ? `receipt #${t.receipt_id}` : "the adjusting document's own journal"}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {t.held_receipt_id ? (
              <Link to={heldReceiptLink(t.held_receipt_id)} className="inline-flex items-center gap-1 font-mont text-xs font-medium text-primary hover:underline">
                Open the held receipt <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
            {t.recharge_id ? (
              <Link to={rechargeLink(t.recharge_id)} className="inline-flex items-center gap-1 font-mont text-xs font-medium text-primary hover:underline">
                Open the recharge <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
            {isOpenRequest(t) && !actions.includes("send") ? (
              <Note>{`Waiting for ${t.branch_name} to send it or decline it.`}</Note>
            ) : null}
            {t.status === "POSTED" && !t.received_at && MONEY_KINDS.includes(t.kind) && !actions.includes("confirm") ? (
              <Note>{`Waiting for ${t.to_branch_name} to confirm the money arrived.`}</Note>
            ) : null}
            {blocked ? <Note tone="warn">{blocked}</Note> : null}
            {reachNote ? <Note tone="warn">{reachNote}</Note> : null}
          </div>
        )}
      </DetailDrawer>

      {t && action === "send" ? <SendRequestedDrawer transfer={t} entity={entity} currency={currency} reader={reader} onClose={() => setAction(null)} /> : null}
      {t && action === "decline" ? <DeclineDialog transfer={t} entity={entity} currency={currency} onClose={() => setAction(null)} /> : null}
      {t && action === "confirm" ? <ConfirmArrivalDialog transfer={t} entity={entity} currency={currency} onClose={() => setAction(null)} /> : null}
      {t && action === "void" ? <VoidTransferDialog transfer={t} entity={entity} currency={currency} onClose={() => setAction(null)} /> : null}
    </>
  );
}

/** The receiving branch's account, picked by a whole-school reader; anyone else
 *  leaves it to the receiving branch's collection account. */
function ReceivingAccountField({ entity, reader, branchId, value, onChange }: {
  entity: string; reader: InterBranchReader; branchId: number | undefined; value: string; onChange: (v: string) => void;
}) {
  if (!branchId) return null;
  if (!reader.reach.covers([branchId])) {
    return <Note>{`The money lands in ${reader.nameOf(branchId)}'s collection account.`}</Note>;
  }
  return (
    <FormField label="Paid into">
      <BankAccountPicker entity={entity} value={value} onChange={onChange} documentBranchId={branchId} placeholder="Its collection account" />
    </FormField>
  );
}

function SendMoneyDrawer({ entity, currency, reader, onClose, onSent }: {
  entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void; onSent: (id: number) => void;
}) {
  const sending = useRaisingBranchChoice();
  const [fromAccount, setFromAccount] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [repayBy, setRepayBy] = useState("");
  const [reference, setReference] = useState("");
  const [send, { isLoading }] = useSendInterBranchMoneyMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "inter-branch transfer" });
  const others = reader.branches.filter((b) => b.id !== sending.branchId);
  const canSubmit = sending.ready && !!fromAccount && !!toBranch && amount > 0 && !!purpose.trim();

  const pickSending = (next: string) => { sending.setValue(next); setFromAccount(""); if (next === toBranch) setToBranch(""); };
  const submit = async () => {
    try {
      const res = await send({
        entity, from_bank_account: Number(fromAccount), to_branch: Number(toBranch),
        to_bank_account: toAccount ? Number(toAccount) : undefined, amount,
        transfer_date: date || undefined, purpose: purpose.trim(), repay_by: repayBy || undefined,
        reference: reference.trim() || undefined,
      }).unwrap();
      toast.success(res.message || "Transfer sent.");
      promptIfParked(res.data?.approval);
      if (res.data?.id) onSent(res.data.id);
      onClose();
    } catch { /* central */ }
  };

  return (
    <>
      <FormDrawer
        open onOpenChange={(o) => !o && onClose()} title="Send money to another branch"
        description="It follows the sending branch's approval route, and the receiving branch confirms it arrived."
        onSubmit={submit} submitText={amount > 0 ? `Send ${formatMoney(amount, currency)}` : "Send"} loading={isLoading} canSubmit={canSubmit}
      >
        <RaisingBranchChoiceField choice={{ ...sending, setValue: pickSending }} label="Sending branch" />
        <FormField label="Paid from" required>
          <BankAccountPicker entity={entity} value={fromAccount} onChange={setFromAccount} documentBranchId={sending.branchId} />
        </FormField>
        <FormField label="To branch" required>
          <BranchSelect label="To branch" branches={others} value={toBranch} onChange={(v) => { setToBranch(v); setToAccount(""); }} />
        </FormField>
        <ReceivingAccountField entity={entity} reader={reader} branchId={toBranch ? Number(toBranch) : undefined} value={toAccount} onChange={setToAccount} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
        <FormField label="What it is for" required><Input value={purpose} maxLength={255} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Salaries shortfall" className="h-9 bg-white" /></FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Repay by"><DatePickerInput value={repayBy} onChange={(e) => setRepayBy(e.target.value)} className="bg-white" /></FormField>
          <FormField label="Reference"><Input value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} className="h-9 bg-white" /></FormField>
        </div>
      </FormDrawer>
      {noApproverDialog}
    </>
  );
}

function RequestMoneyDrawer({ entity, currency, reader, onClose, onSent }: {
  entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void; onSent: (id: number) => void;
}) {
  const asking = useRaisingBranchChoice();
  const [fromBranch, setFromBranch] = useState("");
  const [amount, setAmount] = useState(0);
  const [purpose, setPurpose] = useState("");
  const [repayBy, setRepayBy] = useState("");
  const [account, setAccount] = useState("");
  const [request, { isLoading }] = useRequestInterBranchMoneyMutation();
  const others = reader.branches.filter((b) => b.id !== asking.branchId);
  const canSubmit = asking.ready && !!fromBranch && amount > 0 && !!purpose.trim();

  const submit = async () => {
    try {
      const res = await request({
        entity, from_branch: Number(fromBranch), amount, purpose: purpose.trim(),
        repay_by: repayBy || undefined, to_bank_account: account ? Number(account) : undefined,
        ...asking.body("to_branch"),
      }).unwrap();
      toast.success(res.message || "Request sent.");
      if (res.data?.id) onSent(res.data.id);
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !o && onClose()} title="Ask another branch for money"
      description="Nothing is booked until the branch you ask sends it."
      onSubmit={submit} submitText="Ask" loading={isLoading} canSubmit={canSubmit}
    >
      <RaisingBranchChoiceField choice={{ ...asking, setValue: (v) => { asking.setValue(v); setAccount(""); if (v === fromBranch) setFromBranch(""); } }} label="Your branch" />
      <FormField label="Ask branch" required>
        <BranchSelect label="Ask branch" branches={others} value={fromBranch} onChange={setFromBranch} />
      </FormField>
      <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
      <FormField label="What it is for" required><Input value={purpose} maxLength={255} onChange={(e) => setPurpose(e.target.value)} className="h-9 bg-white" /></FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Paid into">
          <BankAccountPicker entity={entity} value={account} onChange={setAccount} documentBranchId={asking.branchId} placeholder="Your collection account" />
        </FormField>
        <FormField label="Repay by"><DatePickerInput value={repayBy} onChange={(e) => setRepayBy(e.target.value)} className="bg-white" /></FormField>
      </div>
    </FormDrawer>
  );
}

function SendRequestedDrawer({ transfer, entity, currency, reader, onClose }: {
  transfer: InterBranchTransfer; entity: string; currency?: string | null; reader: InterBranchReader; onClose: () => void;
}) {
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState(transfer.to_bank_account_id ? String(transfer.to_bank_account_id) : "");
  const [date, setDate] = useState("");
  const [send, { isLoading }] = useSendRequestedTransferMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "inter-branch transfer" });

  const submit = async () => {
    try {
      const res = await send({
        id: transfer.id, entity, from_bank_account: Number(fromAccount),
        to_bank_account: toAccount ? Number(toAccount) : undefined, transfer_date: date || undefined,
      }).unwrap();
      toast.success(res.message || "Transfer sent.");
      promptIfParked(res.data?.approval);
      onClose();
    } catch { /* central */ }
  };

  return (
    <>
      <FormDrawer
        open onOpenChange={(o) => !o && onClose()}
        title={`Send ${formatMoney(transfer.amount, currency)} to ${transfer.to_branch_name}`}
        description={transfer.purpose}
        onSubmit={submit} submitText="Send" loading={isLoading} canSubmit={!!fromAccount}
      >
        <FormField label="Paid from" required>
          <BankAccountPicker entity={entity} value={fromAccount} onChange={setFromAccount} documentBranchId={transfer.branch_id} />
        </FormField>
        {transfer.to_bank_account_name && !reader.reach.covers([transfer.to_branch_id]) ? (
          <Note>{`The money lands in ${transfer.to_bank_account_name}, the account ${transfer.to_branch_name} asked for.`}</Note>
        ) : (
          <ReceivingAccountField entity={entity} reader={reader} branchId={transfer.to_branch_id} value={toAccount} onChange={setToAccount} />
        )}
        <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
      </FormDrawer>
      {noApproverDialog}
    </>
  );
}

function DeclineDialog({ transfer, entity, currency, onClose }: {
  transfer: InterBranchTransfer; entity: string; currency?: string | null; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [decline, { isLoading }] = useDeclineInterBranchRequestMutation();
  const submit = async () => {
    try {
      const res = await decline({ id: transfer.id, entity, reason: reason.trim() || undefined }).unwrap();
      toast.success(res.message || "Request declined.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()} loading={isLoading} onConfirm={submit}
      title={`Decline ${transfer.to_branch_name}'s request?`}
      description={`${transfer.to_branch_name} asked for ${formatMoney(transfer.amount, currency)}. Nothing was booked, so nothing is reversed.`}
      confirmText="Decline request" destructive
    >
      <FormField label="Reason">
        <Input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder={`Tell ${transfer.to_branch_name} why`} className="h-9 bg-white" />
      </FormField>
    </ConfirmActionModal>
  );
}

function ConfirmArrivalDialog({ transfer, entity, currency, onClose }: {
  transfer: InterBranchTransfer; entity: string; currency?: string | null; onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [confirm, { isLoading }] = useConfirmInterBranchArrivalMutation();
  const submit = async () => {
    try {
      const res = await confirm({ id: transfer.id, entity, arrival_date: date || undefined }).unwrap();
      toast.success(res.message || "Arrival confirmed.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()} loading={isLoading} onConfirm={submit}
      title={`Confirm ${formatMoney(transfer.amount, currency)} arrived?`}
      description={`${transfer.branch_name} sent it${transfer.to_bank_account_name ? ` to ${transfer.to_bank_account_name}` : ""}. Both books already hold it; this is ${transfer.to_branch_name}'s word that the bank received it.`}
      confirmText="Confirm it arrived"
    >
      <FormField label="Arrived on">
        <DatePickerInput value={date} min={transfer.transfer_date} onChange={(e) => setDate(e.target.value)} className="bg-white" />
      </FormField>
      <p className="mt-1 font-mont text-[11px] text-gray-05">Leave it empty for today.</p>
    </ConfirmActionModal>
  );
}

function VoidTransferDialog({ transfer, entity, currency, onClose }: {
  transfer: InterBranchTransfer; entity: string; currency?: string | null; onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [voidTransfer, { isLoading }] = useVoidInterBranchTransferMutation();
  const submit = async () => {
    try {
      const res = await voidTransfer({ id: transfer.id, entity, date: date || undefined }).unwrap();
      toast.success(res.message || "Transfer voided.");
      onClose();
    } catch { /* central */ }
  };
  return (
    <ConfirmActionModal
      open onOpenChange={(o) => !o && onClose()} loading={isLoading} onConfirm={submit} destructive
      title={`Void ${transfer.document_number}?`}
      description={`${formatMoney(transfer.amount, currency)} between ${transfer.branch_name} and ${transfer.to_branch_name}. ${voidConditions(transfer)}`}
      confirmText="Void transfer"
    >
      <FormField label="Date the reversal">
        <DatePickerInput value={date} onChange={(e) => setDate(e.target.value)} className="bg-white" />
      </FormField>
      <p className="mt-1 font-mont text-[11px] text-gray-05">Leave it empty to reverse on each journal's own date.</p>
    </ConfirmActionModal>
  );
}
