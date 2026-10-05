/**
 * Receivables -> Payer Payments: one payment from a payer, split across the
 * customers they pay for.
 *
 * Mr Okafor pays N500,000 into Ikeja's bank for Ada (billed at Ikeja) and Emeka
 * (billed at Lekki). The payment is recorded once (PA-...) and makes one receipt
 * per customer, each settling only that customer's own bills. Emeka's share is
 * money Ikeja holds for Lekki, forwarded through its own approval route, because
 * no branch's receipt settles another branch's bill.
 *
 * The form previews the split before anything is saved, following the school's
 * setting (oldest bill first, in proportion, or as entered) or the bursar's own
 * amounts. Bills at a branch the reader does not work in are not shown, only the
 * customer and the amount. A reader records only into a bank account of their
 * own branches: the bank list the server sends them is already narrowed.
 *
 * Voiding voids every receipt and held share together; a single receipt of a
 * payer payment cannot be voided on its own, and the void is refused once a
 * held share has been forwarded or the bank line matched.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Eye, Plus } from "lucide-react";
import {
  BankAccountPicker, ConfirmActionModal, CustomerPicker, DataTable, DetailDrawer, FormField, Money,
  MoneyInput, PostingDateField, StatusPill, toArray, type Column,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import {
  useGetPayerLinksQuery, useGetPayerPaymentsQuery, useGetReceivablesSettingsQuery,
  usePreviewPayerPaymentMutation, useRecordPayerPaymentMutation, useVoidPayerPaymentMutation,
} from "@/redux/services/finance/fees-api";
import type {
  PayerPayment, PayerPaymentPlan, PayerPaymentSplit, PayerPlanShare,
} from "@/redux/services/finance/fees-types";
import { DetailField, Note, useBranchColumn } from "./fees-parts";
import { ListBranchSelect, listBranchArg, useListBranch } from "./list-branch";
import {
  amountsFromPlan, emptyPayerPaymentForm, inputKey, manualTotals, needsManualAmounts, payerPaymentInput,
  type PayerPaymentFormState,
} from "./payer-payment-form";

const METHODS = ["BANK_TRANSFER", "CASH", "CARD", "CHEQUE", "ONLINE", "OTHER"] as const;
const methodLabel = (m: string) => m.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const SPLIT_LABEL: Record<string, string> = {
  OLDEST_FIRST: "Oldest bill first",
  PROPORTIONAL: "In proportion to what each owes",
  AS_ENTERED: "As entered",
  EXPLICIT: "Amounts entered by hand",
};
const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 align-top font-mont text-xs text-black-01";

export function PayerPaymentsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const { can } = useCan();
  const branches = useBranchColumn();
  const list = useListBranch();
  const [payer, setPayer] = useState("");
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // A branch's list holds what it received and what holds a share for it, so "Received at" stays.
  const params = useMemo(() => ({ entity, page, ...(payer ? { payer } : {}), ...listBranchArg(list.view) }), [entity, page, payer, list.view]);
  const { data, isLoading, isFetching, isError, refetch } = useGetPayerPaymentsQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const open = rows.find((r) => r.id === selected) ?? null;

  const columns: Column<PayerPayment>[] = [
    { header: "Ref", cell: (p) => <span className="font-semibold tabular-nums">{p.document_number}</span> },
    { header: "Payer", cell: (p) => <span className="font-medium text-gray-01">{p.payer.name}</span> },
    { header: "Pays for", cell: (p) => <span className="text-gray-05">{[...new Set(p.shares.map((s) => s.customer.name))].join(", ") || "-"}</span> },
    ...(branches.show ? [{ header: "Received at", cell: (p: PayerPayment) => branches.name(p.branch_id, p.branch_name) }] : []),
    { header: "Date", cell: (p) => <span className="tabular-nums">{dates.day(p.payment_date)}</span> },
    { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (p) => <StatusPill status={p.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <ListBranchSelect view={list.view} onChange={(v) => { setPage(1); list.choose(v); }} />
          <div className="w-64 max-w-full">
            <CustomerPicker entity={entity} value={payer} onChange={(v) => { setPayer(v); setPage(1); }} placeholder="Any payer" />
          </div>
          {payer ? <Button variant="ghost" size="sm" onClick={() => setPayer("")}>Clear</Button> : null}
        </div>
        {can(P.FIN_RECORD_PAYMENT) ? (
          <Button onClick={() => setRecording(true)} className="gap-1.5"><Plus className="size-4" /> Record payer payment</Button>
        ) : null}
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(p) => p.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(p) => setSelected(p.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No payer payments"
        emptyMessage="Link a payer to the customers they pay for on the customer's record, then record their payment here."
      />
      {recording ? (
        <RecordPayerPaymentDrawer entity={entity} currency={currency} onClose={() => setRecording(false)} onRecorded={setSelected} />
      ) : null}
      <PayerPaymentDrawer payment={open} entity={entity} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}

function RecordPayerPaymentDrawer({ entity, currency, onClose, onRecorded }: {
  entity: string; currency?: string | null; onClose: () => void; onRecorded: (id: number) => void;
}) {
  const { can } = useCan();
  const [form, setForm] = useState<PayerPaymentFormState>(emptyPayerPaymentForm);
  const [plan, setPlan] = useState<{ key: string; data: PayerPaymentPlan } | null>(null);
  const [preview, { isLoading: previewing }] = usePreviewPayerPaymentMutation();
  const [record, { isLoading: recording }] = useRecordPayerPaymentMutation();
  const settings = useGetReceivablesSettingsQuery({ entity }, { skip: !can(P.FIN_VIEW_SETTINGS) }).data?.data.settings;
  const links = useGetPayerLinksQuery({ entity, payer: form.payer, is_active: "true" }, { skip: !form.payer });

  const people = useMemo(() => {
    const byCode = new Map<string, string>();
    if (form.payer) byCode.set(form.payer, "");
    for (const link of toArray(links.data?.data)) {
      byCode.set(link.payer.code, link.payer.name);
      byCode.set(link.customer.code, link.customer.name);
    }
    for (const share of plan?.data.shares ?? []) byCode.set(share.customer.code, share.customer.name);
    return [...byCode.entries()].map(([code, name]) => ({ code, name: name || code }));
  }, [form.payer, links.data, plan]);
  const codes = people.map((p) => p.code);

  const set = (patch: Partial<PayerPaymentFormState>) => setForm((f) => ({ ...f, ...patch }));
  const forcedManual = needsManualAmounts(form.split, settings?.payer_payment_split);
  const state = forcedManual && !form.manual ? { ...form, manual: true } : form;
  const input = payerPaymentInput(entity, state, codes);
  const key = inputKey(input);
  const fresh = !!plan && plan.key === key;
  const totals = manualTotals(state, codes);
  const linkedCount = toArray(links.data?.data).length;

  const runPreview = async () => {
    if (!input) return;
    try {
      const res = await preview(input).unwrap();
      setPlan({ key, data: res.data });
    } catch { /* central */ }
  };
  const save = async () => {
    if (!input || !fresh) return;
    try {
      const res = await record(input).unwrap();
      toast.success(res.message || "Payment recorded.");
      onRecorded(res.data.id);
      onClose();
    } catch { /* central */ }
  };
  const startManual = () => set({ manual: true, amounts: plan ? amountsFromPlan(plan.data.shares) : form.amounts });

  const defaultSplit = settings ? SPLIT_LABEL[settings.payer_payment_split] ?? settings.payer_payment_split : null;

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Record payer payment"
      description="One payment from a parent or sponsor, split into one receipt per customer they pay for."
      widthClass="sm:max-w-3xl"
      footer={<>
        <Button variant="outline" disabled={recording} onClick={onClose}>Cancel</Button>
        <Button variant="outline" disabled={!input || previewing || recording} onClick={runPreview} className="gap-1.5">
          <Eye className="size-4" />{previewing ? "Working..." : plan && !fresh ? "Preview again" : "Preview split"}
        </Button>
        <Button disabled={!fresh || recording} onClick={save}>{recording ? "Saving..." : "Record payment"}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Payer" required>
            <CustomerPicker entity={entity} value={form.payer} onChange={(v) => set({ payer: v, amounts: {} })} />
          </FormField>
          <FormField label="Received into" required>
            <BankAccountPicker entity={entity} value={form.bankAccount} onChange={(v) => set({ bankAccount: v })} />
          </FormField>
        </div>
        {form.payer && links.isSuccess && linkedCount === 0 ? (
          <Note tone="warn">This payer is not linked to anyone yet, so the payment can only settle the payer&apos;s own bills. Link the customers they pay for on the payer&apos;s customer record.</Note>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Amount" required><MoneyInput valueKobo={form.amount} onChangeKobo={(v) => set({ amount: v })} currency={currency} /></FormField>
          <PostingDateField label="Payment date" entity={entity} value={form.date} onChange={(v) => set({ date: v })} />
          <FormField label="Method" required>
            <NativeSelect value={form.method} onChange={(e) => set({ method: e.target.value })} aria-label="Method">
              {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
            </NativeSelect>
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Reference"><Input value={form.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={64} placeholder="Transfer reference" className="bg-white" /></FormField>
          <FormField label="How to split it">
            <NativeSelect
              value={state.manual && !forcedManual ? "MANUAL" : form.split}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "MANUAL") startManual();
                else set({ split: v as PayerPaymentSplit | "", manual: false });
              }}
              aria-label="How to split it"
            >
              <option value="">{defaultSplit ? `School setting: ${defaultSplit}` : "School setting"}</option>
              <option value="OLDEST_FIRST">{SPLIT_LABEL.OLDEST_FIRST}</option>
              <option value="PROPORTIONAL">{SPLIT_LABEL.PROPORTIONAL}</option>
              <option value="MANUAL">I will enter each customer&apos;s amount</option>
            </NativeSelect>
          </FormField>
        </div>

        {state.manual ? (
          <div className="space-y-2">
            <p className="font-mont text-sm font-semibold text-black-01">Amount for each customer</p>
            {people.length === 0 ? <p className="font-mont text-xs text-gray-05">Choose the payer first.</p> : (
              <div className="space-y-2">
                {people.map((p) => (
                  <div key={p.code} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
                    <span className="min-w-0 truncate font-mont text-sm text-gray-01">{p.name} <span className="text-gray-05">{p.code}{p.code === form.payer ? " (payer)" : ""}</span></span>
                    <MoneyInput valueKobo={form.amounts[p.code] ?? 0} onChangeKobo={(v) => set({ amounts: { ...form.amounts, [p.code]: v } })} currency={currency} />
                  </div>
                ))}
              </div>
            )}
            <p className={cn("font-mont text-xs", totals.entered > form.amount ? "text-destructive" : "text-gray-05")}>
              Entered {formatMoney(totals.entered, currency)} of {formatMoney(form.amount, currency)}.
              {totals.entered > form.amount
                ? " The amounts come to more than was received."
                : totals.left > 0 && totals.entered > 0 ? ` The other ${formatMoney(totals.left, currency)} goes where the school's surplus setting says.` : ""}
              {" "}An amount above a customer&apos;s bills stays as that customer&apos;s credit.
            </p>
          </div>
        ) : null}

        {plan ? (
          <div className={cn("space-y-2", !fresh && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mont text-sm font-semibold text-black-01">How it will be split</p>
              <span className="font-mont text-xs text-gray-05">{SPLIT_LABEL[plan.data.split] ?? plan.data.split}{plan.data.branch_name ? ` · received at ${plan.data.branch_name}` : ""}</span>
            </div>
            {!fresh ? <Note tone="warn">The form has changed since this preview. Preview again before recording.</Note> : null}
            <PlanTable shares={plan.data.shares} currency={currency} receivedAt={plan.data.branch_name} />
            {!state.manual ? (
              <Button variant="ghost" size="sm" onClick={startManual}>Change the amounts</Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
}

/** The proposed shares; bills are listed only for branches the reader works in. */
export function PlanTable({ shares, currency, receivedAt }: { shares: PayerPlanShare[]; currency?: string | null; receivedAt: string }) {
  const branches = useBranchColumn();
  if (!shares.length) return <p className="font-mont text-xs text-gray-05">Nothing to split.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-white-02">
      <table className="w-full min-w-[520px] border-collapse">
        <thead><tr>
          <th className={th}>Customer</th>
          {branches.show ? <th className={th}>Bills at</th> : null}
          <th className={th}>Booked as</th>
          <th className={`${th} text-right`}>Amount</th>
          <th className={th}>Settles</th>
        </tr></thead>
        <tbody>
          {shares.map((s) => (
            <tr key={`${s.customer.code}-${s.branch_id}`}>
              <td className={td}><span className="font-medium">{s.customer.name}</span> <span className="text-gray-05">{s.customer.code}</span></td>
              {branches.show ? <td className={td}>{branches.name(s.branch_id, s.branch_name)}</td> : null}
              <td className={td}>
                {s.kind === "RECEIPT"
                  ? <StatusPill status="RECEIPT" />
                  : <span className="text-amber-700">Held for {s.branch_name || "another branch"}{receivedAt ? `, from ${receivedAt}` : ""}</span>}
              </td>
              <td className={`${td} text-right`}>
                <Money kobo={s.amount} currency={currency} align="right" />
                {s.credit > 0 ? <span className="block text-[11px] text-gray-05">{formatMoney(s.credit, currency)} left as credit</span> : null}
              </td>
              <td className={td}>
                {s.bills === undefined ? (
                  <span className="text-gray-05">Bills at a branch you do not work in</span>
                ) : s.bills.length === 0 ? (
                  <span className="text-gray-05">No open bills</span>
                ) : (
                  <ul className="space-y-0.5">
                    {s.bills.map((b) => (
                      <li key={`${b.kind}-${b.id}`} className="tabular-nums">
                        {b.document_number}: {formatMoney(b.applied, currency)}
                        <span className="text-gray-05"> of {formatMoney(b.balance, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayerPaymentDrawer({ payment, entity, currency, onClose }: {
  payment: PayerPayment | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const branches = useBranchColumn();
  const [voiding, setVoiding] = useState(false);
  const [voidDate, setVoidDate] = useState("");
  const [voidPayment, { isLoading }] = useVoidPayerPaymentMutation();
  if (!payment) return null;
  const forwarded = payment.shares.some((s) => s.forwarded_by);
  const live = payment.status === "POSTED";

  const submit = async () => {
    try {
      const res = await voidPayment({ entity, id: payment.id, ...(voidDate ? { date: voidDate } : {}) }).unwrap();
      toast.success(res.message || "Payment voided.");
      setVoiding(false);
      setVoidDate("");
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o ? undefined : onClose())}
        title={payment.document_number}
        description={`${payment.payer.name} · ${dates.day(payment.payment_date)}`}
        widthClass="sm:max-w-3xl"
        footer={live && can(P.FIN_REVERSE_PAYMENT) ? (
          <Button variant="outline" onClick={() => setVoiding(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" /> Void payment</Button>
        ) : undefined}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <DetailField label="Amount"><Money kobo={payment.amount} currency={currency} /></DetailField>
            <DetailField label="Status"><StatusPill status={payment.status} /></DetailField>
            <DetailField label="Received into">{payment.bank_account.name}</DetailField>
            {branches.show ? <DetailField label="Received at">{branches.name(payment.branch_id, payment.branch_name)}</DetailField> : null}
            <DetailField label="Method">{methodLabel(payment.method)}</DetailField>
            <DetailField label="Split">{SPLIT_LABEL[payment.split] ?? payment.split}</DetailField>
            {payment.reference ? <DetailField label="Reference">{payment.reference}</DetailField> : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-white-02">
            <table className="w-full min-w-[520px] border-collapse">
              <thead><tr>
                <th className={th}>Customer</th>
                {branches.show ? <th className={th}>Bills at</th> : null}
                <th className={th}>Document</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Settled</th>
              </tr></thead>
              <tbody>
                {payment.shares.map((s) => (
                  <tr key={s.id}>
                    <td className={td}><span className="font-medium">{s.customer.name}</span></td>
                    {branches.show ? <td className={td}>{branches.name(s.branch_id, s.branch_name)}</td> : null}
                    <td className={td}>
                      <span className="tabular-nums">{s.document.document_number}</span> <StatusPill status={s.document.status} />
                      {s.kind === "HELD" ? (
                        <span className="block text-[11px] text-gray-05">
                          {s.forwarded_by ? `Forwarded by ${s.forwarded_by.document_number}` : `Held for ${s.branch_name}, not yet forwarded`}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${td} text-right`}>
                      <Money kobo={s.amount} currency={currency} align="right" />
                      {s.credit > 0 ? <span className="block text-[11px] text-gray-05">{formatMoney(s.credit, currency)} as credit</span> : null}
                    </td>
                    <td className={td}>
                      {s.bills?.length
                        ? <ul className="space-y-0.5">{s.bills.map((b) => <li key={b.invoice_id} className="tabular-nums">{b.document_number}: {formatMoney(b.applied, currency)}</li>)}</ul>
                        : <span className="text-gray-05">{s.kind === "HELD" ? "When it reaches that branch" : "-"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>Every receipt and held share of this payment is voided together. None of them can be voided on its own.</Note>
        </div>
      </DetailDrawer>
      <ConfirmActionModal
        open={voiding} onOpenChange={(o) => !o && setVoiding(false)}
        title={`Void ${payment.document_number}?`}
        description={forwarded
          ? "A share of this payment has been forwarded to another branch. Void the forward first; the server will refuse this until then."
          : "Voids every receipt and held share this payment made, and reopens the bills they settled. Refused once its bank line is matched."}
        confirmText="Void payment" destructive loading={isLoading} onConfirm={submit}
      >
        <PostingDateField label="Void date" entity={entity} value={voidDate} onChange={setVoidDate} required={false} />
      </ConfirmActionModal>
    </>
  );
}
