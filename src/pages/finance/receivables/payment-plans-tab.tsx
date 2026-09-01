// Receivables → Payment Plans. Rebuilt to the Vision prototype in the house theme:
// a list with progress / next-due / health, an Installment-schedule detail drawer,
// and a curated New-plan drawer (the prototype's create modal doesn't open) with a
// live schedule preview. Concessions are a separate screen - not bundled here.
//
// A plan is a scheduling overlay on an invoice: installment "paid" status is derived
// from the invoice's settlement, so the invoice is required, and "Record installment"
// posts a real receipt against it - the backend auto-advances the plan on settlement.
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, Search, Receipt, Ban } from "lucide-react";
import {
  DataTable, Money, MoneyInput, DetailDrawer, FormField, Segmented,
  CustomerPicker, AccountPicker, toArray, type Column,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/custom/search-select";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "@/permissions";
import {
  useGetPaymentPlansQuery, useCreatePaymentPlanMutation, useActivatePaymentPlanMutation,
  useCancelPaymentPlanMutation, useRecordPaymentMutation,
  useGetInvoicesQuery,
} from "@/redux/services/finance/ar-api";
import type { PaymentPlan, PaymentPlanInstallment } from "@/redux/services/finance/ar-types";
import { todayISO } from "@/utils/posting-window";

const METHODS = ["BANK_TRANSFER", "CASH", "CARD", "CHEQUE", "ONLINE", "OTHER"];
const FREQS: [string, string][] = [["WEEKLY", "Weekly"], ["FORTNIGHTLY", "Fortnightly"], ["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"]];

const nextUnpaid = (p: PaymentPlan) => p.installments.find((i) => i.balance > 0) ?? null;
const paidCount = (p: PaymentPlan) => p.installments.filter((i) => i.balance <= 0).length;

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const GREEN = "bg-green-01/10 text-green-01", AMBER = "bg-amber-50 text-amber-700", GRAY = "bg-gray-03/60 text-gray-05", BLUE = "bg-blue-50 text-blue-700";

function planHealth(p: PaymentPlan): { label: string; cls: string } {
  if (p.plan_status === "COMPLETED") return { label: "Completed", cls: GREEN };
  if (p.plan_status === "CANCELLED") return { label: "Cancelled", cls: GRAY };
  if (p.plan_status === "DRAFT") return { label: "Draft", cls: GRAY };
  const n = nextUnpaid(p);
  return n && n.due_date < todayISO() ? { label: "At risk", cls: AMBER } : { label: "On track", cls: GREEN };
}
function instLabel(inst: PaymentPlanInstallment, isNext: boolean): { label: string; cls: string } {
  if (inst.balance <= 0) return { label: "Paid", cls: GREEN };
  if (inst.amount_settled > 0) return { label: "Partial", cls: AMBER };
  return isNext ? { label: "Due", cls: BLUE } : { label: "Scheduled", cls: GRAY };
}

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-03">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mont text-xs tabular-nums text-gray-05">{paid}/{total}</span>
    </span>
  );
}

// Mirror the backend's even split (remainder on the last) + due-date stepping so the
// create drawer can preview the schedule the server will build.
function addPeriod(start: Date, i: number, freq: string): Date {
  const d = new Date(start);
  if (freq === "WEEKLY") d.setDate(d.getDate() + 7 * i);
  else if (freq === "FORTNIGHTLY") d.setDate(d.getDate() + 14 * i);
  else if (freq === "QUARTERLY") d.setMonth(d.getMonth() + 3 * i);
  else d.setMonth(d.getMonth() + i);
  return d;
}
// Local date string (avoids the UTC shift that toISOString() introduces).
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function previewSchedule(total: number, count: number, start: string, freq: string) {
  if (count < 1 || total <= 0 || !start) return [] as { seq: number; date: string; amount: number }[];
  const base = Math.floor(total / count);
  const startDate = new Date(`${start}T00:00:00`);
  return Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    date: fmtDate(addPeriod(startDate, i, freq)),
    amount: i === count - 1 ? total - base * (count - 1) : base,
  }));
}

export function PaymentPlansTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [selected, setSelected] = useState<PaymentPlan | null>(null);

  const params = useMemo(() => ({ entity, page, ...(search ? { search } : {}) }), [entity, page, search]);
  const { data, isLoading, isFetching, isError, refetch } = useGetPaymentPlansQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;

  // Keep the open drawer's plan in sync with refreshed list data (after recording).
  const selectedLive = useMemo(
    () => (selected ? rows.find((p) => p.id === selected.id) ?? selected : null),
    [rows, selected],
  );

  const columns: Column<PaymentPlan>[] = [
    { header: "Plan no.", cell: (p) => <span className="font-semibold tabular-nums">{p.document_number}</span> },
    { header: "Customer", cell: (p) => <span className="text-gray-01">{p.customer_name}</span> },
    { header: "Invoice", cell: (p) => <span className="tabular-nums text-gray-05">{p.invoice_number ?? "-"}</span> },
    { header: "Total", align: "right", cell: (p) => <Money kobo={p.total_amount} currency={currency} align="right" /> },
    { header: "Progress", cell: (p) => <ProgressBar paid={paidCount(p)} total={p.installment_count} /> },
    { header: "Next due", cell: (p) => {
      const n = nextUnpaid(p);
      return n ? <span className="font-mont text-sm text-gray-01">{n.due_date} · <span className="tabular-nums">{formatMoney(n.balance, currency)}</span></span> : <span className="text-gray-05">-</span>;
    } },
    { header: "Status", cell: (p) => { const h = planHealth(p); return <span className={cn(PILL, h.cls)}>{h.label}</span>; } },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder="Search plan no., customer, invoice" className="h-9 w-64 bg-white pl-8 font-mont" />
        </div>
        <Can permission={[P.FIN_CREATE_PAYMENT_PLAN, P.FIN_ACTIVATE_PAYMENT_PLAN]} mode="all">
          <Button data-guide="finance-payment-plans.new" onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New plan</Button>
        </Can>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(p) => p.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No payment plans"
        emptyMessage="Spread an invoice balance into installments with New plan."
      />

      <PlanDetailDrawer plan={selectedLive} entity={entity} currency={currency} onClose={() => setSelected(null)} />
      <NewPlanDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <div className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{children}</div>
    </div>
  );
}

const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

function PlanDetailDrawer({ plan, entity, currency, onClose }: {
  plan: PaymentPlan | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const { can } = useCan();
  const [recording, setRecording] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelPlan, { isLoading: cancelling }] = useCancelPaymentPlanMutation();
  if (!plan) return null;

  const next = nextUnpaid(plan);
  const active = plan.plan_status === "ACTIVE";
  const canRecord = active && !!plan.invoice_id && !!next && can(P.FIN_RECORD_PAYMENT);
  const canCancel = (active || plan.plan_status === "DRAFT") && can(P.FIN_CANCEL_PAYMENT_PLAN);
  const health = planHealth(plan);

  const doCancel = async () => {
    try {
      await cancelPlan({ id: plan.id, entity }).unwrap();
      toast.success("Payment plan cancelled.");
      setConfirmCancel(false); onClose();
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open={!!plan} onOpenChange={(o) => (o ? undefined : onClose())}
        title={plan.document_number} description={`Installment schedule · ${plan.customer_name}`}
        widthClass="sm:max-w-2xl"
        footer={
          <>
            {canCancel ? <Button variant="outline" onClick={() => setConfirmCancel(true)} className="gap-1.5 text-destructive"><Ban className="size-4" /> Cancel plan</Button> : null}
            {canRecord ? <Button onClick={() => setRecording(true)} className="gap-1.5"><Receipt className="size-4" /> Record installment</Button> : null}
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status"><span className={cn(PILL, health.cls)}>{health.label}</span></Field>
            <Field label="Against invoice">{plan.invoice_number ?? "-"}</Field>
            <Field label="Total"><Money kobo={plan.total_amount} currency={currency} /></Field>
            <Field label="Outstanding"><Money kobo={plan.outstanding_total} currency={currency} /></Field>
            <Field label="Settled">
              <Money kobo={plan.settled_total} currency={currency} />
              {plan.baseline_settled > 0 ? <span className="ml-1 font-mont text-[11px] font-normal text-gray-05">(incl. {formatMoney(plan.baseline_settled, currency)} pre-plan credit)</span> : null}
            </Field>
            <Field label="Scheduled"><Money kobo={plan.scheduled_total} currency={currency} /></Field>
            <Field label="Frequency"><span className="font-normal capitalize">{plan.frequency.toLowerCase()}</span></Field>
            <Field label="Installments">{plan.installment_count}</Field>
          </div>

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Schedule</p>
            <div className="overflow-hidden rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className={thCls}>#</th><th className={thCls}>Due date</th>
                  <th className={cn(thCls, "text-right")}>Amount</th><th className={thCls}>Status</th>
                </tr></thead>
                <tbody>
                  {plan.installments.map((inst) => {
                    const s = instLabel(inst, next?.id === inst.id);
                    return (
                      <tr key={inst.id}>
                        <td className={cn(tdCls, "tabular-nums text-gray-05")}>{inst.seq_no}</td>
                        <td className={cn(tdCls, "tabular-nums")}>{inst.due_date}</td>
                        <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={inst.amount} currency={currency} align="right" /></td>
                        <td className={tdCls}><span className={cn(PILL, s.cls)}>{s.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DetailDrawer>

      {recording && next && plan.invoice_id ? (
        <RecordInstallmentDrawer
          plan={plan} installment={next} entity={entity} currency={currency} onClose={() => setRecording(false)}
        />
      ) : null}

      {confirmCancel ? (
        <DetailDrawer open onOpenChange={(o) => !o && setConfirmCancel(false)} title="Cancel this plan?"
          description={`${plan.document_number} · ${plan.customer_name}`} widthClass="sm:max-w-md"
          footer={<>
            <Button variant="outline" disabled={cancelling} onClick={() => setConfirmCancel(false)}>Keep plan</Button>
            <Button disabled={cancelling} onClick={doCancel} className="gap-1.5"><Ban className="size-4" /> Cancel plan</Button>
          </>}>
          <p className="font-mont text-sm text-gray-01">Cancelling stops tracking this plan's installments. Any payments already recorded against the invoice stay posted.</p>
        </DetailDrawer>
      ) : null}
    </>
  );
}

function RecordInstallmentDrawer({ plan, installment, entity, currency, onClose }: {
  plan: PaymentPlan; installment: PaymentPlanInstallment; entity: string; currency?: string | null; onClose: () => void;
}) {
  const [amount, setAmount] = useState(installment.balance);
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [account, setAccount] = useState("");
  const [pay, { isLoading: saving }] = useRecordPaymentMutation();
  const canSubmit = amount > 0 && !!account && !!date;

  const submit = async () => {
    if (!plan.invoice_id) return;
    try {
      // The receipt advances the plan server-side (post_payment auto-syncs it), and
      // recordPayment invalidates FinancePaymentPlans, so no explicit refresh needed.
      await pay({ id: plan.invoice_id, entity, amount, payment_date: date, method, deposit_account: account }).unwrap();
      toast.success("Installment recorded. Receipt email queued.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Record installment" description={`${plan.document_number} · installment #${installment.seq_no}`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button disabled={saving || !canSubmit} onClick={submit} className="gap-1.5">
          <Receipt className="size-4" />{saving ? "Recording…" : "Record receipt"}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Posts a real receipt against invoice {plan.invoice_number} (Dr bank · Cr AR); the plan's progress updates automatically.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} /></FormField>
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 w-full rounded-md border border-white-02 bg-white px-2 font-mont text-sm">
              {METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</option>)}
            </select>
          </FormField>
          <FormField label="Deposit account" required><AccountPicker entity={entity} value={account} onChange={setAccount} postableOnly accountType="ASSET" placeholder="Bank / cash" /></FormField>
        </div>
      </div>
    </DetailDrawer>
  );
}

function NewPlanDrawer({ open, onClose, entity, currency }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null;
}) {
  const [customer, setCustomer] = useState("");
  const [invoice, setInvoice] = useState("");
  const [total, setTotal] = useState(0);
  const [startDate, setStartDate] = useState(todayISO());
  const [frequency, setFrequency] = useState("MONTHLY");
  const [count, setCount] = useState(3);
  const [create, { isLoading: creating }] = useCreatePaymentPlanMutation();
  const [activate, { isLoading: activating }] = useActivatePaymentPlanMutation();
  const saving = creating || activating;

  const invQ = useGetInvoicesQuery({ entity, search: customer, status: "POSTED" }, { skip: !customer });
  const openInvoices = useMemo(
    () => toArray(invQ.data?.data).filter((i) => i.customer_code === customer && i.balance_due > 0),
    [invQ.data, customer],
  );
  const invoiceOptions = openInvoices.map((i) => ({ value: String(i.id), label: `${i.document_number} · ${formatMoney(i.balance_due, currency)} due` }));

  const schedule = useMemo(() => previewSchedule(total, count, startDate, frequency), [total, count, startDate, frequency]);
  const canSubmit = !!customer && !!invoice && total > 0 && count >= 1 && !!startDate;

  const reset = () => { setCustomer(""); setInvoice(""); setTotal(0); setStartDate(todayISO()); setFrequency("MONTHLY"); setCount(3); };
  const close = () => { reset(); onClose(); };
  const pickInvoice = (id: string) => {
    setInvoice(id);
    const inv = openInvoices.find((i) => String(i.id) === id);
    if (inv) setTotal(inv.balance_due); // total defaults to the invoice balance
  };

  const submit = async () => {
    try {
      const res = await create({
        entity, customer: customer.trim().toUpperCase(), invoice: Number(invoice),
        start_date: startDate, frequency, installment_count: count, total_amount: total,
      }).unwrap();
      await activate({ id: res.data.id, entity }).unwrap(); // activate so it tracks immediately
      toast.success("Payment plan created.");
      close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New payment plan" description="Spread an invoice balance into scheduled installments."
      widthClass="sm:max-w-2xl"
      footer={<>
        <Button variant="outline" disabled={saving} onClick={close}>Cancel</Button>
        <Button data-guide="finance-payment-plans.submit" disabled={saving || !canSubmit} onClick={submit} className="gap-1.5">
          <Plus className="size-4" />{saving ? "Creating…" : "Create plan"}
        </Button>
      </>}
    >
      <div className="space-y-4" data-guide="finance-payment-plans.form">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Customer" required><CustomerPicker entity={entity} value={customer} onChange={(v) => { setCustomer(v); setInvoice(""); setTotal(0); }} /></FormField>
          <FormField label="Against invoice" required>
            <SearchSelect options={invoiceOptions} value={invoice} onChange={(e) => pickInvoice(e.target.value)}
              loading={invQ.isFetching} disabled={!customer}
              placeholder={customer ? "Select an open invoice" : "Select a customer first"} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Total" required><MoneyInput valueKobo={total} onChangeKobo={setTotal} currency={currency} /></FormField>
          <FormField label="Start date" required><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white" /></FormField>
          <FormField label="Installments" required><Input type="number" min={1} max={60} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="bg-white tabular-nums" /></FormField>
        </div>
        <Segmented label="Frequency" value={frequency} onChange={setFrequency} options={FREQS} />

        <div data-guide="finance-payment-plans.schedule">
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Schedule preview</p>
          <div className="overflow-hidden rounded-md border border-white-02">
            <table className="w-full border-collapse">
              <thead><tr>
                <th className={thCls}>#</th><th className={thCls}>Due date</th><th className={cn(thCls, "text-right")}>Amount</th>
              </tr></thead>
              <tbody>
                {schedule.length === 0 ? (
                  <tr><td className={cn(tdCls, "text-gray-05")} colSpan={3}>Pick an invoice and installments to preview the schedule.</td></tr>
                ) : schedule.map((s) => (
                  <tr key={s.seq}>
                    <td className={cn(tdCls, "tabular-nums text-gray-05")}>{s.seq}</td>
                    <td className={cn(tdCls, "tabular-nums")}>{s.date}</td>
                    <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={s.amount} currency={currency} align="right" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
}
