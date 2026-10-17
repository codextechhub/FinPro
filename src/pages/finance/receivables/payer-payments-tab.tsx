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
 *
 * Field Access (`finance.payer_payment`, `finance.payer_link`): every column,
 * detail row, share column and form control follows the reader's switches, and
 * a hidden value is not restated in a title, description or sentence. The
 * amount switch also governs what each share settled: a reader who may not read
 * the amount sees no credit, outstanding balance or bills either, as the server
 * sends none. Preview and record bodies are built through `writableOnly`, and
 * the Record action is not offered when a field it cannot do without is
 * read-only. The payer, status and branch filters are neither shown nor sent
 * when their field is hidden, and the payer's links are not fetched unless the
 * payer, customer and active switches are all readable.
 *
 * The list answers for one branch and one stretch of time
 * (`useFinanceListScope`), each payment placed by its payment date. A role that
 * may not read that date is offered no Year picker and sends no period.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Eye, Plus } from "lucide-react";
import {
  AccessField, BankAccountPicker, ConfirmActionModal, CustomerPicker, DataTable, DetailDrawer, Money,
  MoneyInput, PostingDateField, StatusPill, allWritable, fieldWriteErrors, toArray, useFieldAccess,
  type Column, type FieldAccess, type FieldErrors,
} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { statusWord } from "@/components/finance-ui/status-words";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useDates } from "../../../lib/display-prefs";
import {
  useGetPayerLinksQuery, useGetPayerPaymentsQuery, useGetPayerPaymentSplitChoicesQuery,
  usePreviewPayerPaymentMutation, useRecordPayerPaymentMutation, useVoidPayerPaymentMutation,
} from "@/redux/services/finance/fees-api";
import type {
  PayerPayment, PayerPaymentPlan, PayerPaymentShare, PayerPaymentSplit, PayerPlanShare,
} from "@/redux/services/finance/fees-types";
import { DetailField, Note, useBranchColumn } from "./fees-parts";
import { useFinanceListScope } from "../list-scope";
import {
  amountsFromPlan, emptyPayerPaymentForm, inputKey, manualTotals, needsManualAmounts, payerPaymentInput,
  type PayerPaymentFormState,
} from "./payer-payment-form";

const METHODS = ["BANK_TRANSFER", "CASH", "CARD", "CHEQUE", "ONLINE", "OTHER"] as const;
const methodLabel = (m: string) => m.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
/** The splits the form lets a bursar pick; the school's other splits are policy only. */
const PICKABLE_SPLITS: PayerPaymentSplit[] = ["OLDEST_FIRST", "PROPORTIONAL"];

const PAYMENT = "finance.payer_payment";
const LINK = "finance.payer_link";
/** Body keys a payment cannot be previewed or recorded without. */
const REQUIRED_BODY = ["payer", "bank_account", "amount", "payment_date"] as const;

const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 align-top font-mont text-xs text-black-01";

const when = (show: boolean, column: Column<PayerPayment>): Column<PayerPayment>[] => (show ? [column] : []);

/**
 * What a reader may see of one share. The credit, the outstanding balance and
 * the bills restate the amount, so they go with it.
 */
function shareView(access: FieldAccess) {
  const amount = !access.isHidden("amount");
  return {
    amount,
    credit: amount && !access.isHidden("credit"),
    bills: amount && !access.isHidden("bills"),
    kind: !access.isHidden("kind"),
    document: !access.isHidden("document"),
    forwardedBy: !access.isHidden("forwarded_by"),
  };
}

interface ShareColumn<S> {
  key: string;
  header: string;
  right?: boolean;
  cell: (share: S) => React.ReactNode;
}

/** A shares table drawn from one column list, so each header sits over its own cells. */
function ShareTable<S>({ columns, rows, rowKey }: { columns: ShareColumn<S>[]; rows: S[]; rowKey: (row: S) => string | number }) {
  return (
    <div className="overflow-x-auto rounded-md border border-white-02">
      <table className="w-full min-w-[320px] border-collapse">
        <thead><tr>
          {columns.map((c) => <th key={c.key} className={c.right ? `${th} text-right` : th}>{c.header}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => <td key={c.key} className={c.right ? `${td} text-right` : td}>{c.cell(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PayerPaymentsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const { can } = useCan();
  const access = useFieldAccess(PAYMENT);
  const branches = useBranchColumn();
  const [payer, setPayer] = useState("");
  const [page, setPage] = useState(1);
  const { scope, filters } = useFinanceListScope(entity, () => setPage(1), { periodReadable: !access.isHidden("payment_date") });
  const [recording, setRecording] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // A branch's list holds what it received and what holds a share for it, so "Received at" stays.
  const payerFilter = !access.isHidden("payer");
  const params = useMemo(() => ({
    entity, page, ...(payerFilter && payer ? { payer } : {}), ...scope,
  }), [entity, page, payer, payerFilter, scope]);
  const { data, isLoading, isFetching, isError, refetch } = useGetPayerPaymentsQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const open = rows.find((r) => r.id === selected) ?? null;

  const columns: Column<PayerPayment>[] = [
    { header: "Ref", cell: (p) => <span className="font-semibold tabular-nums">{p.document_number}</span> },
    ...when(payerFilter, { header: "Payer", cell: (p) => <span className="font-medium text-gray-01">{p.payer.name}</span> }),
    ...when(!access.isHidden("shares"), { header: "Pays for", cell: (p) => <span className="text-gray-05">{[...new Set((p.shares ?? []).map((s) => s.customer.name))].join(", ") || "-"}</span> }),
    ...when(branches.show, { header: "Received at", cell: (p) => branches.name(p.branch_id, p.branch_name) }),
    ...when(!access.isHidden("payment_date"), { header: "Date", cell: (p) => <span className="tabular-nums">{dates.day(p.payment_date)}</span> }),
    ...when(!access.isHidden("amount"), { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amount} currency={currency} align="right" /> }),
    ...when(!access.isHidden("status"), { header: "Status", cell: (p) => <StatusPill status={p.status} label={statusWord(p.status)} /> }),
  ];
  const canRecord = can(P.FIN_RECORD_PAYMENT) && allWritable(access, REQUIRED_BODY);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          {filters}
          {payerFilter ? (
            <div className="w-64 max-w-full">
              <CustomerPicker entity={entity} value={payer} onChange={(v) => { setPayer(v); setPage(1); }} placeholder="Any payer" />
            </div>
          ) : null}
          {payerFilter && payer ? <Button variant="ghost" size="sm" onClick={() => setPayer("")}>Clear</Button> : null}
        </div>
        {canRecord ? (
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

export function RecordPayerPaymentDrawer({ entity, currency, onClose, onRecorded }: {
  entity: string; currency?: string | null; onClose: () => void; onRecorded: (id: number) => void;
}) {
  const access = useFieldAccess(PAYMENT);
  const linkAccess = useFieldAccess(LINK);
  const [denied, setDenied] = useState<FieldErrors | null>(null);
  const [form, setForm] = useState<PayerPaymentFormState>(emptyPayerPaymentForm);
  const [plan, setPlan] = useState<{ key: string; data: PayerPaymentPlan } | null>(null);
  const planAccess = useFieldAccess(PAYMENT, plan?.data);
  const [preview, { isLoading: previewing }] = usePreviewPayerPaymentMutation();
  const [record, { isLoading: recording }] = useRecordPayerPaymentMutation();
  const choices = useGetPayerPaymentSplitChoicesQuery({ entity }).data?.data;
  // Links are read by payer and active state and name both sides of each row.
  const linksReadable = ["payer", "customer", "is_active"].every((name) => !linkAccess.isHidden(name));
  const links = useGetPayerLinksQuery({ entity, payer: form.payer, is_active: "true" }, { skip: !form.payer || !linksReadable });

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
  const forcedManual = needsManualAmounts(form.split, choices?.split_default);
  const state = forcedManual && !form.manual ? { ...form, manual: true } : form;
  const canEnterAmounts = !access.isReadOnly("shares", { creating: true });
  // The school's split asks for each customer's amount, which this reader may not enter.
  const manualBlocked = state.manual && !canEnterAmounts;
  const rawInput = payerPaymentInput(entity, state, codes);
  const input = rawInput && !manualBlocked ? access.writableOnly(rawInput, { creating: true }) : null;
  const key = inputKey(input);
  const fresh = !!plan && plan.key === key;
  const totals = manualTotals(state, codes);
  const linkedCount = toArray(links.data?.data).length;

  const runPreview = async () => {
    if (!input) return;
    setDenied(null);
    try {
      const res = await preview(input).unwrap();
      setPlan({ key, data: res.data });
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };
  const save = async () => {
    if (!input || !fresh) return;
    setDenied(null);
    try {
      const res = await record(input).unwrap();
      toast.success(res.message || "Payment recorded.");
      onRecorded(res.data.id);
      onClose();
    } catch (error) { setDenied(fieldWriteErrors(error)); }
  };
  const startManual = () => set({ manual: true, amounts: plan?.data.shares ? amountsFromPlan(plan.data.shares) : form.amounts });

  // The choices and their words come from the server, readable by whoever may
  // record; a payment and its preview carry their own label.
  const splitOptions = choices?.split_options ?? [];
  const defaultSplit = choices?.split_default_label ?? null;
  const planNote = [
    !planAccess.isHidden("split_label") ? plan?.data.split_label : null,
    plan?.data.branch_name ? `received at ${plan.data.branch_name}` : null,
  ].filter(Boolean).join(" · ");

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
          <AccessField access={access} name="payer" label="Payer" required creating errors={denied}>
            <CustomerPicker entity={entity} value={form.payer} onChange={(v) => set({ payer: v, amounts: {} })} />
          </AccessField>
          <AccessField access={access} name="bank_account" label="Received into" required creating errors={denied}>
            <BankAccountPicker entity={entity} value={form.bankAccount} onChange={(v) => set({ bankAccount: v })} />
          </AccessField>
        </div>
        {form.payer && links.isSuccess && linkedCount === 0 ? (
          <Note tone="warn">This payer is not linked to anyone yet, so the payment can only settle the payer&apos;s own bills. Link the customers they pay for on the payer&apos;s customer record.</Note>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AccessField access={access} name="amount" label="Amount" required creating errors={denied}>
            <MoneyInput valueKobo={form.amount} onChangeKobo={(v) => set({ amount: v })} currency={currency} />
          </AccessField>
          <AccessField access={access} name="payment_date" creating errors={denied}>
            <PostingDateField label="Payment date" entity={entity} value={form.date} onChange={(v) => set({ date: v })} />
          </AccessField>
          <AccessField access={access} name="method" label="Method" required creating errors={denied}>
            <NativeSelect value={form.method} onChange={(e) => set({ method: e.target.value })} aria-label="Method">
              {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
            </NativeSelect>
          </AccessField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccessField access={access} name="reference" label="Reference" creating errors={denied}>
            <Input value={form.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={64} placeholder="Transfer reference" className="bg-white" />
          </AccessField>
          <AccessField access={access} name="split" label="How to split it" creating errors={denied}>
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
              {splitOptions.filter((o) => PICKABLE_SPLITS.includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              {canEnterAmounts ? <option value="MANUAL">I will enter each customer&apos;s amount</option> : null}
            </NativeSelect>
          </AccessField>
        </div>

        {manualBlocked ? (
          <Note tone="warn">The school&apos;s split asks for an amount for each customer, which you are not allowed to enter, so a payment cannot be recorded here.</Note>
        ) : null}

        {state.manual && canEnterAmounts ? (
          <AccessField access={access} name="shares" creating errors={denied}>
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
          </AccessField>
        ) : null}

        {plan ? (
          <div className={cn("space-y-2", !fresh && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mont text-sm font-semibold text-black-01">How it will be split</p>
              {planNote ? <span className="font-mont text-xs text-gray-05">{planNote}</span> : null}
            </div>
            {!fresh ? <Note tone="warn">The form has changed since this preview. Preview again before recording.</Note> : null}
            {planAccess.isHidden("shares") ? (
              <Note>The split for each customer is not shown to you. The payment is still split as the school&apos;s setting says.</Note>
            ) : (
              <PlanTable shares={plan.data.shares ?? []} currency={currency} receivedAt={plan.data.branch_name} />
            )}
            {!state.manual && canEnterAmounts && !planAccess.isHidden("shares") ? (
              <Button variant="ghost" size="sm" onClick={startManual}>Change the amounts</Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </DetailDrawer>
  );
}

/**
 * The proposed shares; bills are listed only for branches the reader works in.
 *
 * Columns follow the reader's `finance.payer_payment` switches and are drawn
 * from one list, so a hidden column takes its header with it.
 */
export function PlanTable({ shares, currency, receivedAt }: { shares: PayerPlanShare[]; currency?: string | null; receivedAt: string }) {
  const branches = useBranchColumn();
  const access = useFieldAccess(PAYMENT);
  if (!shares.length) return <p className="font-mont text-xs text-gray-05">Nothing to split.</p>;
  const view = shareView(access);
  const columns: ShareColumn<PayerPlanShare>[] = [
    { key: "customer", header: "Customer", cell: (s) => <><span className="font-medium">{s.customer.name}</span> <span className="text-gray-05">{s.customer.code}</span></> },
    ...(branches.show ? [{ key: "branch", header: "Bills at", cell: (s: PayerPlanShare) => branches.name(s.branch_id, s.branch_name) }] : []),
    ...(view.kind ? [{
      key: "kind", header: "Booked as",
      cell: (s: PayerPlanShare) => s.kind === "RECEIPT"
        ? <StatusPill status="RECEIPT" />
        : <span className="text-amber-700">Held for {s.branch_name || "another branch"}{receivedAt ? `, from ${receivedAt}` : ""}</span>,
    }] : []),
    ...(view.amount ? [{
      key: "amount", header: "Amount", right: true,
      cell: (s: PayerPlanShare) => (
        <>
          <Money kobo={s.amount} currency={currency} align="right" />
          {view.credit && s.credit > 0 ? <span className="block text-[11px] text-gray-05">{formatMoney(s.credit, currency)} left as credit</span> : null}
        </>
      ),
    }] : []),
    ...(view.bills ? [{
      key: "settles", header: "Settles",
      cell: (s: PayerPlanShare) => s.bills === undefined ? (
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
      ),
    }] : []),
  ];
  return <ShareTable columns={columns} rows={shares} rowKey={(s) => `${s.customer.code}-${s.branch_id}`} />;
}

export function PayerPaymentDrawer({ payment, entity, currency, onClose }: {
  payment: PayerPayment | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const { can } = useCan();
  const access = useFieldAccess(PAYMENT, payment);
  const branches = useBranchColumn();
  const [voiding, setVoiding] = useState(false);
  const [voidDate, setVoidDate] = useState("");
  const [voidPayment, { isLoading }] = useVoidPayerPaymentMutation();
  if (!payment) return null;
  const forwarded = (payment.shares ?? []).some((s) => s.forwarded_by);
  // A reader who cannot read the status cannot tell a voided payment; the server refuses a second void.
  const live = access.isHidden("status") || payment.status === "POSTED";
  const view = shareView(access);
  const description = [
    !access.isHidden("payer") ? payment.payer.name : null,
    !access.isHidden("payment_date") ? dates.day(payment.payment_date) : null,
  ].filter(Boolean).join(" · ");

  const submit = async () => {
    try {
      const res = await voidPayment({ entity, id: payment.id, ...(voidDate ? { date: voidDate } : {}) }).unwrap();
      toast.success(res.message || "Payment voided.");
      setVoiding(false);
      setVoidDate("");
    } catch { /* central */ }
  };

  const columns: ShareColumn<PayerPaymentShare>[] = [
    { key: "customer", header: "Customer", cell: (s) => <span className="font-medium">{s.customer.name}</span> },
    ...(branches.show ? [{ key: "branch", header: "Bills at", cell: (s: PayerPaymentShare) => branches.name(s.branch_id, s.branch_name) }] : []),
    ...(view.document || view.kind || view.forwardedBy ? [{
      key: "document", header: "Document",
      cell: (s: PayerPaymentShare) => (
        <>
          {view.document && s.document ? <><span className="tabular-nums">{s.document.document_number}</span> <StatusPill status={s.document.status} label={statusWord(s.document.status)} /></> : null}
          {view.kind && s.kind === "HELD" ? (
            <span className="block text-[11px] text-gray-05">
              {view.forwardedBy && s.forwarded_by
                ? `Forwarded by ${s.forwarded_by.document_number}`
                : `Held for ${s.branch_name || "another branch"}${view.forwardedBy ? ", not yet forwarded" : ""}`}
            </span>
          ) : null}
        </>
      ),
    }] : []),
    ...(view.amount ? [{
      key: "amount", header: "Amount", right: true,
      cell: (s: PayerPaymentShare) => (
        <>
          <Money kobo={s.amount} currency={currency} align="right" />
          {view.credit && s.credit > 0 ? <span className="block text-[11px] text-gray-05">{formatMoney(s.credit, currency)} as credit</span> : null}
        </>
      ),
    }] : []),
    ...(view.bills ? [{
      key: "settled", header: "Settled",
      cell: (s: PayerPaymentShare) => s.bills?.length
        ? <ul className="space-y-0.5">{s.bills.map((b) => <li key={b.invoice_id} className="tabular-nums">{b.document_number}: {formatMoney(b.applied, currency)}</li>)}</ul>
        : <span className="text-gray-05">{view.kind && s.kind === "HELD" ? "When it reaches that branch" : "-"}</span>,
    }] : []),
  ];

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o ? undefined : onClose())}
        title={payment.document_number || "Payer payment"}
        description={description || undefined}
        widthClass="sm:max-w-3xl"
        footer={live && can(P.FIN_REVERSE_PAYMENT) ? (
          <Button variant="outline" onClick={() => setVoiding(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" /> Void payment</Button>
        ) : undefined}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {!access.isHidden("amount") ? <DetailField label="Amount"><Money kobo={payment.amount} currency={currency} /></DetailField> : null}
            {!access.isHidden("status") ? <DetailField label="Status"><StatusPill status={payment.status} label={statusWord(payment.status)} /></DetailField> : null}
            {!access.isHidden("bank_account") ? <DetailField label="Received into">{payment.bank_account.name}</DetailField> : null}
            {branches.show ? <DetailField label="Received at">{branches.name(payment.branch_id, payment.branch_name)}</DetailField> : null}
            {!access.isHidden("method") ? <DetailField label="Method">{methodLabel(payment.method)}</DetailField> : null}
            {!access.isHidden("split_label") ? <DetailField label="Split">{payment.split_label}</DetailField> : null}
            {!access.isHidden("reference") && payment.reference ? <DetailField label="Reference">{payment.reference}</DetailField> : null}
          </div>
          {!access.isHidden("shares") ? (
            <ShareTable columns={columns} rows={payment.shares ?? []} rowKey={(s) => s.id} />
          ) : null}
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
