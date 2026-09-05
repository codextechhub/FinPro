import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useActionParam } from "@/hooks/use-action-param";
import {
  Banknote, Check, ChevronRight, Coins, FilePenLine, FileText, History, ListChecks,
  Paperclip, Plus, Printer, ReceiptText, RotateCcw, Send, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import { VendorPicker } from "./pickers";
import { useUserDirectory } from "../../components/workflow/use-user-directory";
import { sameId } from "../../components/workflow/workflow-format";
import {
  BankAccountPicker, DataTable, DetailDrawer, EmptyState, ErrorState, FormField,
  InfoHint, LoadingState, MoneyInput, PostingRecap, StatusPill, TabStrip, TaxCodePicker,
  toArray, useActiveEntity, type Column, type TabStripItem,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { P } from "../../permissions";
import {
  useCancelVendorPaymentMutation, useCreateVendorPaymentMutation,
  useGetVendorPaymentEligibleInvoicesQuery, useGetVendorPaymentQuery,
  useGetVendorPaymentsQuery, usePostVendorPaymentMutation,
  useAllocateVendorAdvanceMutation,
  useReverseVendorPaymentMutation, useSubmitVendorPaymentMutation,
  useAttachVendorPaymentFileMutation, useDeleteVendorPaymentFileMutation,
  useUpdateVendorPaymentMutation,
} from "@/redux/services/procurement/procurement-api";
import type {
  VendorPayment, VendorPaymentEligibleInvoice,
} from "@/redux/services/procurement/procurement-types";
import {
  useGetWorkflowInstanceQuery, useRecordWorkflowActionMutation,
} from "@/redux/services/dashboard/workflow-api";
import type { VoteAction } from "@/redux/services/dashboard/workflow-types";
import { useAppSelector } from "@/redux/store";
import { formatMoney } from "@/utils/money";
import { ActivityFeed } from "./activity-feed";
import { DocumentAttachments } from "./document-attachments";
import { sourceDocumentIdFromParams } from "@/lib/source-document-route";
import { PageShell } from "@/components/layout/page-shell";

const DETAIL_TABS = [
  ["overview", "Overview", FileText], ["invoices", "Invoices", ListChecks],
  ["posting", "Posting", ReceiptText], ["attachments", "Attachments", Paperclip],
  ["activity", "Activity", History],
] as const;

/** Drawer sections for the tab strip, built once so the sliding bar re-measures only when the active tab changes. */
const DETAIL_TAB_ITEMS: TabStripItem<string>[] = DETAIL_TABS.map(([value, label, Icon]) => ({
  value,
  label: <><Icon className="size-3.5" />{label}</>,
}));

function shortDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}
function isForbidden(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="font-mont text-[11px] text-gray-05">{label}</dt><dd className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value || "-"}</dd></div>;
}
function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{children}</div>;
}

export default function VendorPaymentsPage() {
  const { code: entity, currency } = useActiveEntity();
  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(() => (
    sourceDocumentIdFromParams(searchParams)
  ));
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PROC_CREATE_VENDOR_PAYMENT), () => setCreating(true));
  const { data, isLoading, isFetching, isError, error, refetch } = useGetVendorPaymentsQuery(
    { entity: entity!, page }, { skip: !entity },
  );
  if (!entity) return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view vendor payments." /></PageShell></ProcurementShell>;

  const rows = toArray(data?.data);
  const pg = data?.pagination;
  const columns: Column<VendorPayment>[] = [
    { header: "Payment Ref", cell: (payment) => <div className="min-w-40"><p className="font-mont text-sm font-semibold text-primary">{payment.document_number}</p><p className="mt-1 max-w-44 truncate text-[11px] text-gray-05">{payment.reference || "No bank reference"}</p></div> },
    { header: "Vendor", cell: (payment) => <div className="min-w-36"><p className="font-semibold">{payment.vendor_name || payment.vendor_code}</p><p className="mt-0.5 text-[11px] text-gray-05">{payment.vendor_code}</p></div> },
    { header: "Invoice(s)", cell: (payment) => <span className="block max-w-44 truncate">{payment.allocations.map((row) => row.invoice_number).join(", ") || "-"}</span> },
    { header: "Date", cell: (payment) => shortDate(payment.payment_date) },
    { header: "Method", cell: (payment) => payment.method.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) },
    { header: "Net Paid", align: "right", cell: (payment) => <span className="font-semibold tabular-nums">{formatMoney(payment.net_amount, currency)}</span> },
    { header: "Status", cell: (payment) => <div className="flex min-w-28 flex-wrap gap-1"><StatusPill status={payment.status} />{payment.status !== "REVERSED" && <StatusPill status={payment.approval_state} />}{payment.status === "POSTED" && <StatusPill status={payment.allocation_status} />}</div> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  return <ProcurementShell>
    <PageShell className="space-y-5 text-black-01">
      <header data-guide="procurement-vendor-payments.heading" className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1.5"><h1 className="font-mont text-lg font-semibold text-gray-01">Vendor Payments</h1><InfoHint ariaLabel="About vendor payments">Payments settle approved supplier invoices and post through Accounts Payable.</InfoHint></div><p className="mt-0.5 font-mont text-xs text-gray-05">Disbursements against approved and posted vendor invoices.</p></div><Can permission={P.PROC_CREATE_VENDOR_PAYMENT}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> New Payment</Button></Can></header>
      <section data-guide="procurement-vendor-payments.list">{isForbidden(error) ? <EmptyState title="Access restricted" message="You do not have permission to view vendor payments." /> : <DataTable columns={columns} rows={rows} rowKey={(payment) => payment.id} loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(payment) => setSelectedId(payment.id)} page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage} emptyTitle="No vendor payments" emptyMessage="Approved supplier disbursements will appear here." />}</section>
    </PageShell>
    <PaymentDrawer id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <PaymentForm key="new-payment" entity={entity} currency={currency} onClose={() => setCreating(false)} />}
  </ProcurementShell>;
}

function PaymentDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const user = useAppSelector((state) => state.auth.user);
  const uid = user?.id == null ? "" : String(user.id);
  const { name } = useUserDirectory();
  const [tab, setTab] = useState("overview");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const { data, isLoading, isError, refetch } = useGetVendorPaymentQuery({ id: id!, entity }, { skip: id == null });
  const payment = data?.data;
  const workflowId = payment?.workflow_instance_id || "";
  const { data: workflow } = useGetWorkflowInstanceQuery(workflowId, { skip: !workflowId });
  const [recordAction, { isLoading: voting }] = useRecordWorkflowActionMutation();
  const [submit, { isLoading: submitting }] = useSubmitVendorPaymentMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "vendor payment" });
  const [post, { isLoading: posting }] = usePostVendorPaymentMutation();
  const [attachFile, { isLoading: attaching }] = useAttachVendorPaymentFileMutation();
  const [removeFile, { isLoading: removingFile }] = useDeleteVendorPaymentFileMutation();
  const [cancel, { isLoading: cancelling }] = useCancelVendorPaymentMutation();
  const [reverse, { isLoading: reversing }] = useReverseVendorPaymentMutation();
  const [applyAdvance, { isLoading: applying }] = useAllocateVendorAdvanceMutation();
  // Reset the drawer's local UI when a different payment is opened (render-phase).
  const [uiFor, setUiFor] = useState(id);
  if (uiFor !== id) {
    setUiFor(id);
    setTab("overview");
    setComment("");
    setEditing(false);
  }
  const activeStage = useMemo(() => (workflow?.stage_instances || []).filter((stage) => stage.status === "ACTIVE").at(-1), [workflow]);
  const canVote = !!activeStage && workflow?.status === "IN_PROGRESS" && activeStage.eligible_approvers.some((approver) => sameId(approver.user, uid) && approver.attempt === activeStage.attempt) && !activeStage.actions.some((action) => sameId(action.actor, uid) && !action.reversed_at && !action.is_reversal_of && action.attempt === activeStage.attempt);
  const editable = payment?.status === "DRAFT" && ["NOT_SUBMITTED", "REJECTED"].includes(payment.approval_state);
  const vote = async (action: VoteAction) => {
    if (!workflowId || ((action === "REJECTED" || action === "RETURNED") && !comment.trim())) return;
    try { await recordAction({ id: workflowId, action, comment: comment.trim() }).unwrap(); toast.success(action === "APPROVED" ? "Approval recorded." : action === "RETURNED" ? "Revision requested." : "Payment rejected."); setComment(""); refetch(); } catch { /* central */ }
  };
  const run = async (action: "submit" | "post" | "cancel" | "reverse" | "apply") => {
    if (!payment) return;
    try {
      if (action === "submit") {
        const r = await submit({ id: payment.id, entity }).unwrap();
        promptIfParked(r.data?.approval);  // Submitted, but possibly with no approver.
      }
      if (action === "post") await post({ id: payment.id, entity }).unwrap();
      if (action === "cancel") { if (!window.confirm("Cancel this unposted payment?")) return; await cancel({ id: payment.id, entity }).unwrap(); }
      if (action === "reverse") { if (!window.confirm("Reverse this posted payment and restore its invoice balances?")) return; await reverse({ id: payment.id, entity }).unwrap(); }
      // The service reports what it actually applied, including finding nothing
      // eligible, so its message is more honest than anything we could compose here.
      if (action === "apply") { const res = await applyAdvance({ id: payment.id, entity, auto_allocate: true }).unwrap(); toast.success(res.message || "Advance applied."); return; }
      toast.success(action === "submit" ? "Payment submitted for approval." : action === "post" ? "Payment posted." : action === "cancel" ? "Payment cancelled." : "Payment reversed.");
    } catch { /* central */ }
  };

  return <>
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} title={payment?.document_number || "Vendor payment"} description={payment ? `${payment.vendor_name || payment.vendor_code} · ${shortDate(payment.payment_date)} · ${payment.method.replaceAll("_", " ")}` : "Loading vendor payment"} widthClass="sm:max-w-[720px]" footer={payment && <>
      <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
      {editable && <Can permission={P.PROC_UPDATE_VENDOR_PAYMENT}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
      {editable && <Can permission={P.PROC_SUBMIT_VENDOR_PAYMENT}><Button loading={submitting} onClick={() => run("submit")}><Send className="size-4" /> Submit for Approval</Button></Can>}
      {payment.status === "DRAFT" && payment.approval_state === "APPROVED" && <Can permission={P.PROC_CANCEL_VENDOR_PAYMENT}><Button variant="outline-dest" loading={cancelling} onClick={() => run("cancel")}><X className="size-4" /> Cancel</Button></Can>}
      {payment.status === "DRAFT" && payment.approval_state === "APPROVED" && <Can permission={P.PROC_POST_VENDOR_PAYMENT}><Button loading={posting} onClick={() => run("post")}><Banknote className="size-4" /> Post Payment</Button></Can>}
      {payment.status === "POSTED" && payment.advance_remaining > 0 && <Can permission={P.PROC_ALLOCATE_VENDOR_ADVANCE}><Button variant="outline" loading={applying} onClick={() => run("apply")}><Coins className="size-4" /> Apply Advance</Button></Can>}
      {payment.status === "POSTED" && <Can permission={P.PROC_REVERSE_VENDOR_PAYMENT}><Button variant="outline-dest" loading={reversing} onClick={() => run("reverse")}><Undo2 className="size-4" /> Reverse</Button></Can>}
    </>}>
      {isLoading ? <LoadingState rows={8} /> : isError || !payment ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1.5"><StatusPill status={payment.status} /><StatusPill status={payment.approval_state} />{payment.status === "POSTED" && <StatusPill status={payment.allocation_status} />}</div><p className="font-mont text-lg font-semibold tabular-nums">{formatMoney(payment.net_amount, currency)}</p></div>
        <TabStrip
          items={DETAIL_TAB_ITEMS}
          value={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel="Vendor payment sections"
          className="w-full gap-5"
          buttonClassName="flex items-center gap-1.5 px-0"
        />
        {tab === "overview" && <div className="space-y-5">
          {payment.approval_state === "PENDING" && <section className="rounded-md border border-amber-200 bg-amber-50 p-4"><p className="font-mont text-sm font-semibold text-amber-900">{canVote ? "Your approval is required" : activeStage ? `Awaiting ${activeStage.stage_label}` : "Approval in progress"}</p>{canVote && <><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment (required for revision or rejection)" className="mt-3 min-h-20 bg-white" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" loading={voting} onClick={() => vote("APPROVED")}><Check className="size-4" /> Approve</Button><Button size="sm" variant="outline" disabled={!comment.trim() || voting} onClick={() => vote("RETURNED")}><RotateCcw className="size-4" /> Request Revision</Button><Button size="sm" variant="outline-dest" disabled={!comment.trim() || voting} onClick={() => vote("REJECTED")}><X className="size-4" /> Reject</Button></div></>}</section>}
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Payment reference" value={payment.reference} /><Field label="Vendor" value={payment.vendor_name || payment.vendor_code} /><Field label="Payment date" value={shortDate(payment.payment_date)} /><Field label="Method" value={payment.method.replaceAll("_", " ")} /><Field label="Bank account" value={payment.bank_account_name || payment.payment_account_name || payment.payment_code} /><Field label="WHT code" value={payment.wht_tax_code_value} /><Field label="Gross settled" value={formatMoney(payment.gross_amount, currency)} /><Field label="WHT withheld" value={formatMoney(payment.wht_amount, currency)} /><Field label="Net cash paid" value={formatMoney(payment.net_amount, currency)} /><Field label="Allocated to bills" value={formatMoney(payment.allocated_amount, currency)} />{payment.status === "POSTED" && payment.advance_remaining > 0 && <Field label="Paid in advance" value={formatMoney(payment.advance_remaining, currency)} />}</dl>
          {payment.narration && <div className="rounded-md border border-white-02 p-4"><p className="font-mont text-[11px] text-gray-05">Narration</p><p className="mt-1 font-mont text-sm">{payment.narration}</p></div>}
        </div>}
        {tab === "invoices" && <AllocationTable payment={payment} currency={currency} />}
        {tab === "posting" && <PaymentPosting payment={payment} currency={currency} />}
        {tab === "attachments" && <DocumentAttachments
          attachments={payment.attachments || []}
          attachPermission={P.PROC_ATTACH_VENDOR_PAYMENT_FILE}
          uploading={attaching}
          deleting={removingFile}
          emptyMessage="No receipt has been filed against this payment yet."
          onUpload={async (file, caption) => {
            try { await attachFile({ id: payment.id, entity, file, caption }).unwrap(); toast.success("Attachment uploaded."); } catch { /* central */ }
          }}
          onDelete={async (attachmentId) => {
            try { await removeFile({ id: payment.id, entity, attachmentId }).unwrap(); toast.success("Attachment removed."); } catch { /* central */ }
          }}
        />}
        {tab === "activity" && <PaymentActivity payment={payment} workflow={workflow} name={name} />}
      </div>}
      {noApproverDialog}
    </DetailDrawer>
    {payment && editing && <PaymentForm key={`edit-${payment.id}`} entity={entity} currency={currency} initial={payment} onClose={() => setEditing(false)} />}
  </>;
}

function AllocationTable({ payment, currency }: { payment: VendorPayment; currency?: string | null }) {
  if (!payment.allocations.length) return <EmptyPanel>No invoice allocations were recorded.</EmptyPanel>;
  return <div className="overflow-x-auto rounded-md border border-white-02"><table className="min-w-[560px] w-full"><thead><tr>{["Invoice", "Due", "Applied", "Invoice balance", "Status"].map((label) => <th key={label} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{label}</th>)}</tr></thead><tbody>{payment.allocations.map((row) => <tr key={row.id}><td className="border-t border-white-02 px-3 py-3 font-mont text-xs font-semibold text-primary">{row.invoice_number}</td><td className="border-t border-white-02 px-3 py-3 font-mont text-xs">{shortDate(row.due_date)}</td><td className="border-t border-white-02 px-3 py-3 font-mont text-xs font-semibold tabular-nums">{formatMoney(row.amount, currency)}</td><td className="border-t border-white-02 px-3 py-3 font-mont text-xs tabular-nums">{formatMoney(row.invoice_balance, currency)}</td><td className="border-t border-white-02 px-3 py-3"><StatusPill status={payment.status === "DRAFT" ? "PLANNED" : payment.status === "REVERSED" ? "REVERSED" : "APPLIED"} /></td></tr>)}</tbody></table></div>;
}

function PaymentPosting({ payment, currency }: { payment: VendorPayment; currency?: string | null }) {
  if (payment.posting_lines?.length) return <PostingRecap title={payment.status === "REVERSED" ? "Original journal (reversed)" : "Posted journal"} currency={currency} dr={payment.posting_lines.filter((line) => line.debit).map((line) => ({ code: line.account_code, name: line.account_name, amount: line.debit }))} cr={payment.posting_lines.filter((line) => line.credit).map((line) => ({ code: line.account_code, name: line.account_name, amount: line.credit }))} helper="This is the actual payment journal." />;
  return <PostingRecap title="Posting preview" currency={currency} dr={[{ code: "AP", name: "Accounts payable", amount: payment.gross_amount }]} cr={[{ code: payment.payment_code || "BANK", name: payment.payment_account_name || "Bank account", amount: payment.net_amount }, ...(payment.wht_amount ? [{ code: payment.wht_tax_code_value || "WHT", name: "Withholding tax payable", amount: payment.wht_amount }] : [])]} helper="Posting revalidates approval and invoice balances under row locks." />;
}

function PaymentActivity({ payment, workflow, name }: { payment: VendorPayment; workflow: ReturnType<typeof useGetWorkflowInstanceQuery>["data"]; name: (id: string | number | null | undefined) => string }) {
  return <ActivityFeed workflowLogs={workflow?.audit_logs} activity={payment.activity} resolveActorName={name} created={{ key: `payment-created-${payment.id}`, message: "Payment draft created", actorName: payment.created_by_name, occurredAt: payment.created_at }} />;
}

function PaymentForm({ entity, currency, initial, onClose }: { entity: string; currency?: string | null; initial?: VendorPayment; onClose: () => void }) {
  const [vendor, setVendor] = useState(initial?.vendor_code || "");
  const [paymentDate, setPaymentDate] = useState(initial?.payment_date || "");
  const [method, setMethod] = useState(initial?.method || "BANK_TRANSFER");
  const [bank, setBank] = useState(initial?.bank_account_id ? String(initial.bank_account_id) : "");
  const [reference, setReference] = useState(initial?.reference || "");
  const [narration, setNarration] = useState(initial?.narration || "");
  const [wht, setWht] = useState(initial?.wht_amount || 0);
  const [whtCode, setWhtCode] = useState(initial?.wht_tax_code_value || "");
  const [amounts, setAmounts] = useState<Record<number, number>>(() => Object.fromEntries((initial?.allocations || []).map((row) => [row.vendor_invoice_id, row.amount])));
  const { data, isLoading: invoicesLoading } = useGetVendorPaymentEligibleInvoicesQuery({ entity, ...(vendor ? { vendor } : {}) }, { skip: !vendor });
  const invoices = toArray(data?.data);
  const [create, { isLoading: creating }] = useCreateVendorPaymentMutation();
  const [update, { isLoading: updating }] = useUpdateVendorPaymentMutation();
  const [submit, { isLoading: submitting }] = useSubmitVendorPaymentMutation();
  const gross = Object.values(amounts).reduce((sum, amount) => sum + (amount || 0), 0);
  const allocations = Object.entries(amounts).filter(([, amount]) => amount > 0).map(([id, amount]) => ({ vendor_invoice: Number(id), amount }));
  const loading = creating || updating || submitting;
  const canSave = !!vendor && !!paymentDate && !!bank && allocations.length > 0 && gross > 0 && wht <= gross;
  const save = async (andSubmit: boolean) => {
    if (!canSave) return;
    const body = { entity, vendor, payment_date: paymentDate, method, bank_account: Number(bank), wht_amount: wht, wht_tax_code: whtCode || undefined, reference: reference.trim() || undefined, narration: narration.trim() || undefined, allocations };
    try {
      const response = initial ? await update({ id: initial.id, ...body }).unwrap() : await create(body).unwrap();
      if (andSubmit) await submit({ id: response.data.id, entity }).unwrap();
      toast.success(andSubmit ? "Payment created and submitted for approval." : initial ? "Payment draft updated." : "Payment draft saved.");
      onClose();
    } catch { /* central */ }
  };
  const setVendorAndReset = (value: string) => { setVendor(value); setAmounts({}); };
  return <DetailDrawer open onOpenChange={(open) => !open && onClose()} title={initial ? `Edit ${initial.document_number}` : "New Payment"} description="Disburse against approved and posted invoices" widthClass="sm:max-w-[720px]" footer={<><Button variant="outline" disabled={loading} onClick={onClose}>Cancel</Button><Button variant="outline" loading={loading} disabled={!canSave} onClick={() => save(false)}>Save Draft</Button><Button loading={loading} disabled={!canSave} onClick={() => save(true)}>{initial ? "Save & Submit" : "Create & Submit"}</Button></>}>
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={setVendorAndReset} /></FormField><FormField label="Method" required><select value={method} onChange={(event) => setMethod(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 font-mont text-sm">{["BANK_TRANSFER", "CHEQUE", "CASH", "CARD"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></FormField><PostingDateField label="Payment date" entity={entity} value={paymentDate} onChange={setPaymentDate} /><FormField label="Pay from" required><BankAccountPicker entity={entity} value={bank} onChange={setBank} /></FormField><FormField label="Reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} className="bg-white" /></FormField><FormField label="WHT code"><TaxCodePicker entity={entity} value={whtCode} onChange={setWhtCode} placeholder="No WHT code" /></FormField></div>
      <FormField label="Narration"><Textarea value={narration} onChange={(event) => setNarration(event.target.value)} className="min-h-20 bg-white" /></FormField>
      <section><div className="mb-2 flex items-center justify-between gap-3"><div><p className="font-mont text-xs font-semibold text-gray-01">Outstanding invoices</p><p className="mt-0.5 font-mont text-[11px] text-gray-05">Select the exact liability amounts the approver should review.</p></div><span className="font-mont text-sm font-semibold tabular-nums">{formatMoney(gross, currency)}</span></div>{!vendor ? <EmptyPanel>Select a vendor to load posted unpaid invoices.</EmptyPanel> : invoicesLoading ? <LoadingState rows={4} /> : invoices.length ? <div className="space-y-2">{invoices.map((invoice) => <InvoiceAllocationRow key={invoice.id} invoice={invoice} amount={amounts[invoice.id] || 0} currency={currency} onChange={(amount) => setAmounts((current) => ({ ...current, [invoice.id]: Math.min(amount, invoice.balance_due) }))} />)}</div> : <EmptyPanel>This vendor has no posted invoices with an outstanding balance.</EmptyPanel>}</section>
      <div className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-3"><Field label="Gross settled" value={formatMoney(gross, currency)} /><div><p className="font-mont text-[11px] text-gray-05">WHT withheld</p><MoneyInput valueKobo={wht} onChangeKobo={setWht} currency={currency} /></div><Field label="Net cash paid" value={formatMoney(Math.max(0, gross - wht), currency)} /></div>
      <PostingRecap title="Live posting preview" currency={currency} dr={[{ code: "AP", name: "Accounts payable", amount: gross }]} cr={[{ code: "BANK", name: "Selected bank account", amount: Math.max(0, gross - wht) }, ...(wht ? [{ code: "WHT", name: "Withholding tax payable", amount: wht }] : [])]} helper="No invoice balance changes until the approved payment is posted." />
    </div>
  </DetailDrawer>;
}

function InvoiceAllocationRow({ invoice, amount, currency, onChange }: { invoice: VendorPaymentEligibleInvoice; amount: number; currency?: string | null; onChange: (amount: number) => void }) {
  const checked = amount > 0;
  return <div className="grid grid-cols-1 gap-3 rounded-md border border-white-02 p-3 sm:grid-cols-[auto_minmax(0,1fr)_160px]"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked ? invoice.balance_due : 0)} className="mt-1 size-4 accent-primary" aria-label={`Select ${invoice.document_number}`} /><div className="min-w-0"><p className="font-mont text-sm font-semibold text-primary">{invoice.document_number}</p><p className="mt-1 font-mont text-[11px] text-gray-05">Due {shortDate(invoice.due_date)} · balance {formatMoney(invoice.balance_due, currency)}</p></div><MoneyInput valueKobo={amount} onChangeKobo={onChange} currency={currency} disabled={!checked} /></div>;
}
