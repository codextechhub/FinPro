/**
 * Receivables → Credit / Debit Notes. Rebuilt to the Vision-Finance-Board
 * prototype in the house theme: a filter-dropdown list (no KPIs), a single-panel
 * detail drawer that recaps the REAL journal as a DR/CR card, and an "Issue note"
 * drawer whose live posting preview mirrors what will post.
 *
 * Honest adaptations vs the mockup:
 *   • our credit/debit note is line-based and requires a GL account, so the
 *     single-amount form carries an explicit Revenue/Income account picker and
 *     submits one line under the hood;
 *   • a debit note increases the receivable and cannot be allocated, so
 *     "Apply to balance" and the auto-allocate toggle show only for credit notes;
 *   • "Issue note" creates then posts - the auto-allocate toggle chooses whether
 *     it lands "Issued" (auto_allocate:false) or is applied oldest-first ("Applied").
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { Plus, Printer, Check, Search, Send } from "lucide-react";
import {
  DataTable, Money, MoneyInput, ConfirmActionModal, DetailDrawer, FormField,
  CustomerPicker, AccountPicker, CostCenterPicker, PostingRecap, Segmented, toArray, type Column, type RecapRow,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/custom/search-select";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { gateExplanation, primaryAction } from "./adjustment-approval";
import { useAdjustmentGate } from "./use-adjustment-gate";
import {
  useGetCreditNotesQuery, useCreateCreditNoteMutation, usePostCreditNoteMutation,
  useSubmitCreditNoteMutation,
  useAllocateCreditNoteMutation, useGetInvoicesQuery,
} from "@/redux/services/finance/ar-api";
import type { CreditNote } from "@/redux/services/finance/ar-types";
import { DocumentVoidAction } from "./document-void-action";

const kindLabel = (k: string) => (k === "DEBIT" ? "Debit note" : "Credit note");
const DRAWER_W = "sm:max-w-3xl";

// Truncate a long reason to a word count with an ellipsis (full text on hover).
const REASON_MAX_WORDS = 3;
function shortenReason(s: string): string {
  const words = s.trim().split(/\s+/);
  return words.length > REASON_MAX_WORDS ? `${words.slice(0, REASON_MAX_WORDS).join(" ")}…` : s;
}

// Posted credit note fully applied → "Applied"; otherwise "Issued". Debit notes
// can't be allocated, so a posted debit note is always "Issued". Unposted → "Draft",
// except one waiting on an approver, which is neither.
function noteStatus(n: CreditNote): "DRAFT" | "PENDING_APPROVAL" | "ISSUED" | "APPLIED" | "REVERSED" {
  if (n.status === "REVERSED") return "REVERSED";
  // A note awaiting approval is not a draft: it cannot be edited, and showing it
  // as one invites somebody to try to post it again.
  if (n.status === "PENDING_APPROVAL") return "PENDING_APPROVAL";
  if (n.status !== "POSTED") return "DRAFT";
  if (n.kind === "CREDIT" && n.allocated_amount > 0 && n.unallocated_amount <= 0) return "APPLIED";
  return "ISSUED";
}
const STATUS_PILL: Record<string, string> = {
  DRAFT: "bg-gray-03/60 text-gray-05",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  ISSUED: "bg-blue-50 text-blue-700",
  APPLIED: "bg-green-01/10 text-green-01",
  REVERSED: "bg-gray-03/60 text-gray-05",
};
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", PENDING_APPROVAL: "Awaiting approval", ISSUED: "Issued", APPLIED: "Applied", REVERSED: "Voided" };

function TypeChip({ kind }: { kind: string }) {
  const debit = kind === "DEBIT";
  return (
    <span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium",
      debit ? "bg-amber-50 text-amber-700" : "bg-green-01/10 text-green-01")}>
      {kindLabel(kind)}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[10px] font-semibold text-primary">{init || "-"}</span>;
}


// Recap the journal a posted note raises, from the note's own lines (so it shows
// the real revenue accounts). Debit: Dr AR, Cr revenue (+ tax). Credit: Dr revenue
// (+ tax), Cr AR for the applied portion and Cr 2140 customer-credit for the rest.
function noteRecap(n: CreditNote): { dr: RecapRow[]; cr: RecapRow[] } {
  const debit = n.kind === "DEBIT";
  const lines = n.lines.length
    ? n.lines
    : [{ revenue_account: "-", net_amount: n.total, tax_amount: 0, cost_center: null } as CreditNote["lines"][number]];
  const rev: RecapRow[] = [];
  for (const l of lines) {
    const base = debit ? "Revenue" : "Revenue / returns";
    rev.push({ code: l.revenue_account || "-", name: l.cost_center ? `${base} · ${l.cost_center}` : base, amount: l.net_amount });
    if (l.tax_amount) rev.push({ code: "TAX", name: debit ? "Output tax" : "Output tax reversal", amount: l.tax_amount });
  }
  if (debit) {
    return { dr: [{ code: "AR", name: "Accounts Receivable (control)", amount: n.total }], cr: rev };
  }
  const cr: RecapRow[] = [];
  if (n.allocated_amount > 0) cr.push({ code: "AR", name: "Accounts Receivable (control)", amount: n.allocated_amount });
  if (n.unallocated_amount > 0) cr.push({ code: "2140", name: "Customer credit", amount: n.unallocated_amount });
  if (cr.length === 0) cr.push({ code: "AR", name: "Accounts Receivable (control)", amount: n.total });
  return { dr: rev, cr };
}

export function CreditNotesTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchParams] = useSearchParams();
  const [typeFilter, setTypeFilter] = useState("");   // "" | CREDIT | DEBIT
  const [statusFilter, setStatusFilter] = useState(""); // "" | ISSUED | APPLIED
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const search = useDebounce(searchInput.trim(), 350);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_CREATE_CREDIT_NOTE), () => setCreating(true));
  const [selected, setSelected] = useState<CreditNote | null>(null);

  // Filters + search + paging are server-side so they work across the whole set.
  const params = useMemo(() => ({
    entity, page,
    ...(typeFilter ? { kind: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search ? { search } : {}),
  }), [entity, page, typeFilter, statusFilter, search]);
  const { data, isLoading, isFetching, isError, refetch } = useGetCreditNotesQuery(params);
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const resetPage = () => setPage(1);

  const selectCls = "h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01";

  const columns: Column<CreditNote>[] = [
    { header: "Note no.", cell: (r) => <span className="font-semibold tabular-nums">{r.document_number}</span> },
    { header: "Type", cell: (r) => <TypeChip kind={r.kind} /> },
    { header: "Date", cell: (r) => <span className="tabular-nums">{r.note_date}</span> },
    { header: "Customer", cell: (r) => (
      <span className="inline-flex items-center gap-2"><Initials name={r.customer_name} /><span className="font-medium text-gray-01">{r.customer_name}</span></span>
    ) },
    { header: "Against invoice", cell: (r) => <span className="tabular-nums text-gray-05">{r.invoice_number ?? "-"}</span> },
    { header: "Reason", cell: (r) => <span className="block max-w-[240px] truncate text-gray-01" title={r.reason}>{r.reason ? shortenReason(r.reason) : "-"}</span> },
    { header: "Amount", align: "right", cell: (r) => (
      // Credit notes reduce the balance (green); debit notes increase it (red) -
      // the same colour convention as the DR/CR posting recap.
      <Money kobo={r.total} currency={currency} align="right"
        className={r.kind === "DEBIT" ? "text-destructive" : "text-green-01"} />
    ) },
    { header: "Status", cell: (r) => {
      const s = noteStatus(r);
      return <span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium", STATUS_PILL[s])}>{STATUS_LABEL[s]}</span>;
    } },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
            <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); resetPage(); }}
              placeholder="Search note no., customer, reason" className="h-9 w-64 bg-white pl-8 font-mont" />
          </div>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); resetPage(); }} className={selectCls}>
            <option value="">All notes</option>
            <option value="CREDIT">Credit notes</option>
            <option value="DEBIT">Debit notes</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }} className={selectCls}>
            <option value="">All status</option>
            <option value="ISSUED">Issued</option>
            <option value="APPLIED">Applied</option>
          </select>
        </div>
        <Can permission={P.FIN_CREATE_CREDIT_NOTE}>
          <Button data-guide="finance-credit-notes.issue" onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> Issue note</Button>
        </Can>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No credit / debit notes"
        emptyMessage="Issue a credit note to reduce - or a debit note to increase - a customer's balance."
      />

      <NoteDetailDrawer note={selected} entity={entity} currency={currency} onClose={() => setSelected(null)} />
      <IssueNoteDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
    </>
  );
}

function NoteDetailDrawer({ note, entity, currency, onClose }: {
  note: CreditNote | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const { can } = useCan();
  const [confirmApply, setConfirmApply] = useState(false);
  const [allocate, { isLoading: applying }] = useAllocateCreditNoteMutation();

  if (!note) return null;
  const status = noteStatus(note);
  const canApply =
    can(P.FIN_ALLOCATE_CREDIT_NOTE) && note.kind === "CREDIT" && status === "ISSUED" && note.unallocated_amount > 0;
  const recap = noteRecap(note);

  const doApply = async () => {
    try {
      const body = note.invoice_id
        ? { id: note.id, entity, allocations: [{ invoice: note.invoice_id, amount: note.unallocated_amount }] }
        : { id: note.id, entity, auto_allocate: true };
      const res = await allocate(body).unwrap();
      toast.success(res.message || "Credit applied to the customer's balance.");
      setConfirmApply(false);
      onClose();
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open={!!note} onOpenChange={(o) => (o ? undefined : onClose())}
        title={note.document_number}
        description={`${kindLabel(note.kind)} · ${note.customer_name}`}
        widthClass={DRAWER_W}
        footer={
          <>
            <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="size-4" /> Print</Button>
            {note.status === "POSTED" ? (
              <DocumentVoidAction
                documentType="CREDIT_NOTE"
                documentVariant={note.kind}
                documentId={note.id}
                documentNumber={note.document_number}
                entity={entity}
                onVoided={onClose}
              />
            ) : null}
            {canApply ? (
              <Button onClick={() => setConfirmApply(true)} className="gap-1.5"><Check className="size-4" /> Apply to balance</Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount"><Money kobo={note.total} currency={currency} /></Field>
            <Field label="Status"><span className={cn("inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium", STATUS_PILL[status])}>{STATUS_LABEL[status]}</span></Field>
            <Field label="Against invoice">{note.invoice_number ?? "-"}</Field>
            <Field label="Date">{note.note_date}</Field>
          </div>
          <Field label="Reason"><span className="font-normal">{note.reason || "-"}</span></Field>

          {note.kind === "CREDIT" && note.allocated_amount > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Applied"><Money kobo={note.allocated_amount} currency={currency} /></Field>
              <Field label="Unapplied"><Money kobo={note.unallocated_amount} currency={currency} /></Field>
            </div>
          ) : null}

          {status !== "DRAFT" ? (
            <div>
              <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">GL posting</p>
              <PostingRecap
                title={`${kindLabel(note.kind)} posting`} dr={recap.dr} cr={recap.cr} currency={currency}
                helper="This recaps the journal booked when the note was posted. Applying the credit to invoices reclassifies it from customer credit (2140) back to AR - a new journal posts."
              />
            </div>
          ) : null}
        </div>
      </DetailDrawer>

      <ConfirmActionModal
        open={confirmApply} onOpenChange={(o) => !o && setConfirmApply(false)}
        title="Apply this credit to the customer's balance?"
        description={note.invoice_id
          ? `Applies ${formatMoney(note.unallocated_amount, currency)} of credit against ${note.invoice_number}.`
          : `Applies ${formatMoney(note.unallocated_amount, currency)} of credit to the customer's open invoices, oldest first.`}
        confirmText="Apply" loading={applying} onConfirm={doApply}
      />
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

function IssueNoteDrawer({ open, onClose, entity, currency }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null;
}) {
  const [kind, setKind] = useState("CREDIT");
  const [date, setDate] = useState("");
  const [customer, setCustomer] = useState("");
  const [account, setAccount] = useState("");
  const [invoice, setInvoice] = useState(""); // invoice id, optional
  const [amount, setAmount] = useState(0);
  const [costCenter, setCostCenter] = useState(""); // optional analytics tag on the line
  const [reason, setReason] = useState("");
  const [applyNow, setApplyNow] = useState(false); // credit notes only

  const [create, { isLoading: creating }] = useCreateCreditNoteMutation();
  const [post, { isLoading: posting }] = usePostCreditNoteMutation();
  const [submitForApproval, { isLoading: submitting }] = useSubmitCreditNoteMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "note" });
  const saving = creating || posting || submitting;
  const debit = kind === "DEBIT";
  // Labels only, from the published ladder - the created note's own
  // `approval_required` is what the flow actually acts on.
  const { rule } = useAdjustmentGate("finance.credit_note");
  const willNeedApproval = primaryAction(undefined, rule, amount) === "submit";
  const gateNote = gateExplanation(rule, amount, (kobo) => formatMoney(kobo, currency));

  // Posted invoices that still owe money, for the chosen customer - a searchable
  // list. A credit note applies against an outstanding balance, so fully-paid /
  // fully-credited invoices (balance_due = 0) are excluded.
  const invQ = useGetInvoicesQuery({ entity, search: customer, status: "POSTED" }, { skip: !customer });
  const invoiceOptions = useMemo(() =>
    toArray(invQ.data?.data)
      .filter((i) => i.customer_code === customer && i.balance_due > 0)
      .map((i) => ({ value: String(i.id), label: `${i.document_number} · ${formatMoney(i.balance_due, currency)} due` })),
  [invQ.data, customer, currency]);

  const recap = useMemo(() => {
    const revName = (debit ? "Income" : "Revenue (reversed)") + (costCenter ? ` · ${costCenter}` : "");
    const rev: RecapRow = { code: account || "-", name: revName, amount };
    const ar: RecapRow = { code: "AR", name: "Accounts Receivable (control)", amount };
    if (debit) return { dr: [ar], cr: [rev] };
    // A credit applied on issue settles invoices (Cr AR); otherwise it sits as
    // customer credit (Cr 2140) until applied or refunded.
    const target: RecapRow = applyNow ? ar : { code: "2140", name: "Customer credit", amount };
    return { dr: [rev], cr: [target] };
  }, [debit, account, amount, costCenter, applyNow]);

  const canSubmit = !!customer && !!account && amount > 0 && reason.trim() !== "";

  const reset = () => { setKind("CREDIT"); setDate(""); setCustomer(""); setAccount(""); setInvoice(""); setAmount(0); setCostCenter(""); setReason(""); setApplyNow(false); };
  const close = () => { reset(); onClose(); };
  const changeKind = (k: string) => { setKind(k); if (k === "DEBIT") setApplyNow(false); };

  const submit = async () => {
    try {
      const res = await create({
        entity, customer: customer.trim().toUpperCase(), kind, note_date: date,
        invoice: invoice ? Number(invoice) : undefined, reason: reason.trim(),
        lines: [{ revenue_account: account, description: reason.trim(), quantity: 1, unit_price: amount, cost_center: costCenter || undefined }],
      }).unwrap();
      // Post immediately. For credit notes the toggle decides: auto-allocate
      // oldest-first ("Applied") or leave the credit unapplied ("Issued").
      // Above the threshold the ledger is out of reach until somebody approves, so
      // the note is submitted instead of issued - and the "apply now" choice waits
      // with it, since there is nothing posted to allocate yet.
      if (res.data.approval_required) {
        const sent = await submitForApproval({ id: res.data.id, entity }).unwrap();
        toast.success(`${kindLabel(kind)} submitted for approval.`);
        promptIfParked(sent.data?.approval);
        // A parked submission keeps the drawer open: the dialog is mounted in it.
        if (!sent.data?.approval?.parked) close();
        return;
      }
      const auto = !debit && applyNow;
      await post({ id: res.data.id, entity, auto_allocate: auto }).unwrap();
      toast.success(auto ? `${kindLabel(kind)} issued and applied.` : `${kindLabel(kind)} issued.`);
      close();
    } catch { /* central - a create that posts-failed leaves a draft, surfaced as the error */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="Issue credit / debit note"
      description="Reduce (credit) or increase (debit) the customer balance."
      widthClass={DRAWER_W}
      footer={
        <>
          <Button variant="outline" disabled={saving} onClick={close}>Cancel</Button>
          <Button data-guide="finance-credit-notes.submit" disabled={saving || !canSubmit} onClick={submit} className="gap-1.5">
            {willNeedApproval ? <Send className="size-4" /> : <Plus className="size-4" />}
            {saving ? "Working…" : willNeedApproval ? "Submit for approval" : "Issue note"}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-guide="finance-credit-notes.form">
        {gateNote ? (
          <p className={`rounded-md border px-3 py-2 font-mont text-xs leading-5 ${
            willNeedApproval
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-white-02 bg-gray-01/5 text-gray-05"
          }`}>
            {gateNote}
            {willNeedApproval && !debit && applyNow
              ? " Applying it to the balance waits until it is approved."
              : ""}
          </p>
        ) : null}
        <Segmented label="Note type" value={kind} onChange={changeKind} options={[["CREDIT", "Credit note"], ["DEBIT", "Debit note"]]} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PostingDateField label="Date" entity={entity} value={date} onChange={setDate} />
          <FormField label="Customer" required><CustomerPicker entity={entity} value={customer} onChange={(v) => { setCustomer(v); setInvoice(""); }} /></FormField>
        </div>

        <FormField label={debit ? "Income account" : "Revenue account"} required>
          <AccountPicker entity={entity} value={account} onChange={setAccount} accountType="INCOME" postableOnly
            placeholder={debit ? "Account to credit" : "Revenue account to reverse"} />
        </FormField>

        <FormField label="Against invoice">
          <SearchSelect options={invoiceOptions} value={invoice} onChange={(e) => setInvoice(e.target.value)}
            loading={invQ.isFetching} disabled={!customer}
            placeholder={customer ? "Optional - search this customer's invoices" : "Select a customer first"} />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Amount" required><MoneyInput valueKobo={amount} onChangeKobo={setAmount} currency={currency} /></FormField>
          <FormField label="Cost centre"><CostCenterPicker entity={entity} value={costCenter} onChange={setCostCenter} /></FormField>
        </div>

        <FormField label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this adjustment?" className="bg-white" /></FormField>

        <div data-guide="finance-credit-notes.posting">
          <PostingRecap
            title={`${kindLabel(kind)} posting`} dr={recap.dr} cr={recap.cr} currency={currency}
            helper={debit
              ? "A debit note raises an additional charge and increases the customer's balance."
              : "A credit note lowers the customer's balance and reverses recognised revenue."}
          />
        </div>

        {!debit ? (
          <Segmented
            label="Apply on issue?" value={applyNow ? "apply" : "keep"} onChange={(v) => setApplyNow(v === "apply")}
            options={[["keep", "Leave as credit (Issued)"], ["apply", "Apply to oldest invoices (Applied)"]]}
          />
        ) : null}
      </div>
      {noApproverDialog}
    </DetailDrawer>
  );
}
