// Operations → Expense Claims, rebuilt to the Vision prototype in the house theme:
// KPIs, a search/status list, and a detail drawer with an approval-workflow
// stepper, line items (cost center + receipt attachment), and Approve / Reject /
// Pay / Print actions.
//
// Honest adaptations: the prototype's school "Branch" column/filter is dropped
// (claims are by staff, classified by cost center, which we keep). The 3-step
// stepper maps to our real states - Submitted (draft) → Approved & accrued
// (post: Dr expense / Cr accrued reimbursement) → Reimbursed (settle: Cr bank).

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useActionParam } from "@/hooks/use-action-param";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import {
  Plus, Search, Trash2, Check, X, Printer, Wallet, Paperclip, UploadCloud, CircleDashed, CircleCheck, Ban, Send,
} from "lucide-react";
import {
  DataTable, Money, MoneyInput, DetailDrawer, FormField, ConfirmActionModal,
  AccountPicker, TaxCodePicker, CostCenterPicker, BankAccountPicker, toArray, type Column,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { P } from "../../../permissions";
import { openAttachment } from "@/utils/attachment-download";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import {
  useGetExpenseClaimsQuery, useGetExpenseClaimSummaryQuery, useGetExpenseClaimQuery, useCreateExpenseClaimMutation,
  usePostExpenseClaimMutation, useRejectExpenseClaimMutation, useSettleExpenseClaimMutation, useVoidExpenseClaimMutation,
  useUploadExpenseReceiptMutation, useDeleteExpenseReceiptMutation, useSubmitExpenseClaimMutation,
} from "@/redux/services/finance/ops-api";
import type { ExpenseClaim, ExpenseClaimLine } from "@/redux/services/finance/ops-types";
import { sourceDocumentIdFromParams } from "@/lib/source-document-route";

const PILL = "inline-flex rounded px-2 py-0.5 font-mont text-[11px] font-medium";
const thCls = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const tdCls = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
const fmtDate = (s: string) => new Date(s).toLocaleDateString();

// Our model: status DRAFT/PENDING_APPROVAL/POSTED/CANCELLED × payment status.
// Collapse to the prototype's display states.
type DispKey = "DRAFT" | "PENDING" | "APPROVED" | "PART_PAID" | "PAID" | "REJECTED";
function disp(c: ExpenseClaim): { key: DispKey; label: string; cls: string } {
  if (c.status === "CANCELLED") return { key: "REJECTED", label: "Rejected", cls: "bg-destructive/10 text-destructive" };
  if (c.status === "PENDING_APPROVAL") return { key: "PENDING", label: "Awaiting approval", cls: "bg-amber-50 text-amber-700" };
  if (c.status === "DRAFT") return { key: "DRAFT", label: "Draft", cls: "bg-gray-03/60 text-gray-05" };
  if (c.payment_status === "PAID") return { key: "PAID", label: "Paid", cls: "bg-green-01/10 text-green-01" };
  if (c.payment_status === "PARTIAL") return { key: "PART_PAID", label: "Part-paid", cls: "bg-amber-50 text-amber-700" };
  return { key: "APPROVED", label: "Approved", cls: "bg-blue-50 text-blue-700" };
}
function StatusPill({ claim }: { claim: ExpenseClaim }) {
  const d = disp(claim);
  return <span className={cn(PILL, d.cls)}>{d.label}</span>;
}
function Initials({ name }: { name: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pry-01 font-mont text-[10px] font-semibold text-primary">{init || "-"}</span>;
}
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-white-02">
      <p className="font-mont text-xs text-gray-05">{label}</p>
      <p className="mt-1 font-mont text-xl font-semibold tabular-nums text-black-01">{value}</p>
      {hint && <p className="mt-0.5 font-mont text-[11px] text-gray-05">{hint}</p>}
    </div>
  );
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "DRAFT", label: "Draft" }, { value: "PENDING", label: "Awaiting approval" }, { value: "APPROVED", label: "Approved" },
  { value: "PAID", label: "Paid" }, { value: "REJECTED", label: "Rejected" },
];

export function ExpenseClaimsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 250);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [selected, setSelected] = useState<ExpenseClaim | null>(null);
  const [linkedDocumentDismissed, setLinkedDocumentDismissed] = useState(false);
  const linkedDocumentId = sourceDocumentIdFromParams(searchParams);
  const linkedClaimQuery = useGetExpenseClaimQuery(
    linkedDocumentId ? { id: linkedDocumentId, entity } : skipToken,
  );
  const displayedClaim = selected
    ?? (linkedDocumentDismissed ? null : linkedClaimQuery.data?.data ?? null);

  const { data, isLoading, isFetching, isError, refetch } = useGetExpenseClaimsQuery({
    entity, page, ...(search ? { q: search } : {}), ...(status ? { display_status: status } : {}),
  });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const resetPage = () => setPage(1);

  const summaryQ = useGetExpenseClaimSummaryQuery({ entity });
  const kpis = summaryQ.data?.data ?? { open: 0, month_total: 0, avg: 0, awaiting: 0 };

  const columns: Column<ExpenseClaim>[] = [
    { header: "Claim no.", cell: (c) => <span className="font-semibold tabular-nums">{c.document_number}</span> },
    { header: "Claimant", cell: (c) => <span className="inline-flex items-center gap-2"><Initials name={c.claimant_name || "-"} /><span className="font-medium text-gray-01">{c.claimant_name || "-"}</span></span> },
    { header: "Date", cell: (c) => <span className="tabular-nums text-gray-05">{fmtDate(c.claim_date)}</span> },
    { header: "Purpose", cell: (c) => <span className="text-gray-01">{c.title || "-"}</span> },
    { header: "Total", align: "right", cell: (c) => <Money kobo={c.total} currency={currency} align="right" /> },
    { header: "Status", cell: (c) => <StatusPill claim={c} /> },
  ];

  return (
    <div className="space-y-4" data-guide="finance-expense-claims.workbench">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guide="finance-expense-claims.summary">
        <Kpi label="Open claims" value={String(kpis.open)} hint="Draft or awaiting payment" />
        <Kpi label="Submitted this month" value={formatMoney(kpis.month_total, currency)} />
        <Kpi label="Average claim" value={formatMoney(kpis.avg, currency)} />
        <Kpi label="Awaiting payment" value={formatMoney(kpis.awaiting, currency)} hint="Approved, not yet reimbursed" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="finance-expense-claims.controls">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
            <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); resetPage(); }} placeholder="Search claimant, purpose or no." className="h-9 w-72 bg-white pl-8 font-mont" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }} className="h-9 rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {/* Replaces a client-side CSV of `rows` - the current page only. The
              screen's display status collapses (status x payment_status); the
              binding expands it the same way the list endpoint does. */}
          <QuickExportButton
            screen="finance.expense_claims"
            params={{ display_status: status, q: search }}
            entity={entity}
            typeface="geist"
            defaultName="Expense claims"
          />
          <Can permission={P.FIN_CREATE_EXPENSE_CLAIM}>
            <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New claim</Button>
          </Can>
        </div>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(c) => c.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle={search || status ? "No matching claims" : "No expense claims"}
        emptyMessage={search || status ? "Try a different search or filter." : "Staff reimbursement claims appear here."}
      />

      <ClaimDetailDrawer
        claim={displayedClaim}
        entity={entity}
        currency={currency}
        onClose={() => {
          setSelected(null);
          setLinkedDocumentDismissed(true);
        }}
      />
      <NewClaimDrawer open={creating} onClose={() => setCreating(false)} entity={entity} currency={currency} />
    </div>
  );
}

function Step({ done, active, title, sub }: { done: boolean; active?: boolean; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {done ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-01" />
        : <CircleDashed className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-gray-05/50")} />}
      <div>
        <p className={cn("font-mont text-xs font-medium", done || active ? "text-black-01" : "text-gray-05")}>{title}</p>
        {sub ? <p className="font-mont text-[11px] text-gray-05">{sub}</p> : null}
      </div>
    </div>
  );
}

function ClaimDetailDrawer({ claim, entity, currency, onClose }: { claim: ExpenseClaim | null; entity: string; currency?: string | null; onClose: () => void }) {
  const { can } = useCan();
  const [paying, setPaying] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const { data } = useGetExpenseClaimQuery(claim ? { id: claim.id, entity } : skipToken);
  const full = data?.data ?? claim;
  const [post, { isLoading: posting }] = usePostExpenseClaimMutation();
  const [submitClaim, { isLoading: submitting }] = useSubmitExpenseClaimMutation();
  const [reject, { isLoading: rejecting }] = useRejectExpenseClaimMutation();
  const [voidClaim, { isLoading: voiding }] = useVoidExpenseClaimMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "expense claim" });
  if (!claim || !full) return null;

  const d = disp(full);
  const isDraft = full.status === "DRAFT";
  const isPending = full.status === "PENDING_APPROVAL";
  const isApprovedUnpaid = full.status === "POSTED" && full.payment_status !== "PAID";
  // Void needs a posted claim with NO reimbursement yet (the backend refuses once
  // amount_paid > 0 - including partial); reject is the DRAFT path.
  const canVoid = full.status === "POSTED" && full.payment_status === "UNPAID";
  const attachable = isDraft;

  const doPost = async () => { try { const r = await post({ id: full.id, entity }).unwrap(); toast.success(r.message || "Claim approved."); } catch { /* central */ } };
  const doSubmit = async () => {
    try {
      const r = await submitClaim({ id: full.id, entity }).unwrap();
      toast.success(r.message || "Claim submitted for approval.");
      promptIfParked(r.data?.approval);
    } catch { /* central */ }
  };
  const doReject = async () => { try { const r = await reject({ id: full.id, entity }).unwrap(); toast.success(r.message || "Claim rejected."); } catch { /* central */ } };
  const doVoid = async () => { try { const r = await voidClaim({ id: full.id, entity }).unwrap(); toast.success(r.message || "Claim voided."); setVoidOpen(false); } catch { /* central */ } };

  return (
    <>
      <DetailDrawer
        open={!!claim} onOpenChange={(o) => (o ? undefined : onClose())}
        title={full.document_number}
        description={`${full.claimant_name || "-"} · ${fmtDate(full.claim_date)}${full.title ? ` · ${full.title}` : ""}`}
        widthClass="sm:max-w-3xl"
        footer={
          <>
            <StatusPill claim={full} />
            <div className="flex-1" />
            <Button variant="outline" onClick={() => printClaim(full, currency)} className="gap-1.5"><Printer className="size-4" /> Print</Button>
            {isDraft && full.approval_required ? (
              <Can permission={P.FIN_CREATE_EXPENSE_CLAIM}>
                <Button disabled={submitting} onClick={doSubmit} className="gap-1.5"><Send className="size-4" />{submitting ? "Submitting…" : "Submit for approval"}</Button>
              </Can>
            ) : isDraft ? (
              <Can permission={P.FIN_POST_EXPENSE_CLAIM}>
                <Button variant="outline" disabled={rejecting} onClick={doReject} className="gap-1.5"><X className="size-4" /> Reject</Button>
                <Button disabled={posting} onClick={doPost} className="gap-1.5"><Check className="size-4" />{posting ? "Approving…" : "Approve"}</Button>
              </Can>
            ) : null}
            {canVoid ? (
              <Can permission={P.FIN_POST_EXPENSE_CLAIM}>
                <Button variant="outline" disabled={voiding} onClick={() => setVoidOpen(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" /> Void</Button>
              </Can>
            ) : null}
            {isApprovedUnpaid ? (
              <Can permission={P.FIN_SETTLE_EXPENSE_CLAIM}>
                <Button onClick={() => setPaying(true)} className="gap-1.5"><Wallet className="size-4" /> Pay</Button>
              </Can>
            ) : null}
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">Total</p><p className="mt-1 font-mont text-base font-semibold tabular-nums text-black-01">{formatMoney(full.total, currency)}</p></div>
            <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">Subtotal · Tax</p><p className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{formatMoney(full.subtotal, currency)} · {formatMoney(full.tax_total, currency)}</p></div>
            <div className="rounded-md border border-white-02 bg-white p-3"><p className="font-mont text-[11px] text-gray-05">{full.payment_status === "PAID" ? "Reimbursed" : "Awaiting payment"}</p><p className="mt-1 font-mont text-base font-semibold tabular-nums text-black-01">{formatMoney(full.payment_status === "PAID" ? full.amount_paid : full.balance_due, currency)}</p></div>
          </div>

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Approval workflow</p>
            <div className="space-y-3 rounded-md border border-gray-03 bg-gray-03 px-3 py-3">
              <Step done title="Submitted" sub={`${full.claimant_name || "Staff"} · ${fmtDate(full.claim_date)}`} />
              {d.key === "REJECTED"
                ? <Step done={false} active title="Rejected" sub="The claim was rejected." />
                : <Step done={full.status === "POSTED"} active={isDraft || isPending} title="Approved & accrued" sub={full.status === "POSTED" ? "Booked to Accrued Reimbursements" : isPending ? "Waiting in the approver queue" : "Ready to submit"} />}
              {d.key !== "REJECTED"
                ? <Step done={full.payment_status === "PAID"} active={isApprovedUnpaid} title="Reimbursed" sub={full.payment_status === "PAID" ? "Paid via bank transfer" : "Pending payment"} />
                : null}
            </div>
          </div>

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Lines</p>
            <div className="overflow-x-auto rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className={thCls}>Category (GL)</th><th className={thCls}>Description</th>
                  <th className={thCls}>Cost center</th><th className={thCls}>Tax</th>
                  <th className={cn(thCls, "text-right")}>Amount</th><th className={thCls}>Receipt</th>
                </tr></thead>
                <tbody>
                  {full.lines.map((l) => (
                    <tr key={l.id}>
                      <td className={cn(tdCls, "tabular-nums text-gray-05")}>{l.expense_account}</td>
                      <td className={tdCls}>{l.description || "-"}</td>
                      <td className={cn(tdCls, "tabular-nums text-gray-05")}>{l.cost_center || "-"}</td>
                      <td className={tdCls}>{l.tax_code ?? <span className="text-gray-05">Exempt</span>}</td>
                      <td className={cn(tdCls, "text-right tabular-nums")}><Money kobo={l.line_total} currency={currency} align="right" /></td>
                      <td className={tdCls}><ReceiptCell line={l} claimId={full.id} entity={entity} attachable={attachable && can(P.FIN_CREATE_EXPENSE_CLAIM)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DetailDrawer>

      {paying ? <PayDrawer claim={full} entity={entity} currency={currency} onClose={() => setPaying(false)} /> : null}
      <ConfirmActionModal
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Void ${full.document_number}?`}
        description="Reverses the claim's posting journal (a mirror entry backing out the expense and accrued reimbursement) and cancels the claim. Use this to undo a claim posted in error - it can't be voided once any reimbursement has been paid."
        confirmText="Void claim"
        destructive
        loading={voiding}
        onConfirm={doVoid}
      />
      {noApproverDialog}
    </>
  );
}

export function ReceiptCell({ line, claimId, entity, attachable }: { line: ExpenseClaimLine; claimId: number; entity: string; attachable: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, { isLoading: uploading }] = useUploadExpenseReceiptMutation();
  const [remove, { isLoading: removing }] = useDeleteExpenseReceiptMutation();

  const onPick = async (file?: File) => {
    if (!file) return;
    try { await upload({ id: claimId, lineId: line.id, entity, file }).unwrap(); toast.success("Receipt attached."); }
    catch { /* central */ }
  };

  if (line.receipt_url) {
    return (
      <span className="inline-flex max-w-[150px] items-center gap-1">
        <button type="button" onClick={() => openAttachment(line.receipt_url!, line.receipt_name || "Receipt").catch((error) => toast.error(error instanceof Error ? error.message : "Could not open the receipt."))} className="inline-flex min-w-0 items-center gap-1 font-mont text-[11px] font-medium text-primary hover:underline" title={line.receipt_name || "Receipt"}>
          <Paperclip className="size-3 shrink-0" /><span className="truncate">{line.receipt_name || "Receipt"}</span>
        </button>
        {attachable ? <button type="button" disabled={removing} onClick={() => remove({ id: claimId, lineId: line.id, entity })} className="shrink-0 text-gray-05 hover:text-destructive disabled:opacity-40" aria-label="Remove receipt"><X className="size-3" /></button> : null}
      </span>
    );
  }
  if (!attachable) return <span className={cn(PILL, "bg-amber-50 text-amber-700")}>Missing</span>;
  return (
    <>
      <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
      <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} title="Click to attach a receipt"
        className={cn(PILL, "cursor-pointer bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50")}>
        {uploading ? "Uploading…" : "Missing"}
      </button>
    </>
  );
}

function PayDrawer({ claim, entity, currency, onClose }: { claim: ExpenseClaim; entity: string; currency?: string | null; onClose: () => void }) {
  const [bank, setBank] = useState("");
  const [payDate, setPayDate] = useState("");
  const [settle, { isLoading }] = useSettleExpenseClaimMutation();

  const submit = async () => {
    try {
      const res = await settle({ id: claim.id, entity, bank_account: bank || undefined, pay_date: payDate }).unwrap();
      toast.success(res.message || "Claim reimbursed.");
      onClose();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open onOpenChange={(o) => (o ? undefined : onClose())}
      title="Reimburse claim" description={`${claim.document_number} · ${claim.claimant_name || "-"}`}
      widthClass="sm:max-w-lg"
      footer={<>
        <Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button>
        <Button disabled={isLoading || !payDate} onClick={submit} className="gap-1.5"><Wallet className="size-4" />{isLoading ? "Paying…" : `Pay ${formatMoney(claim.balance_due, currency)}`}</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="rounded-md border border-gray-03 bg-gray-03 px-3 py-2 font-mont text-[11px] text-gray-05">
          Pays the staff member {formatMoney(claim.balance_due, currency)} - Dr Accrued Reimbursement, Cr bank - clearing the liability raised on approval.
        </p>
        <FormField label="Bank account"><BankAccountPicker entity={entity} value={bank} onChange={setBank} placeholder="Default cash/bank" /></FormField>
        <PostingDateField
          label="Payment date" entity={entity} value={payDate} onChange={setPayDate}
          notBefore={claim.claim_date}
          notBeforeLabel={`expense claim ${claim.document_number}`}
        />
      </div>
    </DetailDrawer>
  );
}

type EditLine = { description: string; expense_account: string; unit_price: number; tax_code: string; cost_center: string };
const emptyLine = (): EditLine => ({ description: "", expense_account: "", unit_price: 0, tax_code: "", cost_center: "" });

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
function ReceiptDropzone({ files, onAdd, onRemove }: { files: File[]; onAdd: (fs: File[]) => void; onRemove: (i: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const accept = (incoming: FileList | File[] | null) => {
    const arr = Array.from(incoming ?? []);
    const tooBig = arr.filter((f) => f.size > MAX_RECEIPT_BYTES);
    if (tooBig.length) toast.error(`${tooBig.length} file(s) over 10MB were skipped.`);
    const ok = arr.filter((f) => f.size <= MAX_RECEIPT_BYTES);
    if (ok.length) onAdd(ok);
  };

  return (
    <div>
      <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Receipts</p>
      <div
        role="button" tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files); }}
        className={cn("flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors",
          drag ? "border-primary bg-primary/[0.05]" : "border-gray-05/30 hover:border-primary/60 hover:bg-gray-03/30")}>
        <UploadCloud className={cn("size-7", drag ? "text-primary" : "text-gray-05")} />
        <p className="font-mont text-sm font-medium text-gray-01">Drop receipt images or PDFs here</p>
        <p className="font-mont text-[11px] text-gray-05">JPG, PNG, PDF · up to 10MB each · attached to your lines in order</p>
        <input ref={ref} type="file" accept=".pdf,image/*" multiple className="hidden" onChange={(e) => { accept(e.target.files); e.target.value = ""; }} />
      </div>
      {files.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-white-02 bg-white py-1 pl-2 pr-1 font-mont text-[11px]">
              <Paperclip className="size-3 shrink-0 text-primary" /><span className="truncate" title={f.name}>{f.name}</span>
              <button type="button" onClick={() => onRemove(i)} className="shrink-0 rounded p-0.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive" aria-label="Remove receipt"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NewClaimDrawer({ open, onClose, entity, currency }: { open: boolean; onClose: () => void; entity: string; currency?: string | null }) {
  const [claimant, setClaimant] = useState("");
  const [claimDate, setClaimDate] = useState("");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<EditLine[]>([emptyLine()]);
  const [receipts, setReceipts] = useState<File[]>([]);
  const [create, { isLoading }] = useCreateExpenseClaimMutation();
  const [uploadReceipt] = useUploadExpenseReceiptMutation();
  const [submitClaim, { isLoading: isSubmitting }] = useSubmitExpenseClaimMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "expense claim" });

  const setLine = (i: number, patch: Partial<EditLine>) => setLines((s) => s.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const total = lines.reduce((s, l) => s + l.unit_price, 0);
  const valid = lines.filter((l) => l.description.trim() && l.expense_account && l.unit_price > 0);
  const canSubmit = claimant.trim() !== "" && title.trim() !== "" && valid.length > 0;

  const reset = () => { setClaimant(""); setClaimDate(""); setTitle(""); setLines([emptyLine()]); setReceipts([]); };
  const close = () => { reset(); onClose(); };

  const persist = async (submitAfterCreate: boolean) => {
    try {
      const res = await create({
        entity, claimant_name: claimant.trim(), claim_date: claimDate, title: title.trim(),
        lines: valid.map((l) => ({ description: l.description.trim(), expense_account: l.expense_account, quantity: 1, unit_price: l.unit_price, tax_code: l.tax_code || undefined, cost_center: l.cost_center || undefined })),
      }).unwrap();
      // Attach dropped receipts to the created lines in order.
      const created = res.data?.lines ?? [];
      let uploadFailed = false;
      for (let i = 0; i < receipts.length && i < created.length; i++) {
        try {
          await uploadReceipt({ id: res.data!.id, lineId: created[i].id, entity, file: receipts[i] }).unwrap();
        } catch {
          uploadFailed = true;
          toast.error(`Couldn't attach ${receipts[i].name}`);
        }
      }
      if (submitAfterCreate && !uploadFailed && res.data?.approval_required) {
        try {
          const sent = await submitClaim({ id: res.data.id, entity }).unwrap();
          toast.success(sent.message || "Claim submitted for approval.");
          promptIfParked(sent.data?.approval);
          close();
          return;
        } catch {
          toast.warning("The claim was saved as a draft. Open it to submit again.");
          close();
          return;
        }
      }
      if (submitAfterCreate && !uploadFailed && !res.data?.approval_required) {
        toast.warning("The claim was saved as a draft because no approval route is configured.");
        close();
        return;
      }
      if (submitAfterCreate && uploadFailed) {
        toast.warning("The claim was saved as a draft because a receipt did not attach.");
      } else {
        toast.success(res.message || "Claim draft saved.");
      }
      close();
    } catch { /* central */ }
  };

  return (
    <DetailDrawer
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title="New expense claim" description="Capture out-of-pocket spending for reimbursement, then drop the receipts."
      widthClass="sm:max-w-5xl"
      footer={<>
        <Button variant="outline" disabled={isLoading || isSubmitting} onClick={close}>Cancel</Button>
        <Button variant="outline" disabled={isLoading || isSubmitting || !canSubmit} onClick={() => persist(false)}>Save draft</Button>
        <Button disabled={isLoading || isSubmitting || !canSubmit} onClick={() => persist(true)} className="gap-1.5"><Send className="size-4" />{isLoading || isSubmitting ? "Working…" : "Create and submit"}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Claimant" required><Input value={claimant} onChange={(e) => setClaimant(e.target.value)} placeholder="Staff name" className="bg-white" /></FormField>
          <PostingDateField label="Date" entity={entity} value={claimDate} onChange={setClaimDate} />
          <FormField label="Purpose" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Travel to workshop" className="bg-white" /></FormField>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Expense lines</p>
            <Button variant="outline" size="sm" onClick={() => setLines((s) => [...s, emptyLine()])} className="gap-1.5"><Plus className="size-3.5" /> Add line</Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex flex-col items-stretch gap-2 rounded-md border border-white-02 bg-white p-2.5 sm:flex-row sm:items-end">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Description</p><Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="What was bought" className="h-9 bg-white text-sm" /></div>
                  <div className="sm:col-span-3"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Expense account</p><AccountPicker entity={entity} value={l.expense_account} onChange={(v) => setLine(i, { expense_account: v })} accountType="EXPENSE" postableOnly placeholder="5xxx" /></div>
                  <div className="sm:col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Cost center</p><CostCenterPicker entity={entity} value={l.cost_center} onChange={(v) => setLine(i, { cost_center: v })} /></div>
                  <div className="sm:col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Amount</p><MoneyInput valueKobo={l.unit_price} onChangeKobo={(v) => setLine(i, { unit_price: v })} currency={currency} className="[&_input]:h-9" /></div>
                  <div className="sm:col-span-2"><p className="mb-1 font-mont text-[10px] uppercase tracking-wide text-gray-05">Tax</p><TaxCodePicker entity={entity} value={l.tax_code} onChange={(v) => setLine(i, { tax_code: v })} usage="purchase" /></div>
                </div>
                <button type="button" onClick={() => setLines((s) => s.filter((_, idx) => idx !== i))} disabled={lines.length <= 1} className="mb-0.5 self-end shrink-0 rounded p-1.5 text-gray-05 hover:bg-destructive/5 hover:text-destructive disabled:opacity-30" aria-label="Remove line"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end font-mont text-sm"><span className="text-gray-05">Total (net)&nbsp;</span><span className="font-semibold tabular-nums text-black-01">{formatMoney(total, currency)}</span></div>
        </div>

        <ReceiptDropzone files={receipts} onAdd={(fs) => setReceipts((s) => [...s, ...fs])} onRemove={(i) => setReceipts((s) => s.filter((_, idx) => idx !== i))} />
      </div>
      {noApproverDialog}
    </DetailDrawer>
  );
}

function printClaim(c: ExpenseClaim, currency?: string | null) {
  const money = (k: number) => formatMoney(k, currency);
  const row = (l: ExpenseClaimLine) => `<tr><td>${l.expense_account}</td><td>${l.description || "-"}</td><td>${l.cost_center || "-"}</td><td style="text-align:right">${money(l.line_total)}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Expense claim ${c.document_number}</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;max-width:720px;margin:auto}
  h1{font-size:18px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #eee;padding:6px 8px;text-align:left}
  tfoot td{font-weight:600;border-top:2px solid #ddd}</style></head><body>
  <h1>Expense claim ${c.document_number}</h1>
  <div class="sub">${c.claimant_name || "-"} · ${fmtDate(c.claim_date)} · ${c.title || ""} · ${disp(c).label}</div>
  <table><thead><tr><th>Category</th><th>Description</th><th>Cost center</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${c.lines.map(row).join("")}</tbody>
  <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${money(c.total)}</td></tr></tfoot></table>
  </body></html>`;
  const w = window.open("", "_blank", "width=780,height=900");
  if (!w) { toast.error("Pop-up blocked - allow pop-ups to print."); return; }
  w.document.write(html); w.document.close(); w.focus(); w.print();
}
