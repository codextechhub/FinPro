// Tax Remittance / Filing, rebuilt to the Vision prototype in the house theme: KPIs +
// a filings table (lifecycle Open→Filed→Paid), a detail drawer with a lifecycle stepper
// and an "on remittance" posting recap, prepare/file/pay flows, a New-obligation drawer,
// and a printable filing pack.
//
// Backed by the real model: prepare_filing accrues from the GL control account; file
// records the reference (+ optional adjustment); pay posts Dr liability, Cr bank.

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Printer, CheckCircle2, Circle, CircleDot, Banknote, FileCheck2, Undo2 } from "lucide-react";
import { DataTable, Money, MoneyInput, DetailDrawer, FormField, AccountPicker, BankAccountPicker, TaxObligationPicker, PostingRecap, KpiCard, ConfirmActionModal, toArray, type Column, type RecapRow, PostingDateField,} from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import {
  useGetTaxFilingsQuery, useGetTaxFilingSummaryQuery, useGetTaxObligationsQuery, useCreateTaxObligationMutation,
  useCreateTaxFilingMutation, useFileTaxFilingMutation, useUnfileTaxFilingMutation, usePayTaxFilingMutation,
} from "@/redux/services/finance/ops-api";
import type { TaxFiling } from "@/redux/services/finance/ops-types";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "-");

const OB_TYPES: [string, string][] = [["VAT", "VAT"], ["WHT", "WHT"], ["PAYE", "PAYE"], ["PENSION", "Pension"], ["OTHER", "Other levy"]];
const FREQ: [string, string][] = [["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"], ["ANNUAL", "Annual"]];
// filing_status → prototype label (Open / Filed / Paid)
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Open", cls: "bg-amber-50 text-amber-700" },
  FILED: { label: "Filed", cls: "bg-blue-50 text-blue-700" },
  PAID: { label: "Paid", cls: "bg-green-01/10 text-green-01" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-03/60 text-gray-05" },
};
function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  return <span className={cn(PILL, s.cls)}>{s.label}</span>;
}
function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 w-full rounded-md border border-white-02 bg-white px-2.5 font-mont text-xs text-black-01 focus:border-primary focus:outline-none", className)}>
      {children}
    </select>
  );
}

// A compact period label from the filing's start/end dates.
function periodLabel(start: string, end: string) {
  const s = new Date(start), e = new Date(end);
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  if (sameMonth) return e.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const fullYear = s.getMonth() === 0 && e.getMonth() === 11 && s.getFullYear() === e.getFullYear();
  if (fullYear) return `FY${e.getFullYear()}`;
  return `${s.toLocaleDateString(undefined, { month: "short" })}–${e.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
}

export function TaxTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newFiling, setNewFiling] = useState(false);
  const [newObligation, setNewObligation] = useState(false);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetTaxFilingsQuery({ entity, page, ...(status ? { filing_status: status } : {}) });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;

  const summaryQ = useGetTaxFilingSummaryQuery({ entity });
  const kpis = summaryQ.data?.data ?? { outstanding: 0, open: 0, filed: 0, paid: 0 };

  const columns: Column<TaxFiling>[] = [
    { header: "Tax", cell: (f) => <span className="font-semibold text-gray-01">{f.obligation_code}</span> },
    { header: "Period", cell: (f) => <span className="tabular-nums text-gray-05">{periodLabel(f.period_start, f.period_end)}</span> },
    { header: "Authority", cell: (f) => <span className="font-mont text-[11px] text-gray-05">{f.authority_name || "-"}</span> },
    { header: "Accrued", align: "right", cell: (f) => <Money kobo={f.gross_liability} currency={currency} align="right" /> },
    { header: "Outstanding", align: "right", cell: (f) => f.balance_due > 0 ? <span className="font-mont text-xs tabular-nums text-destructive">{formatMoney(f.balance_due, currency)}</span> : <span className="text-gray-05">-</span> },
    { header: "Due date", cell: (f) => <span className="tabular-nums text-gray-05">{fmtDate(f.due_date)}</span> },
    { header: "Filing ref", cell: (f) => <span className="font-mont text-[11px] tabular-nums text-gray-05">{f.filing_reference || "-"}</span> },
    { header: "Status", cell: (f) => <StatusPill status={f.filing_status} /> },
  ];

  return (
    <div className="space-y-5" data-guide="finance-tax.workbench">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-tax.summary">
        <KpiCard label="Total outstanding" value={formatMoney(kpis.outstanding, currency)} tone={kpis.outstanding > 0 ? "alert" : "default"} foot="Filed/open, not yet remitted" />
        <KpiCard label="Open" value={String(kpis.open)} foot="Prepared, not filed" />
        <KpiCard label="Filed, awaiting payment" value={String(kpis.filed)} />
        <KpiCard label="Paid" value={String(kpis.paid)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="finance-tax.controls">
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="w-40">
          <option value="">All status</option>
          {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => printFilingPack(rows, currency)} disabled={!rows.length} className="gap-1.5"><Printer className="size-4" /> Filing pack</Button>
          <Can permission={P.FIN_MANAGE_TAX}>
            <Button variant="outline" onClick={() => setNewObligation(true)} className="gap-1.5"><Plus className="size-4" /> New obligation</Button>
          </Can>
          <Can permission={P.FIN_FILE_TAX}>
            <Button onClick={() => setNewFiling(true)} className="gap-1.5"><Plus className="size-4" /> New filing</Button>
          </Can>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(f) => f.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(f) => setSelectedId(f.id)}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No tax filings" emptyMessage="Prepare a filing from an obligation to accrue, file and remit." />

      <FilingDrawer filingId={selectedId} filings={rows} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      <NewFilingDrawer open={newFiling} onClose={() => setNewFiling(false)} entity={entity} />
      <NewObligationDrawer open={newObligation} onClose={() => setNewObligation(false)} entity={entity} />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-md border border-white-02 bg-white p-3">
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className={cn("mt-1 font-mont text-sm font-semibold tabular-nums", tone === "bad" ? "text-destructive" : "text-black-01")}>{value}</p>
    </div>
  );
}

function Step({ state, title, sub }: { state: "done" | "current" | "todo"; title: string; sub: string }) {
  const Icon = state === "done" ? CheckCircle2 : state === "current" ? CircleDot : Circle;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className={cn("mt-0.5 size-4 shrink-0", state === "done" ? "text-green-01" : state === "current" ? "text-primary" : "text-gray-03")} />
      <div>
        <p className={cn("font-mont text-xs font-semibold", state === "todo" ? "text-gray-05" : "text-black-01")}>{title}</p>
        <p className="font-mont text-[11px] text-gray-05">{sub}</p>
      </div>
    </div>
  );
}

function FilingDrawer({ filingId, filings, entity, currency, onClose }: { filingId: number | null; filings: TaxFiling[]; entity: string; currency?: string | null; onClose: () => void }) {
  const f = useMemo(() => filings.find((x) => x.id === filingId) ?? null, [filings, filingId]);
  const [filing, setFiling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [unfiling, setUnfiling] = useState(false);
  const [unfile, { isLoading: unfilingBusy }] = useUnfileTaxFilingMutation();
  const doUnfile = async () => {
    if (!f) return;
    try { const r = await unfile({ id: f.id, entity }).unwrap(); toast.success(r.message || "Filing reverted to draft."); setUnfiling(false); onClose(); }
    catch { /* central */ }
  };
  if (filingId == null || !f) return null;

  const filed = f.filing_status === "FILED" || f.filing_status === "PAID";
  const paid = f.filing_status === "PAID";
  // A filed-but-unpaid return can be reverted to draft; once any cash is remitted the
  // backend refuses, so only offer it while nothing has been paid.
  const canUnfile = f.filing_status === "FILED" && f.amount_paid === 0;
  const dr: RecapRow[] = [{ code: f.liability_account || "-", name: f.liability_account_name || `${f.obligation_code} payable`, amount: f.balance_due || f.amount_due }];
  const cr: RecapRow[] = [{ code: "Bank", name: paid ? "remitted" : "chosen on payment", amount: f.balance_due || f.amount_due }];

  return (
    <>
      <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
        title={`${f.obligation_code} - ${periodLabel(f.period_start, f.period_end)}`}
        description={`${f.authority_name || "-"} · due ${fmtDate(f.due_date)}`} widthClass="sm:max-w-2xl"
        footer={<>
          <StatusPill status={f.filing_status} />
          <div className="flex-1" />
          {f.filing_status === "DRAFT" ? <Can permission={P.FIN_FILE_TAX}><Button onClick={() => setFiling(true)} className="gap-1.5"><FileCheck2 className="size-4" /> Mark as filed</Button></Can> : null}
          {canUnfile ? <Can permission={P.FIN_FILE_TAX}><Button variant="outline" disabled={unfilingBusy} onClick={() => setUnfiling(true)} className="gap-1.5"><Undo2 className="size-4" /> Un-file</Button></Can> : null}
          {f.filing_status === "FILED" ? <Can permission={P.FIN_PAY_TAX}><Button onClick={() => setPaying(true)} className="gap-1.5"><Banknote className="size-4" /> Pay {formatMoney(f.balance_due, currency)}</Button></Can> : null}
        </>}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Accrued" value={formatMoney(f.gross_liability, currency)} />
            <Metric label="Amount due" value={formatMoney(f.amount_due, currency)} />
            <Metric label="Outstanding" value={formatMoney(f.balance_due, currency)} tone={f.balance_due > 0 ? "bad" : undefined} />
            <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">Status</p><div className="mt-1.5"><StatusPill status={f.filing_status} /></div></div>
          </div>

          <div className="rounded-md border border-white-02 bg-white p-4">
            <p className="mb-3 font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">Filing lifecycle</p>
            <div className="space-y-3">
              <Step state="done" title="Accrued" sub={`Posted to ${f.liability_account_name || f.obligation_code + " payable"} during the period`} />
              <Step state={filed ? "done" : "current"} title="Filed with authority" sub={filed ? `Filed${f.filing_reference ? ` · ref ${f.filing_reference}` : ""}${f.filed_at ? ` · ${fmtDate(f.filed_at)}` : ""}` : "Not yet filed"} />
              <Step state={paid ? "done" : filed ? "current" : "todo"} title="Paid / remitted" sub={paid ? "Remitted in full" : f.amount_paid > 0 ? `Part-paid · ${formatMoney(f.balance_due, currency)} left` : "Awaiting payment"} />
            </div>
          </div>

          {!paid ? (
            <div>
              <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">On remittance</p>
              <PostingRecap title="Remittance posting" dr={dr} cr={cr} currency={currency} helper="The bank account is chosen when you pay." />
            </div>
          ) : null}
        </div>
      </DetailDrawer>

      {filing ? <FileDrawer filing={f} entity={entity} currency={currency} onClose={() => setFiling(false)} /> : null}
      {paying ? <PayDrawer filing={f} entity={entity} currency={currency} onClose={() => setPaying(false)} /> : null}
      <ConfirmActionModal
        open={unfiling}
        onOpenChange={setUnfiling}
        title={`Un-file ${f.obligation_code} - ${periodLabel(f.period_start, f.period_end)}?`}
        description="Reverts this return to draft and reverses its netting/penalty journal. Use it to correct a return filed in error. Only possible while nothing has been remitted."
        confirmText="Un-file return"
        destructive
        loading={unfilingBusy}
        onConfirm={doUnfile}
      />
    </>
  );
}

function FileDrawer({ filing, entity, currency, onClose }: { filing: TaxFiling; entity: string; currency?: string | null; onClose: () => void }) {
  const [filedDate, setFiledDate] = useState("");
  const [ref, setRef] = useState("");
  const [adjust, setAdjust] = useState(0);
  const [adjustAccount, setAdjustAccount] = useState("");
  const [file, { isLoading }] = useFileTaxFilingMutation();
  const submit = async () => {
    try {
      const r = await file({ id: filing.id, entity, filed_date: filedDate, filing_reference: ref.trim() || undefined, adjustment_amount: adjust || undefined, adjustment_account: adjust ? (adjustAccount || undefined) : undefined }).unwrap();
      toast.success(r.message || "Filed."); onClose();
    } catch { /* central */ }
  };
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title="File return" description={`${filing.obligation_code} · ${periodLabel(filing.period_start, filing.period_end)}`} widthClass="sm:max-w-md"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !filedDate || (!!adjust && !adjustAccount)} onClick={submit} className="gap-1.5"><FileCheck2 className="size-4" />{isLoading ? "Filing…" : "Mark as filed"}</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03/40 px-3 py-2 font-mont text-[11px] text-gray-05">Records the return with the authority. Filing nets recoverable input tax and books any penalty/adjustment; it doesn't move cash - that's the payment.</p>
        <div className="grid grid-cols-2 gap-3">
          <PostingDateField label="Filed date" entity={entity} value={filedDate} onChange={setFiledDate} />
          <FormField label="Filing reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. FIRS-2026-4481" className="h-9 bg-white" /></FormField>
        </div>
        <FormField label="Adjustment / penalty"><MoneyInput valueKobo={adjust} onChangeKobo={setAdjust} currency={currency} className="[&_input]:h-9" /></FormField>
        {adjust ? <FormField label="Adjustment account (expense)" required><AccountPicker entity={entity} value={adjustAccount} onChange={setAdjustAccount} accountType="EXPENSE" postableOnly /></FormField> : null}
      </div>
    </DetailDrawer>
  );
}

function PayDrawer({ filing, entity, currency, onClose }: { filing: TaxFiling; entity: string; currency?: string | null; onClose: () => void }) {
  const [bank, setBank] = useState("");
  const [payDate, setPayDate] = useState("");
  const [amount, setAmount] = useState(filing.balance_due);
  const [pay, { isLoading }] = usePayTaxFilingMutation();
  const submit = async () => {
    try {
      const r = await pay({ id: filing.id, entity, bank_account: bank, pay_date: payDate, amount: amount !== filing.balance_due ? amount : undefined }).unwrap();
      toast.success(r.message || "Remitted."); onClose();
    } catch { /* central */ }
  };
  return (
    <DetailDrawer open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Remit tax" description={`${filing.obligation_code} · outstanding ${formatMoney(filing.balance_due, currency)}`} widthClass="sm:max-w-md"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !bank || amount <= 0} onClick={submit} className="gap-1.5"><Banknote className="size-4" />{isLoading ? "Paying…" : `Pay ${formatMoney(amount, currency)}`}</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">Remits the liability - Dr {filing.liability_account || filing.obligation_code + " payable"}, Cr bank. Partial payments are allowed; the filing closes once the balance is cleared.</p>
        <FormField label="Pay from (bank account)" required><BankAccountPicker entity={entity} value={bank} onChange={setBank} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <PostingDateField
            label="Payment date" entity={entity} value={payDate} onChange={setPayDate}
            notBefore={filing.filed_at}
            notBeforeLabel={`tax filing ${filing.document_number}`}
          />
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} className="[&_input]:h-9" /></FormField>
        </div>
      </div>
    </DetailDrawer>
  );
}

function NewFilingDrawer({ open, onClose, entity }: { open: boolean; onClose: () => void; entity: string }) {
  const [obligation, setObligation] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [due, setDue] = useState("");
  const { data: obData } = useGetTaxObligationsQuery({ entity, is_active: "true" }, { skip: !open });
  const obligations = useMemo(() => toArray(obData?.data), [obData]);
  const obId = obligations.find((o) => o.code === obligation)?.id;
  const [create, { isLoading }] = useCreateTaxFilingMutation();
  const close = () => { setObligation(""); setStart(""); setEnd(""); setDue(""); onClose(); };
  const submit = async () => {
    if (!obId) return;
    try {
      const r = await create({ entity, obligation: obId, period_start: start, period_end: end, due_date: due || undefined }).unwrap();
      toast.success(r.message || "Filing prepared."); close();
    } catch { /* central */ }
  };
  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New filing" description="Prepare a return - accrues the period's liability from the GL." widthClass="sm:max-w-md"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !obId || !start || !end} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Preparing…" : "Prepare filing"}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label="Tax obligation" required><TaxObligationPicker entity={entity} value={obligation} onChange={setObligation} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Period start" required><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 bg-white" /></FormField>
          <FormField label="Period end" required><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 bg-white" /></FormField>
        </div>
        <FormField label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 bg-white" /></FormField>
        <p className="font-mont text-[11px] text-gray-05">The accrued amount is read from the obligation's liability control account over the period.</p>
      </div>
    </DetailDrawer>
  );
}

function NewObligationDrawer({ open, onClose, entity }: { open: boolean; onClose: () => void; entity: string }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("VAT");
  const [authority, setAuthority] = useState("");
  const [account, setAccount] = useState("");
  const [freq, setFreq] = useState("MONTHLY");
  const [day, setDay] = useState("21");
  const [create, { isLoading }] = useCreateTaxObligationMutation();
  const close = () => { setCode(""); setName(""); setType("VAT"); setAuthority(""); setAccount(""); setFreq("MONTHLY"); setDay("21"); onClose(); };
  const submit = async () => {
    try {
      const r = await create({ entity, code: code.trim(), name: name.trim() || undefined, obligation_type: type, liability_account: account, authority_name: authority.trim() || undefined, frequency: freq, filing_day: Number(day) || 21 }).unwrap();
      toast.success(r.message || "Obligation created."); close();
    } catch { /* central */ }
  };
  return (
    <DetailDrawer open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New tax obligation" description="A statutory tax this entity must file and remit." widthClass="sm:max-w-md"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
        <Button disabled={isLoading || !code.trim() || !account} onClick={submit} className="gap-1.5"><Plus className="size-4" />{isLoading ? "Creating…" : "Create obligation"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Code" required><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. NHF" className="h-9 bg-white" /></FormField>
          <div><p className="mb-1 font-mont text-xs text-gray-05">Type</p><Select value={type} onChange={setType}>{OB_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
        </div>
        <FormField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. National Housing Fund" className="h-9 bg-white" /></FormField>
        <FormField label="Liability (payable) account" required><AccountPicker entity={entity} value={account} onChange={setAccount} accountType="LIABILITY" postableOnly /></FormField>
        <FormField label="Authority"><Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="e.g. FMBN" className="h-9 bg-white" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="mb-1 font-mont text-xs text-gray-05">Frequency</p><Select value={freq} onChange={setFreq}>{FREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          <FormField label="Filing day"><Input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} className="h-9 bg-white" /></FormField>
        </div>
      </div>
    </DetailDrawer>
  );
}

function printFilingPack(filings: TaxFiling[], currency?: string | null) {
  const money = (k: number) => formatMoney(k, currency);
  const rows = filings.map((f) => `<tr>
    <td>${f.obligation_code}</td><td>${periodLabel(f.period_start, f.period_end)}</td><td>${f.authority_name || "-"}</td>
    <td class="r">${money(f.gross_liability)}</td><td class="r">${money(f.balance_due)}</td>
    <td>${f.due_date ? new Date(f.due_date).toLocaleDateString() : "-"}</td><td>${f.filing_reference || "-"}</td>
    <td>${(STATUS[f.filing_status] ?? STATUS.DRAFT).label}</td></tr>`).join("");
  const totalAccrued = filings.reduce((s, f) => s + f.gross_liability, 0);
  const totalOutstanding = filings.reduce((s, f) => s + f.balance_due, 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tax filing pack</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;max-width:900px;margin:auto}
  h1{font-size:18px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:7px 8px;border-bottom:1px solid #eee;text-align:left}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#888}td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
  .tot td{font-weight:700;border-top:2px solid #ddd;border-bottom:none}</style></head><body>
  <h1>Tax filing pack</h1>
  <div class="sub">Statutory obligations · generated ${new Date().toLocaleString()}</div>
  <table><thead><tr><th>Tax</th><th>Period</th><th>Authority</th><th class="r">Accrued</th><th class="r">Outstanding</th><th>Due date</th><th>Filing ref</th><th>Status</th></tr></thead>
  <tbody>${rows}<tr class="tot"><td colspan="3">Total</td><td class="r">${money(totalAccrued)}</td><td class="r">${money(totalOutstanding)}</td><td colspan="3"></td></tr></tbody></table>
  </body></html>`;
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) { toast.error("Pop-up blocked - allow pop-ups to print."); return; }
  w.document.write(html); w.document.close(); w.focus(); w.print();
}
