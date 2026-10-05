/**
 * Bank documents on the Bank Accounts screen: money in or out of a bank account
 * that is not a receipt, a bill or a payroll run (owner capital, a loan, drawings,
 * interest, charges), and money moved between two accounts of the same branch.
 *
 * Each document takes its bank account's branch and posts in that branch's books
 * through its own approval route. A bank ledger cannot be posted to by a
 * hand-typed journal, so these are how such money reaches it. Both can be voided
 * until a bank statement line is reconciled to them.
 *
 * Mrs Bello records N5,000,000 of new capital into Ikeja's current account and
 * moves N2,000,000 from it to Ikeja's savings account. At a school with several
 * branches an account not yet given a branch moves no money at all, because no
 * branch's bursar could see what passed through it; the form says so before the
 * server refuses. A transfer between two branches is an inter-branch transfer,
 * so the second account is offered only from the first one's branch.
 *
 * Each document says where it stands with its approval (`approval_state`), so
 * one rejected back to DRAFT reads Rejected rather than still waiting, and
 * names its branch as the server sent it.
 *
 * The section reads `?bank_document=transaction|transfer` and `?document=<id>`,
 * which is where an approval's link to a bank document lands.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Ban, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  AccountPicker, BankAccountPicker, ConfirmActionModal, DataTable, DetailDrawer, ErrorState, FormField, LoadingState,
  MoneyInput, PostingDateField, Segmented, StatusPill, TabStrip, toArray, useReaderBranchLens,
  type Column, type TabStripItem,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { formatMoney } from "@/utils/money";
import { P } from "../../permissions";
import { isForbidden } from "../../lib/api-errors";
import { useDates } from "../../lib/display-prefs";
import { SOURCE_DOCUMENT_ID_PARAM, sourceDocumentIdFromParams } from "@/lib/source-document-route";
import { useGetBankAccountsQuery } from "@/redux/services/finance/ops-api";
import {
  useCreateBankTransactionMutation, useCreateBankTransferMutation, useGetBankTransactionsQuery,
  useGetBankTransactionDocumentQuery, useGetBankTransferDocumentQuery,
  useGetBankTransfersQuery, useVoidBankTransactionMutation, useVoidBankTransferMutation,
} from "@/redux/services/finance/bank-documents-api";
import type { BankTransactionDirection, BankTransactionDocument, BankTransferDocument } from "@/redux/services/finance/bank-documents-types";
import { bankDocumentAccountProblem, bankDocumentApprovalNote, bankDocumentStatus } from "./bank-document-rules";
import { NO_BRANCH_YET } from "../../lib/branch-labels";

type Kind = "transaction" | "transfer";
const KIND_PARAM = "bank_document";

/** Whether branches mean anything here, and a document's branch by the name the server sent. */
function useBranchNames() {
  const { applies } = useReaderBranchLens();
  return {
    multiBranch: applies,
    name: (doc: { branch_id: number | null; branch_name?: string | null }) => (doc.branch_id == null ? NO_BRANCH_YET : doc.branch_name || "-"),
  };
}

export function BankDocumentsSection({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const [params, setParams] = useSearchParams();
  const canTransactions = can(P.FIN_VIEW_BANK_TRANSACTIONS);
  const canTransfers = can(P.FIN_VIEW_BANK_TRANSFERS);
  const asked = params.get(KIND_PARAM) === "transfer" ? "transfer" : "transaction";
  const kind: Kind = asked === "transfer" ? (canTransfers ? "transfer" : "transaction") : (canTransactions ? "transaction" : "transfer");
  const [creating, setCreating] = useState<Kind | null>(null);
  const linked = params.get(KIND_PARAM) ? sourceDocumentIdFromParams(params) : null;
  const [openId, setOpenId] = useState<number | null>(null);
  // An approval's link names a document; open it once, then drop it from the address.
  useEffect(() => {
    if (linked === null) return;
    setOpenId(linked);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(SOURCE_DOCUMENT_ID_PARAM);
      return next;
    }, { replace: true });
  }, [linked, setParams]);
  if (!canTransactions && !canTransfers) return null;
  const tabs: TabStripItem<Kind>[] = [
    ...(canTransactions ? [{ value: "transaction" as const, label: "Bank transactions" }] : []),
    ...(canTransfers ? [{ value: "transfer" as const, label: "Transfers between accounts" }] : []),
  ];
  const choose = (next: Kind) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set(KIND_PARAM, next);
    setParams(nextParams, { replace: true });
    setOpenId(null);
  };
  return <section className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")} aria-label="Bank documents">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4 py-2">
      <TabStrip items={tabs} value={kind} onChange={choose} variant="underline" ariaLabel="Bank documents" className="gap-5 border-b-0" buttonClassName="px-0 py-2" />
      <div className="flex flex-wrap gap-2">
        <Can permission={P.FIN_CREATE_BANK_TRANSACTION}><Button size="sm" variant="outline" onClick={() => setCreating("transaction")} className="gap-1.5"><Plus className="size-4" /> Bank transaction</Button></Can>
        <Can permission={P.FIN_CREATE_BANK_TRANSFER}><Button size="sm" variant="outline" onClick={() => setCreating("transfer")} className="gap-1.5"><ArrowLeftRight className="size-4" /> Bank transfer</Button></Can>
      </div>
    </div>
    {kind === "transaction"
      ? <TransactionsList entity={entity} currency={currency} openId={openId} onOpen={setOpenId} />
      : <TransfersList entity={entity} currency={currency} openId={openId} onOpen={setOpenId} />}
    {creating === "transaction" && <BankTransactionForm entity={entity} currency={currency} onClose={() => setCreating(null)} />}
    {creating === "transfer" && <BankTransferForm entity={entity} currency={currency} onClose={() => setCreating(null)} />}
  </section>;
}

function TransactionsList({ entity, currency, openId, onOpen }: { entity: string; currency?: string | null; openId: number | null; onOpen: (id: number | null) => void }) {
  const dates = useDates();
  const branches = useBranchNames();
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, error, refetch } = useGetBankTransactionsQuery({ entity, page });
  const rows = toArray(data?.data);
  const columns: Column<BankTransactionDocument>[] = [
    { header: "Document", cell: (t) => <span className="font-mont text-sm font-semibold text-primary">{t.document_number}</span> },
    { header: "Date", cell: (t) => dates.day(t.transaction_date, t.branch_id) },
    { header: "Bank account", cell: (t) => t.bank_account_name },
    ...(branches.multiBranch ? [{ header: "Branch", cell: (t: BankTransactionDocument) => branches.name(t) }] : []),
    { header: "Other side", cell: (t) => <span className="min-w-0"><span className="tabular-nums text-gray-05">{t.counter_account_code}</span> {t.counter_account_name}</span> },
    { header: "Amount", align: "right", cell: (t) => <span className={cn("inline-flex items-center gap-1 tabular-nums", t.direction === "IN" ? "text-green-01" : "text-black-01")}>{t.direction === "IN" ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}{formatMoney(t.amount, currency)}</span> },
    { header: "Status", cell: (t) => <StatusPill status={bankDocumentStatus(t)} /> },
  ];
  return <>
    <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(t) => onOpen(t.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No bank transactions" emptyMessage="Record capital, a loan, drawings, interest or charges here." />
    {openId !== null && <BankDocumentDrawer kind="transaction" id={openId} entity={entity} currency={currency} onClose={() => onOpen(null)} />}
  </>;
}

function TransfersList({ entity, currency, openId, onOpen }: { entity: string; currency?: string | null; openId: number | null; onOpen: (id: number | null) => void }) {
  const dates = useDates();
  const branches = useBranchNames();
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, error, refetch } = useGetBankTransfersQuery({ entity, page });
  const rows = toArray(data?.data);
  const columns: Column<BankTransferDocument>[] = [
    { header: "Document", cell: (t) => <span className="font-mont text-sm font-semibold text-primary">{t.document_number}</span> },
    { header: "Date", cell: (t) => dates.day(t.transfer_date, t.branch_id) },
    { header: "From", cell: (t) => t.from_account_name },
    { header: "To", cell: (t) => t.to_account_name },
    ...(branches.multiBranch ? [{ header: "Branch", cell: (t: BankTransferDocument) => branches.name(t) }] : []),
    { header: "Amount", align: "right", cell: (t) => <span className="tabular-nums">{formatMoney(t.amount, currency)}</span> },
    { header: "Status", cell: (t) => <StatusPill status={bankDocumentStatus(t)} /> },
  ];
  return <>
    <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(t) => onOpen(t.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No transfers" emptyMessage="Move money between two accounts of the same branch here." />
    {openId !== null && <BankDocumentDrawer kind="transfer" id={openId} entity={entity} currency={currency} onClose={() => onOpen(null)} />}
  </>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="font-mont text-[11px] text-gray-05">{label}</dt><dd className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value || "-"}</dd></div>;
}

/** One bank document, with Void while it stands. */
function BankDocumentDrawer({ kind, id, entity, currency, onClose }: {
  kind: Kind; id: number; entity: string; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const transactionQ = useGetBankTransactionDocumentQuery({ id, entity }, { skip: kind !== "transaction" });
  const transferQ = useGetBankTransferDocumentQuery({ id, entity }, { skip: kind !== "transfer" });
  const transaction = kind === "transaction" ? transactionQ.data?.data : undefined;
  const transfer = kind === "transfer" ? transferQ.data?.data : undefined;
  const loading = transactionQ.isLoading || transferQ.isLoading;
  const branches = useBranchNames();
  const [confirming, setConfirming] = useState(false);
  const [voidTransaction, { isLoading: voidingTransaction }] = useVoidBankTransactionMutation();
  const [voidTransfer, { isLoading: voidingTransfer }] = useVoidBankTransferMutation();
  const doc = kind === "transaction" ? transaction : transfer;
  const approvalNote = doc ? bankDocumentApprovalNote(doc) : null;
  const busy = voidingTransaction || voidingTransfer;
  const doVoid = async () => {
    if (!doc) return;
    try {
      const response = kind === "transaction"
        ? await voidTransaction({ id: doc.id, entity }).unwrap()
        : await voidTransfer({ id: doc.id, entity }).unwrap();
      toast.success(response.message || `${doc.document_number} voided.`);
      setConfirming(false);
    } catch { /* central: a reconciled bank line refuses the void */ }
  };
  return <>
    <DetailDrawer open onOpenChange={(open) => !open && onClose()} title={doc?.document_number || (kind === "transaction" ? "Bank transaction" : "Transfer")} description={kind === "transaction" ? "Money in or out of a bank account" : "Money between two accounts of one branch"} widthClass="sm:max-w-[560px]" footer={doc && doc.status === "POSTED" && <Can permission={kind === "transaction" ? P.FIN_REVERSE_BANK_TRANSACTION : P.FIN_REVERSE_BANK_TRANSFER}><Button variant="outline-dest" onClick={() => setConfirming(true)}><Ban className="size-4" /> Void</Button></Can>}>
      {loading ? <LoadingState rows={4} /> : !doc ? <ErrorState onRetry={kind === "transaction" ? transactionQ.refetch : transferQ.refetch} /> : <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
        <Field label="Status" value={<StatusPill status={bankDocumentStatus(doc)} />} />
        <Field label="Amount" value={formatMoney(doc.amount, currency)} />
        {transaction && <>
          <Field label="Date" value={dates.day(transaction.transaction_date, transaction.branch_id)} />
          <Field label="Direction" value={transaction.direction === "IN" ? "Money in" : "Money out"} />
          <Field label="Bank account" value={transaction.bank_account_name} />
          <Field label="Other side" value={`${transaction.counter_account_code} ${transaction.counter_account_name}`} />
        </>}
        {transfer && <>
          <Field label="Date" value={dates.day(transfer.transfer_date, transfer.branch_id)} />
          <Field label="From" value={transfer.from_account_name} />
          <Field label="To" value={transfer.to_account_name} />
        </>}
        {branches.multiBranch && <Field label="Branch" value={branches.name(doc)} />}
        <Field label="Reference" value={doc.reference} />
        <div className="sm:col-span-2"><Field label="Narration" value={doc.narration} /></div>
        {approvalNote && <p data-testid="bank-document-approval" className={cn("sm:col-span-2 rounded-md border px-3 py-2 font-mont text-xs", approvalNote.tone === "rejected" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-200 bg-amber-50 text-amber-900")}>{approvalNote.text}</p>}
      </dl>}
    </DetailDrawer>
    <ConfirmActionModal open={confirming} onOpenChange={setConfirming} title={`Void ${doc?.document_number}?`} description={kind === "transaction" ? "Reverses the money in or out. Refused once its bank line has been reconciled; unmatch the line first." : "Reverses both sides of the transfer. Refused while either side is reconciled; unmatch the line first."} confirmText="Void" destructive loading={busy} onConfirm={doVoid} />
  </>;
}

function BankTransactionForm({ entity, currency, onClose }: { entity: string; currency?: string | null; onClose: () => void }) {
  const { applies: multiBranch } = useReaderBranchLens();
  const { data: accountRows } = useGetBankAccountsQuery({ entity, page: 1 });
  const [bank, setBank] = useState("");
  const [direction, setDirection] = useState<BankTransactionDirection>("IN");
  const [amount, setAmount] = useState(0);
  const [counter, setCounter] = useState("");
  const [date, setDate] = useState("");
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [create, { isLoading }] = useCreateBankTransactionMutation();
  const account = toArray(accountRows?.data).find((a) => String(a.id) === bank);
  const problem = bankDocumentAccountProblem(account, multiBranch);
  const ready = !!bank && !problem && amount > 0 && !!counter && !!date && !!narration.trim();
  const save = async () => {
    if (!ready) return;
    try {
      const response = await create({ entity, bank_account: Number(bank), direction, amount, counter_account: counter, transaction_date: date, narration: narration.trim(), reference: reference.trim() || undefined }).unwrap();
      toast.success(response.message || "Bank transaction recorded.");
      onClose();
    } catch { /* central: the server names the document to use for a control account */ }
  };
  return <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()} title="Bank transaction" description="Money in or out with no customer or supplier behind it." widthClass="sm:max-w-[560px]" footer={<><Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button><Button disabled={!ready} loading={isLoading} onClick={save}>Record</Button></>}>
    <div className="space-y-4">
      <Segmented label="Which way" value={direction} onChange={setDirection} options={[["IN", "Money in"], ["OUT", "Money out"]] as const} />
      <FormField label="Bank account" required><BankAccountPicker entity={entity} value={bank} onChange={setBank} /></FormField>
      {problem && <p role="alert" className="font-mont text-[11px] leading-5 text-destructive">{problem}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} /></FormField>
        <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
      </div>
      <FormField label={direction === "IN" ? "Where it came from" : "What it paid for"} required>
        <AccountPicker entity={entity} value={counter} onChange={setCounter} postableOnly activeOnly placeholder="Capital, loan, drawings, interest, charges..." />
        <span className="mt-1 block font-mont text-[11px] leading-5 text-gray-05">An ordinary account. Receivables, payables, tax and other accounts kept by their own documents are refused, with the document to use instead.</span>
      </FormField>
      <FormField label="Narration" required><Textarea value={narration} onChange={(event) => setNarration(event.target.value)} maxLength={255} placeholder="e.g. Owner's capital injection" className="min-h-16 bg-white" /></FormField>
      <FormField label="Reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={64} className="bg-white" /></FormField>
    </div>
  </DetailDrawer>;
}

function BankTransferForm({ entity, currency, onClose }: { entity: string; currency?: string | null; onClose: () => void }) {
  const { applies: multiBranch } = useReaderBranchLens();
  const { data: accountRows } = useGetBankAccountsQuery({ entity, page: 1 });
  const accounts = toArray(accountRows?.data);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState("");
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [create, { isLoading }] = useCreateBankTransferMutation();
  const source = accounts.find((a) => String(a.id) === from);
  const problem = bankDocumentAccountProblem(source, multiBranch);
  const ready = !!from && !!to && from !== to && !problem && amount > 0 && !!date && !!narration.trim();
  const save = async () => {
    if (!ready) return;
    try {
      const response = await create({ entity, from_account: Number(from), to_account: Number(to), amount, transfer_date: date, narration: narration.trim(), reference: reference.trim() || undefined }).unwrap();
      toast.success(response.message || "Transfer recorded.");
      onClose();
    } catch { /* central */ }
  };
  return <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()} title="Bank transfer" description="Move money between two accounts of the same branch." widthClass="sm:max-w-[560px]" footer={<><Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button><Button disabled={!ready} loading={isLoading} onClick={save}>Record transfer</Button></>}>
    <div className="space-y-4">
      <FormField label="From" required><BankAccountPicker entity={entity} value={from} onChange={(next) => { setFrom(next); setTo(""); }} /></FormField>
      {problem && <p role="alert" className="font-mont text-[11px] leading-5 text-destructive">{problem}</p>}
      <FormField label="To" required>
        <BankAccountPicker entity={entity} value={to} onChange={setTo} documentBranchId={source ? source.branch_id ?? null : undefined} disabled={!source} placeholder={source ? "Select an account of the same branch" : "Choose where it comes from first"} />
        {multiBranch && <span className="mt-1 block font-mont text-[11px] leading-5 text-gray-05">Only the same branch&rsquo;s accounts are offered. Money between branches is an inter-branch transfer.</span>}
      </FormField>
      {from && from === to && <p role="alert" className="font-mont text-[11px] text-destructive">Choose two different accounts.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} /></FormField>
        <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
      </div>
      <FormField label="Narration" required><Textarea value={narration} onChange={(event) => setNarration(event.target.value)} maxLength={255} placeholder="e.g. Move term fees to savings" className="min-h-16 bg-white" /></FormField>
      <FormField label="Reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={64} className="bg-white" /></FormField>
    </div>
  </DetailDrawer>;
}
