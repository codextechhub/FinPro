// Receivables → Refunds & Write-offs. Rebuilt to the Vision prototype in the house
// theme: 3 KPIs, a type filter, and a UNIFIED table of refunds + write-offs, plus
// a single "New action" drawer that toggles between refunding a credit balance to
// the bank and writing off bad debt to expense - each with a live posting preview.
//
// Honest adaptations vs the mockup:
//   • a refund's real journal is Dr customer credit (2140) · Cr Bank - it pays out
//     the customer's stored credit balance (not an open receivable), capped at the
//     available credit;
//   • a write-off is per-invoice in our ledger, so the write-off form picks one of
//     the customer's open invoices (amount defaults to / caps at its balance);
//   • refunds and write-offs can either post directly or be submitted into the
//     shared approval workflow, depending on the school's published templates.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, Search, Printer, Check, Send, Layers } from "lucide-react";
import {
  DataTable, Money, MoneyInput, DetailDrawer, FormField, Segmented,
  CustomerPicker, AccountPicker, BankAccountPicker, PostingRecap, toArray,
  type Column, type RecapRow,
  PostingDateField, InfoHint,} from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/custom/search-select";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "@/permissions";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { gateExplanation, predictsApproval } from "./adjustment-approval";
import { useAdjustmentGate } from "./use-adjustment-gate";
import { refundAmountIsWithinAvailableCredit } from "./refund-validation";
import { BatchAdjustmentDrawer } from "./batch-adjustment-drawer";
import {
  useGetArAdjustmentsQuery, useCreateRefundMutation, usePostRefundMutation,
  useSubmitRefundMutation, useCreateWriteOffRequestMutation, usePostWriteOffRequestMutation,
  useSubmitWriteOffRequestMutation, useGetInvoicesQuery, useGetRefundAvailabilityQuery,
} from "@/redux/services/finance/ar-api";
import type { ArAdjustment, RefundAvailabilityCustomer } from "@/redux/services/finance/ar-types";
import { DocumentVoidAction } from "./document-void-action";

type Mode = "REFUND" | "WRITEOFF";

function TypeChip({ kind }: { kind: Mode }) {
  const wo = kind === "WRITEOFF";
  return (
    <span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium",
      wo ? "bg-destructive/10 text-destructive" : "bg-blue-50 text-blue-700")}>
      {wo ? "Write-off" : "Refund"}
    </span>
  );
}
function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const label = normalized.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium",
      normalized === "POSTED" ? "bg-green-01/10 text-green-01"
        : normalized === "PENDING_APPROVAL" ? "bg-blue-50 text-blue-700"
          : normalized === "REVERSED" ? "bg-gray-03/60 text-gray-05"
            : "bg-amber-50 text-amber-700")}>
      {label}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="flex items-center gap-1 font-mont text-xs text-gray-05">
        {label}
        {hint ? (
          <InfoHint ariaLabel={`About ${label}`} className="size-4 text-gray-02">
            {hint}
          </InfoHint>
        ) : null}
      </p>
      <p className="mt-1 font-mont text-xl font-semibold tabular-nums text-black-01">{value}</p>
    </div>
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

export function RefundsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchParams] = useSearchParams();
  const { can } = useCan();
  const [filter, setFilter] = useState<"" | Mode>("");
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const search = useDebounce(searchInput.trim(), 350);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [batching, setBatching] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [selected, setSelected] = useState<ArAdjustment | null>(null);

  // Unified, server-paginated refunds + write-offs; KPI totals ride in the envelope.
  const params = useMemo(() => ({
    entity, page,
    ...(filter ? { type: filter.toLowerCase() } : {}),
    ...(search ? { search } : {}),
  }), [entity, page, filter, search]);
  const { data, isLoading, isFetching, isError, refetch } = useGetArAdjustmentsQuery(params);

  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const resetPage = () => setPage(1);
  const selectCls = "h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01";

  const columns: Column<ArAdjustment>[] = [
    { header: "Ref", cell: (r) => <span className="font-semibold tabular-nums">{r.reference || "-"}</span> },
    { header: "Type", cell: (r) => <TypeChip kind={r.kind} /> },
    { header: "Date", cell: (r) => <span className="tabular-nums">{r.date}</span> },
    { header: "Customer", cell: (r) => <span className="text-gray-01">{r.customer_name}</span> },
    { header: "Reason", cell: (r) => <span className="block max-w-[260px] truncate text-gray-01" title={r.reason}>{r.reason || "-"}</span> },
    { header: "Amount", align: "right", cell: (r) => <Money kobo={r.amount} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <StatusPill status={r.status || "DRAFT"} /> },
  ];

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Refundable credit" hint="Total customer credit available to refund." value={formatMoney(data?.kpis.refundable_credit ?? 0, currency)} />
        <Stat label="Written off (YTD)" value={formatMoney(data?.kpis.written_off_ytd ?? 0, currency)} />
        <Stat label="Pending approval" value={String(data?.kpis.pending ?? 0)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
            <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); resetPage(); }}
              placeholder="Search ref, customer, reason" className="h-9 w-64 bg-white pl-8 font-mont" />
          </div>
          <select value={filter} onChange={(e) => { setFilter(e.target.value as "" | Mode); resetPage(); }} className={selectCls}>
            <option value="">All</option>
            <option value="REFUND">Refunds</option>
            <option value="WRITEOFF">Write-offs</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(P.FIN_CREATE_REFUND) || can(P.FIN_CREATE_WRITE_OFF) ? (
            <Button variant="outline" onClick={() => setBatching(true)} className="gap-1.5">
              <Layers className="size-4" /> Batch actions
            </Button>
          ) : null}
          {can(P.FIN_CREATE_REFUND) || can(P.FIN_CREATE_WRITE_OFF) || can(P.FIN_WRITE_OFF_INVOICE) ? (
            <Button data-guide="finance-refunds.new-action" onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New action</Button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.key}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No refunds or write-offs"
        emptyMessage="Refund a credit balance, or write off bad debt, with New action."
      />

      <AdjustmentDetailDrawer row={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
      <NewActionDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
      <BatchAdjustmentDrawer open={batching} onClose={() => setBatching(false)} entity={entity} currency={currency} />
    </>
  );
}

function AdjustmentDetailDrawer({ row, entity, currency, onClose }: {
  row: ArAdjustment | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const { can } = useCan();
  const [post, { isLoading: posting }] = usePostRefundMutation();
  const [submitRefund, { isLoading: submittingRefund }] = useSubmitRefundMutation();
  const [postWriteOff, { isLoading: postingWriteOff }] = usePostWriteOffRequestMutation();
  const [submitWriteOff, { isLoading: submittingWriteOff }] = useSubmitWriteOffRequestMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({
    documentLabel: row?.kind === "WRITEOFF" ? "write-off" : "refund",
  });
  if (!row) return null;

  const wo = row.kind === "WRITEOFF";
  const posted = row.status === "POSTED";
  const isDraft = row.status === "DRAFT";
  // Server-computed. Refunds and write-offs are gated at any amount once the
  // ladder is published, so this is normally true - but it is read rather than
  // assumed, because a tenant that switched its own ladder off posts directly.
  const gated = row.approval_required === true;
  const recap = wo
    ? { dr: [{ code: "5300", name: "Bad debt expense", amount: row.amount }], cr: [{ code: "AR", name: "Accounts Receivable (control)", amount: row.amount }] }
    : { dr: [{ code: "2140", name: "Customer credit", amount: row.amount }], cr: [{ code: "Bank", name: "cash out", amount: row.amount }] };
  const helper = wo
    ? "Recaps the bad-debt journal - expense recognised, the receivable cleared."
    : posted
      ? "Recaps the refund journal - the customer's credit is paid out and cash leaves the bank."
      : "The journal that will post when this draft refund is posted - draws down the customer's credit, cash out.";

  const doPost = async () => {
    if (wo && !row.write_off_id) return;
    if (!wo && !row.refund_id) return;
    try {
      const res = wo
        ? await postWriteOff({ id: row.write_off_id!, entity }).unwrap()
        : await post({ id: row.refund_id!, entity }).unwrap();
      toast.success(res.message || (wo ? "Write-off posted." : "Refund posted."));
      onClose();
    } catch { /* central */ }
  };
  const doSubmit = async () => {
    if (wo && !row.write_off_id) return;
    if (!wo && !row.refund_id) return;
    try {
      const res = wo
        ? await submitWriteOff({ id: row.write_off_id!, entity }).unwrap()
        : await submitRefund({ id: row.refund_id!, entity }).unwrap();
      toast.success(res.message || `${wo ? "Write-off" : "Refund"} submitted for approval.`);
      // Submitted, but the approving role may be unstaffed - say so now rather
      // than leaving the document to sit until somebody notices. The dialog is
      // mounted in this drawer, so a parked one keeps it open to be answered.
      promptIfParked(res.data?.approval);
      if (!res.data?.approval?.parked) onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={!!row} onOpenChange={(o) => (o ? undefined : onClose())}
      title={row.reference || (wo ? "Write-off" : "Refund")}
      description={`${wo ? "Write-off" : "Refund"} · ${row.customer_name}`}
      widthClass="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="size-4" /> Print</Button>
          {!wo && posted && row.refund_id ? (
            <DocumentVoidAction
              documentType="REFUND"
              documentId={row.refund_id}
              documentNumber={row.reference || `Refund #${row.refund_id}`}
              entity={entity}
              onVoided={onClose}
            />
          ) : null}
          {isDraft && gated && can(wo ? P.FIN_SUBMIT_WRITE_OFF : P.FIN_SUBMIT_REFUND) ? (
            <Button onClick={doSubmit} disabled={submittingRefund || submittingWriteOff} className="gap-1.5">
              <Send className="size-4" />{submittingRefund || submittingWriteOff ? "Submitting…" : "Submit for approval"}
            </Button>
          ) : null}
          {isDraft && !gated && can(wo ? P.FIN_POST_WRITE_OFF : P.FIN_POST_REFUND) ? (
            <Button onClick={doPost} disabled={posting || postingWriteOff} className="gap-1.5"><Check className="size-4" />{posting || postingWriteOff ? "Posting…" : "Post"}</Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        {isDraft && gated ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">
            {wo ? "A write-off concedes income" : "A refund moves cash out"}, so it needs a second
            person's approval at any amount. Nothing reaches the ledger until it is approved.
            {!can(wo ? P.FIN_SUBMIT_WRITE_OFF : P.FIN_SUBMIT_REFUND)
              ? " You do not have permission to submit it - ask somebody who does."
              : ""}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount"><Money kobo={row.amount} currency={currency} /></Field>
          <Field label="Status"><StatusPill status={row.status || "DRAFT"} /></Field>
          <Field label={wo ? "Against invoice" : "Reference"}>{row.reference || "-"}</Field>
          <Field label="Date">{row.date}</Field>
        </div>
        <Field label="Reason"><span className="font-normal">{row.reason || "-"}</span></Field>
        <div>
          <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">GL posting</p>
          <PostingRecap title={wo ? "Write-off posting" : "Refund posting"} dr={recap.dr} cr={recap.cr} currency={currency} helper={helper} stackOnMobile />
        </div>
      </div>
      {noApproverDialog}
    </DetailDrawer>
  );
}

function NewActionDrawer({ open, onClose, entity, currency }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null;
}) {
  const { can } = useCan();
  const [mode, setMode] = useState<Mode>("REFUND");
  const [date, setDate] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [invoice, setInvoice] = useState("");
  const [expenseAccount, setExpenseAccount] = useState("");
  const [nextAction, setNextAction] = useState<"post" | "submit" | "draft">("post");
  const [refundCustomerSearch, setRefundCustomerSearch] = useState("");
  const [selectedRefundCustomer, setSelectedRefundCustomer] = useState<RefundAvailabilityCustomer | null>(null);

  const [createRefund, { isLoading: creatingR }] = useCreateRefundMutation();
  const [postRefund, { isLoading: postingR }] = usePostRefundMutation();
  const [submitRefund, { isLoading: submittingR }] = useSubmitRefundMutation();
  const [createWriteOff, { isLoading: creatingW }] = useCreateWriteOffRequestMutation();
  const [postWriteOff, { isLoading: postingW }] = usePostWriteOffRequestMutation();
  const [submitWriteOff, { isLoading: submittingW }] = useSubmitWriteOffRequestMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({
    documentLabel: mode === "WRITEOFF" ? "write-off" : "refund",
  });
  const saving = creatingR || postingR || submittingR || creatingW || postingW || submittingW;
  const wo = mode === "WRITEOFF";
  // Both rules are read up front (hooks cannot be conditional) and the active one
  // picked by mode. Used for the label and for which next actions to offer; the
  // created document's own `approval_required` still decides what runs.
  const refundGate = useAdjustmentGate("finance.refund");
  const writeOffGate = useAdjustmentGate("finance.write_off");
  const rule = wo ? writeOffGate.rule : refundGate.rule;
  const willNeedApproval = predictsApproval(rule, amount || 1);
  const gateNote = gateExplanation(rule, amount, (kobo) => formatMoney(kobo, currency));
  // Adjusted during render rather than in an effect, so the select never paints a
  // frame with a value it no longer offers.
  if (willNeedApproval && nextAction === "post") setNextAction("submit");
  const refundSearch = useDebounce(refundCustomerSearch.trim(), 250);
  // Availability is asked for **as at the chosen refund date**, not today. A refund
  // draws on credit that must already exist on its own accounting date, so a customer
  // whose receipt lands next week has nothing to refund on a date before it - and the
  // list must not offer them, or the post fails with a 409 after the form is filled.
  const refundAvailabilityQ = useGetRefundAvailabilityQuery(
    {
      entity,
      page_size: 100,
      ...(date ? { as_of: date } : {}),
      ...(refundSearch ? { search: refundSearch } : {}),
    },
    { skip: !open || wo || !date },
  );
  const refundCustomers = useMemo(
    () => toArray(refundAvailabilityQ.data?.data),
    [refundAvailabilityQ.data],
  );
  const refundCustomerOptions = useMemo(() => {
    const rows = selectedRefundCustomer
      && !refundCustomers.some((item) => item.customer_code === selectedRefundCustomer.customer_code)
      ? [selectedRefundCustomer, ...refundCustomers]
      : refundCustomers;
    return rows.map((item) => ({
      value: item.customer_code,
      label: `${item.customer_code} - ${item.customer_name} · ${formatMoney(item.refundable_credit, currency)} available`,
    }));
  }, [refundCustomers, selectedRefundCustomer, currency]);
  // Changing the date changes the answer, so the figure on screen is always read off
  // the freshest list rather than the snapshot taken when the customer was picked -
  // a stored number would quietly disagree with the date shown beside it.
  //
  // The snapshot is only a fallback for when the picked customer is legitimately
  // absent from the loaded page: mid-refetch, or narrowed out by a search. Once a
  // full, settled list comes back without them, they genuinely have no credit on
  // this date and the amount must drop to zero.
  const liveRefundCustomer = useMemo(
    () => refundCustomers.find((item) => item.customer_code === customer) ?? null,
    [refundCustomers, customer],
  );
  const activeRefundCustomer = liveRefundCustomer
    ?? ((refundAvailabilityQ.isFetching || refundSearch) ? selectedRefundCustomer : null);

  const refundableAmount = activeRefundCustomer?.refundable_credit ?? 0;
  const refundAmountIsValid = refundAmountIsWithinAvailableCredit(amount, refundableAmount);
  const refundAmountOverLimit = !wo && !!customer && amount > refundableAmount;
  const noCreditOnDate = !wo && !!customer && !!date && refundableAmount <= 0
    && !refundAvailabilityQ.isFetching;

  // Open invoices (with a balance due) for the chosen customer - write-off targets.
  const invQ = useGetInvoicesQuery({ entity, search: customer, status: "POSTED" }, { skip: !customer || !wo });
  const openInvoices = useMemo(
    () => toArray(invQ.data?.data).filter((i) => i.customer_code === customer && i.balance_due > 0),
    [invQ.data, customer],
  );
  const invoiceOptions = openInvoices.map((i) => ({ value: String(i.id), label: `${i.document_number} · ${formatMoney(i.balance_due, currency)} due` }));
  // A write-off cannot be dated before the debt it concedes exists.
  const selectedInvoice = openInvoices.find((i) => String(i.id) === invoice) ?? null;

  const recap = useMemo<{ dr: RecapRow[]; cr: RecapRow[] }>(() => {
    if (wo) {
      return {
        dr: [{ code: expenseAccount || "5300", name: "Bad debt expense", amount }],
        cr: [{ code: "AR", name: "Accounts Receivable (control)", amount }],
      };
    }
    return {
      dr: [{ code: "2140", name: "Customer credit", amount }],
      cr: [{ code: "Bank", name: "cash out", amount }],
    };
  }, [wo, expenseAccount, amount]);

  const canSubmit = wo
    ? !!customer && !!invoice && amount > 0 && !!date
    : !!customer && !!bankAccount && refundAmountIsValid && !!date;

  const reset = () => {
    setMode("REFUND"); setDate(""); setCustomer(""); setAmount(0); setReason("");
    setBankAccount(""); setInvoice(""); setExpenseAccount(""); setNextAction("post");
    setRefundCustomerSearch(""); setSelectedRefundCustomer(null);
  };
  const close = () => { reset(); onClose(); };
  const changeMode = (m: Mode) => {
    setMode(m); setCustomer(""); setInvoice(""); setAmount(0); setNextAction("post");
    setRefundCustomerSearch(""); setSelectedRefundCustomer(null);
  };
  const pickRefundCustomer = (code: string) => {
    const selected = refundCustomers.find((item) => item.customer_code === code)
      ?? (selectedRefundCustomer?.customer_code === code ? selectedRefundCustomer : null);
    setCustomer(code);
    setInvoice("");
    setSelectedRefundCustomer(selected);
    setAmount(selected?.refundable_credit ?? 0);
    setRefundCustomerSearch("");
  };
  const pickInvoice = (id: string) => {
    setInvoice(id);
    const inv = openInvoices.find((i) => String(i.id) === id);
    if (inv) setAmount(inv.balance_due); // default to the outstanding balance
  };

  const submit = async () => {
    try {
      if (wo) {
        const res = await createWriteOff({
          entity, invoice: Number(invoice), amount, write_off_account: expenseAccount || undefined,
          write_off_date: date, narration: reason.trim() || undefined, reason: reason.trim() || undefined,
        }).unwrap();
        // The draft's own answer, not the chooser's: a write-off that turns out to
        // be gated is submitted rather than sent to a post that would refuse it.
        if (nextAction === "submit" || (nextAction === "post" && res.data.approval_required)) {
          const submitted = await submitWriteOff({ id: res.data.id, entity }).unwrap();
          toast.success(submitted.message || "Write-off submitted for approval.");
          promptIfParked(submitted.data?.approval);
          if (submitted.data?.approval?.parked) return;
        } else if (nextAction === "post") {
          const postedRes = await postWriteOff({ id: res.data.id, entity }).unwrap();
          toast.success(postedRes.message || "Write-off posted.");
        } else {
          toast.success(res.message || "Write-off request saved as draft.");
        }
      } else {
        const res = await createRefund({
          entity, customer: customer.trim().toUpperCase(), refund_date: date, method: "BANK_TRANSFER",
          amount, bank_account: bankAccount ? Number(bankAccount) : undefined, narration: reason.trim() || undefined,
        }).unwrap();
        if (nextAction === "submit" || (nextAction === "post" && res.data.approval_required)) {
          const submitted = await submitRefund({ id: res.data.id, entity }).unwrap();
          toast.success(submitted.message || "Refund submitted for approval.");
          promptIfParked(submitted.data?.approval);
          if (submitted.data?.approval?.parked) return;
        } else if (nextAction === "post") {
          const postedRes = await postRefund({ id: res.data.id, entity }).unwrap();
          toast.success(postedRes.message || "Refund processed.");
        } else {
          toast.success("Refund saved as draft.");
        }
      }
      close();
    } catch { /* central */ }
  };

  const canWriteOff = can(P.FIN_CREATE_WRITE_OFF) || can(P.FIN_WRITE_OFF_INVOICE);

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title={wo ? "Write off bad debt" : "Process refund"}
      description="Choose the action and see the resulting posting."
      widthClass="sm:max-w-3xl"
      footer={
        <>
          <Button variant="outline" disabled={saving} onClick={close}>Cancel</Button>
          <Button data-guide="finance-refunds.submit" disabled={saving || !canSubmit} onClick={submit} className="gap-1.5">
            <Plus className="size-4" />
            {saving ? "Working…" : nextAction === "submit" ? "Submit for approval" : nextAction === "draft" ? "Save draft" : wo ? "Post write-off" : "Process refund"}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-guide="finance-refunds.form">
        <Segmented
          label="Action" value={mode} onChange={changeMode}
          options={[["REFUND", "Refund to bank"], ["WRITEOFF", "Write off to expense"]]}
          isDisabled={(v) => v === "WRITEOFF" && !canWriteOff}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PostingDateField
            label="Date" entity={entity} value={date} onChange={setDate}
            notBefore={wo ? selectedInvoice?.invoice_date : undefined}
            notBeforeLabel={wo && selectedInvoice ? `invoice ${selectedInvoice.document_number}` : undefined}
            hint={wo ? undefined : "Credit available is measured on this date."}
          />
          <FormField label="Customer" required>
            {wo ? (
              <CustomerPicker entity={entity} value={customer} onChange={(v) => { setCustomer(v); setInvoice(""); }} />
            ) : (
              <SearchSelect
                options={refundCustomerOptions}
                value={customer}
                onChange={(e) => pickRefundCustomer(e.target.value)}
                onSearchChange={setRefundCustomerSearch}
                loading={refundAvailabilityQ.isFetching}
                placeholder="Search customers with refundable credit"
                revealOnSearch
              />
            )}
          </FormField>
        </div>
        {!wo && refundAvailabilityQ.isError ? (
          <p className="font-mont text-xs text-destructive">Refundable customers could not be loaded. Try again.</p>
        ) : null}
        {!wo && !refundAvailabilityQ.isFetching && !refundAvailabilityQ.isError
          && refundAvailabilityQ.data && refundCustomers.length === 0 && !refundSearch ? (
            <p className="font-mont text-xs text-gray-05">
              No customer had credit available to refund as at {date}. Credit received
              later cannot fund a refund dated before it - try a later date.
            </p>
          ) : null}
        {noCreditOnDate && refundCustomers.length > 0 ? (
          <p className="font-mont text-xs text-destructive">
            {customer} has no credit available as at {date}. Pick a later refund date,
            or a different customer.
          </p>
        ) : null}

        {wo ? (
          <FormField label="Against invoice" required>
            <SearchSelect options={invoiceOptions} value={invoice} onChange={(e) => pickInvoice(e.target.value)}
              loading={invQ.isFetching} disabled={!customer}
              placeholder={customer ? "Select an open invoice" : "Select a customer first"} />
          </FormField>
        ) : (
          <FormField label="Refund to bank account" required>
            <BankAccountPicker entity={entity} value={bankAccount} onChange={setBankAccount} />
          </FormField>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Amount" required>
            <div className="space-y-1">
              <MoneyInput
                valueKobo={amount}
                onChangeKobo={setAmount}
                currency={currency}
                disabled={!wo && !customer}
              />
              {!wo && customer ? (
                <p className={cn(
                  "font-mont text-[11px]",
                  refundAmountOverLimit ? "text-destructive" : "text-gray-05",
                )}>
                  {refundAmountOverLimit
                    ? `Amount cannot exceed ${formatMoney(refundableAmount, currency)} available as at ${date}.`
                    : `${formatMoney(refundableAmount, currency)} available to refund as at ${date}.`}
                </p>
              ) : null}
            </div>
          </FormField>
          {wo ? (
            <FormField label="Write-off expense account">
              <AccountPicker entity={entity} value={expenseAccount} onChange={setExpenseAccount} accountType="EXPENSE" postableOnly
                placeholder="Defaults to bad debt (5300)" />
            </FormField>
          ) : null}
        </div>

        <FormField label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this action?" className="bg-white" /></FormField>

        <div data-guide="finance-refunds.posting">
          <PostingRecap
            title={wo ? "Write-off posting" : "Refund posting"} dr={recap.dr} cr={recap.cr} currency={currency}
            stackOnMobile
            helper={wo
              ? "A write-off recognises the loss as expense and clears the receivable."
              : "A refund pays out a credit balance - cash leaves the bank."}
          />
        </div>

        <FormField label="Next action">
          <select value={nextAction} onChange={(e) => setNextAction(e.target.value as "post" | "submit" | "draft")} className="h-9 w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-black-01 focus:border-primary focus:outline-none">
            {/* Not offered when the ladder is published: the endpoint refuses it,
                so leaving it selectable is an option that only ever errors. */}
            {!willNeedApproval ? <option value="post">Post now</option> : null}
            <option value="submit">Submit for approval</option>
            <option value="draft">Save as draft</option>
          </select>
          {gateNote ? <p className="mt-1 font-mont text-[11px] leading-5 text-gray-05">{gateNote}</p> : null}
        </FormField>
      </div>
      {noApproverDialog}
    </DetailDrawer>
  );
}
