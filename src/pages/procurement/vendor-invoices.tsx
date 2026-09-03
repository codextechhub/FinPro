import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useActionParam } from "@/hooks/use-action-param";
import {
  AlertTriangle, Check, ChevronRight, CircleDollarSign, Clock3, FilePenLine,
  FileText, History, List, Paperclip, Plus, Printer, RotateCcw, Search, Send, X,
} from "lucide-react";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import { PurchaseOrderPicker, VendorPicker } from "./pickers";
import { useUserDirectory } from "../../components/workflow/use-user-directory";
import { sameId } from "../../components/workflow/workflow-format";
import {
  DataTable, DetailDrawer, EmptyState, ErrorState, FormField, InfoHint, LineEditor,
  LoadingState, PostingRecap, StatCard, StatusPill, emptyLine, toApiLines, toArray,
  useActiveEntity, type Column, type DocLine,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../permissions";
import { useAppSelector } from "@/redux/store";
import {
  useCreateVendorInvoiceMutation, useGetProcurementSettingsQuery,
  useGetPurchaseOrderQuery, useGetVendorInvoiceQuery,
  useGetVendorInvoiceSummaryQuery, useGetVendorInvoicesQuery,
  useLazyCheckVendorInvoiceReferenceQuery,
  useMatchVendorInvoiceMutation, usePostVendorInvoiceMutation,
  useSubmitVendorInvoiceMutation, useUpdateVendorInvoiceMutation,
  useAttachVendorInvoiceFileMutation, useDeleteVendorInvoiceFileMutation,
} from "@/redux/services/procurement/procurement-api";
import type {
  VendorInvoice, VendorInvoiceReferenceCheck,
} from "@/redux/services/procurement/procurement-types";
import {
  useGetWorkflowInstanceQuery, useRecordWorkflowActionMutation,
} from "@/redux/services/dashboard/workflow-api";
import type { VoteAction } from "@/redux/services/dashboard/workflow-types";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { apiErrorMessage, apiFieldError } from "@/utils/api-errors";
import { InvoiceVarianceOverrideAction } from "./procurement-action-gates";
import { blockingMatchReason, isBlockingInvoiceVariance } from "./invoice-action-model";
import { ActivityFeed } from "./activity-feed";
import { DocumentAttachments } from "./document-attachments";
import { sourceDocumentIdFromParams } from "@/lib/source-document-route";
import { PageShell } from "@/components/layout/page-shell";

const TABS = [
  ["All", ""], ["Draft", "DRAFT"], ["Under Review", "PENDING_APPROVAL"],
  ["Approved", "APPROVED"], ["Posted", "POSTED"], ["Overdue", "OVERDUE"],
  ["Disputed", "DISPUTED"], ["Partial", "PARTIAL"], ["Paid", "PAID"],
] as const;

const DETAIL_TABS = [
  ["overview", "Overview", FileText], ["lines", "Line Items", List],
  ["match", "3-Way Match", Check], ["payments", "Payment History", CircleDollarSign],
  ["attachments", "Attachments", Paperclip], ["activity", "Activity", History],
] as const;

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
function OpenStat({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return <div className="min-w-0"><p className="font-mont text-[11px] text-gray-05">{label}</p><p className={cn("mt-0.5 font-mont text-sm font-semibold tabular-nums", highlight ? "text-primary" : "text-black-01")}>{value}</p></div>;
}
function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{children}</div>;
}

export default function VendorInvoicesPage() {
  const { code: entity, currency } = useActiveEntity();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(() => (
    sourceDocumentIdFromParams(searchParams)
  ));
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PROC_CREATE_VENDOR_INVOICE), () => setCreating(true));
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  const params = useMemo(() => ({ entity: entity!, page, ...(status ? { display_status: status } : {}), ...(debouncedSearch ? { search: debouncedSearch } : {}) }), [entity, page, status, debouncedSearch]);
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetVendorInvoicesQuery(params, { skip: !entity });
  const { data: summaryData, isLoading: summaryLoading } = useGetVendorInvoiceSummaryQuery({ entity: entity! }, { skip: !entity });
  const rows = toArray(data?.data);
  const summary = summaryData?.data;
  const money = (value: number) => formatMoney(value, currency);
  const columns: Column<VendorInvoice>[] = [
    { header: "Invoice #", cell: (invoice) => <div className="min-w-36"><p className="font-mont text-sm font-semibold text-primary">{invoice.document_number}</p><p className="mt-1 text-[11px] text-gray-05">{invoice.vendor_reference || "No vendor reference"}</p></div> },
    { header: "Vendor", cell: (invoice) => <div className="min-w-32"><p className="font-semibold">{invoice.vendor_name || invoice.vendor_code}</p><p className="mt-0.5 text-[11px] text-gray-05">{invoice.vendor_code}</p></div> },
    { header: "PO Ref", cell: (invoice) => invoice.purchase_order_number || "Direct" },
    { header: "Due Date", cell: (invoice) => shortDate(invoice.due_date) },
    { header: "Amount", align: "right", cell: (invoice) => <span className="tabular-nums">{money(invoice.total)}</span> },
    { header: "Paid", align: "right", cell: (invoice) => <span className="tabular-nums">{money(invoice.amount_paid)}</span> },
    { header: "Status", cell: (invoice) => <div className="flex flex-wrap gap-1"><StatusPill status={invoice.status} />{invoice.display_status !== invoice.status && <StatusPill status={invoice.display_status} />}</div> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];
  if (!entity) return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view its vendor invoices." /></PageShell></ProcurementShell>;
  return <ProcurementShell>
    <PageShell className="space-y-5 text-black-01">
      <header data-guide="procurement-vendor-invoices.heading" className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1.5"><h1 className="font-mont text-lg font-semibold text-gray-01">Vendor Invoices</h1><InfoHint ariaLabel="About vendor invoices">Supplier bills remain drafts until matched, approved, and posted to Accounts Payable.</InfoHint></div><p className="mt-0.5 font-mont text-xs text-gray-05">Review three-way matches, approval, settlement, and overdue exposure.</p></div><div className="flex flex-wrap items-center gap-2"><QuickExportButton screen="procurement.vendor_invoices" params={{ status, search: debouncedSearch }} entity={entity} typeface="geist" defaultName="Vendor invoices" /><Can permission={P.PROC_CREATE_VENDOR_INVOICE}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> Record Invoice</Button></Can></div></header>
      <div data-guide="procurement-vendor-invoices.summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryLoading || !summary ? <div className={cn(INFORMATION_CARD_SURFACE, "col-span-full rounded-md")}><LoadingState rows={2} /></div> : <>
          <StatCard label="Under Review" value={summary.under_review.count} icon={Clock3} tone="amber" />
          <StatCard label="Approved" value={summary.approved.count} icon={Check} tone="green" />
          <StatCard label="Overdue" value={summary.overdue.count} sub={money(summary.overdue.amount)} icon={AlertTriangle} tone="red" />
          <StatCard label="Disputed" value={summary.disputed.count} icon={AlertTriangle} tone="red" />
        </>}
      </div>
      <section data-guide="procurement-vendor-invoices.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
          <div className="max-w-full overflow-x-auto"><div className="flex min-w-max gap-5">{TABS.map(([label, value]) => <button key={label} onClick={() => { setStatus(value); setPage(1); }} className={cn("border-b-2 py-3 font-mont text-xs font-medium whitespace-nowrap", status === value ? "border-primary text-primary" : "border-transparent text-gray-05")}>{label}</button>)}</div></div>
          <label className="relative my-2 min-w-0 flex-1 sm:max-w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search invoices or vendors" className="h-9 bg-white pl-9" /></label>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(invoice) => invoice.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(invoice) => setSelectedId(invoice.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle={status ? `No ${TABS.find((tab) => tab[1] === status)?.[0].toLowerCase()} invoices` : "No vendor invoices yet"} emptyMessage={debouncedSearch ? "Try a different search term or status." : "Record a supplier bill to begin matching."} />
      </section>
    </PageShell>
    <InvoiceDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <InvoiceForm entity={entity} currency={currency} onClose={() => setCreating(false)} />}
  </ProcurementShell>;
}

function InvoiceDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const user = useAppSelector((state) => state.auth.user);
  const uid = user?.id == null ? "" : String(user.id);
  const { name } = useUserDirectory();
  const [tab, setTab] = useState("overview");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const { data, isLoading, isError, refetch } = useGetVendorInvoiceQuery({ id: id!, entity }, { skip: id == null });
  const invoice = data?.data;
  const workflowId = invoice?.workflow_instance_id || "";
  const { data: workflow } = useGetWorkflowInstanceQuery(workflowId, { skip: !workflowId });
  const [recordAction, { isLoading: voting }] = useRecordWorkflowActionMutation();
  const [runMatch, { isLoading: matching }] = useMatchVendorInvoiceMutation();
  const [submit, { isLoading: submitting }] = useSubmitVendorInvoiceMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "vendor invoice" });
  const [post, { isLoading: posting }] = usePostVendorInvoiceMutation();
  const [attachFile, { isLoading: attaching }] = useAttachVendorInvoiceFileMutation();
  const [removeFile, { isLoading: removingFile }] = useDeleteVendorInvoiceFileMutation();
  const activeStage = useMemo(() => (workflow?.stage_instances || []).filter((stage) => stage.status === "ACTIVE").at(-1), [workflow]);
  const canVote = !!activeStage && workflow?.status === "IN_PROGRESS" && activeStage.eligible_approvers.some((approver) => sameId(approver.user, uid) && approver.attempt === activeStage.attempt) && !activeStage.actions.some((action) => sameId(action.actor, uid) && !action.reversed_at && !action.is_reversal_of && action.attempt === activeStage.attempt);
  const vote = async (action: VoteAction) => {
    if (!workflowId || ((action === "REJECTED" || action === "RETURNED") && !comment.trim())) return;
    try { await recordAction({ id: workflowId, action, comment: comment.trim() }).unwrap(); toast.success(action === "APPROVED" ? "Approval recorded." : action === "RETURNED" ? "Revision requested." : "Invoice rejected."); setComment(""); } catch { /* central */ }
  };
  const action = async (kind: "match" | "submit" | "post" | "override") => {
    if (!invoice) return;
    try {
      if (kind === "match") { await runMatch({ id: invoice.id, entity }).unwrap(); toast.success("Three-way match refreshed."); }
      if (kind === "submit") {
        const r = await submit({ id: invoice.id, entity }).unwrap();
        toast.success("Invoice submitted for approval.");
        promptIfParked(r.data?.approval);  // Submitted, but possibly with no approver.
      }
      if (kind === "post") { await post({ id: invoice.id, entity }).unwrap(); toast.success("Vendor invoice posted to Accounts Payable."); }
      if (kind === "override") { await post({ id: invoice.id, entity, allow_variance: true }).unwrap(); toast.success("Vendor invoice posted with an audited variance override."); }
    } catch { /* central */ }
  };
  const editable = invoice?.status === "DRAFT" && ["NOT_SUBMITTED", "REJECTED"].includes(invoice.approval_state);
  const postEligible = invoice?.status === "DRAFT" && invoice.approval_state === "APPROVED";
  const blockingVariance = !!invoice && isBlockingInvoiceVariance(invoice.match_status);
  return <>
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} title={invoice?.document_number || "Vendor invoice"} description={invoice ? `${invoice.vendor_name || invoice.vendor_code} · ${invoice.purchase_order_number || "Direct invoice"} · due ${shortDate(invoice.due_date)}` : "Loading vendor invoice"} widthClass="sm:max-w-[720px]" footer={invoice && <>
      <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
      {editable && <Can permission={P.PROC_UPDATE_VENDOR_INVOICE}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
      {editable && <Can permission={P.PROC_MATCH_VENDOR_INVOICE}><Button variant="outline" loading={matching} onClick={() => action("match")}><Check className="size-4" /> Run Match</Button></Can>}
      {editable && <Can permission={P.PROC_SUBMIT_VENDOR_INVOICE}><Button loading={submitting} onClick={() => action("submit")}><Send className="size-4" /> Submit for Approval</Button></Can>}
      {postEligible && !blockingVariance && <Can permission={P.PROC_POST_VENDOR_INVOICE}><Button loading={posting} onClick={() => action("post")}><Send className="size-4" /> Post Invoice</Button></Can>}
      {postEligible && blockingVariance && <InvoiceVarianceOverrideAction reference={invoice.document_number} onConfirm={() => action("override")} />}
    </>}>
      {isLoading ? <LoadingState rows={8} /> : isError || !invoice ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1.5"><StatusPill status={invoice.status} /><StatusPill status={invoice.approval_state} /><StatusPill status={invoice.match_status} /><StatusPill status={invoice.payment_status} />{invoice.is_overdue && <StatusPill status="OVERDUE" />}</div><p className="font-mont text-lg font-semibold tabular-nums">{formatMoney(invoice.total, currency)}</p></div>
        <div className="max-w-full overflow-x-auto border-b border-white-02"><div className="flex min-w-max gap-5">{DETAIL_TABS.map(([value, label, Icon]) => <button key={value} onClick={() => setTab(value)} className={cn("flex items-center gap-1.5 border-b-2 py-2.5 font-mont text-xs font-medium whitespace-nowrap", tab === value ? "border-primary text-primary" : "border-transparent text-gray-05")}><Icon className="size-3.5" />{label}</button>)}</div></div>
        {tab === "overview" && <div className="space-y-5">
          {invoice.approval_state === "PENDING" && <section className="rounded-md border border-amber-200 bg-amber-50 p-4"><p className="font-mont text-sm font-semibold text-amber-900">{canVote ? "Your approval is required" : activeStage ? `Awaiting ${activeStage.stage_label}` : "Approval in progress"}</p>{canVote && <><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment (required for revision or rejection)" className="mt-3 min-h-20 bg-white" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" loading={voting} onClick={() => vote("APPROVED")}><Check className="size-4" /> Approve</Button><Button size="sm" variant="outline" disabled={!comment.trim() || voting} onClick={() => vote("RETURNED")}><RotateCcw className="size-4" /> Request Revision</Button><Button size="sm" variant="outline-dest" disabled={!comment.trim() || voting} onClick={() => vote("REJECTED")}><X className="size-4" /> Reject</Button></div></>}</section>}
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Vendor invoice #" value={invoice.vendor_reference} /><Field label="Internal invoice #" value={invoice.document_number} /><Field label="Vendor" value={invoice.vendor_name || invoice.vendor_code} /><Field label="PO reference" value={invoice.purchase_order_number || "Direct invoice"} /><Field label="Invoice date" value={shortDate(invoice.invoice_date)} /><Field label="Due date" value={shortDate(invoice.due_date)} /><Field label="Subtotal" value={formatMoney(invoice.subtotal, currency)} /><Field label="Tax" value={formatMoney(invoice.tax_total, currency)} /><Field label="Paid" value={formatMoney(invoice.amount_paid, currency)} /><Field label="Balance due" value={formatMoney(invoice.balance_due, currency)} /></dl>
          <InvoicePostingRecap invoice={invoice} currency={currency} />
        </div>}
        {tab === "lines" && (invoice.lines.length ? <div className="overflow-x-auto rounded-md border border-white-02"><table className="min-w-[580px] w-full"><thead><tr>{["Description", "Qty", "Unit price", "Tax", "Total"].map((label) => <th key={label} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{label}</th>)}</tr></thead><tbody>{invoice.lines.map((line) => <tr key={line.id}><td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{line.description}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{formatQuantity(line.quantity)}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{formatMoney(line.unit_price, currency)}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{formatMoney(line.tax_amount, currency)}</td><td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold tabular-nums">{formatMoney(line.net_amount + line.tax_amount, currency)}</td></tr>)}</tbody></table></div> : <EmptyPanel>No invoice lines were recorded.</EmptyPanel>)}
        {tab === "match" && <MatchPanel invoice={invoice} currency={currency} />}
        {tab === "payments" && (invoice.payments?.length ? <div className="space-y-2">{invoice.payments.map((payment) => <div key={payment.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-md border border-white-02 p-3"><div><p className="font-mont text-sm font-semibold">{payment.document_number}</p><p className="mt-1 font-mont text-xs text-gray-05">{shortDate(payment.payment_date)} · {payment.status}</p></div><p className="font-mont text-sm font-semibold tabular-nums">{formatMoney(payment.amount, currency)}</p></div>)}</div> : <EmptyPanel>No payment has been allocated to this invoice.</EmptyPanel>)}
        {tab === "attachments" && <DocumentAttachments
          attachments={invoice.attachments || []}
          attachPermission={P.PROC_ATTACH_VENDOR_INVOICE_FILE}
          uploading={attaching}
          deleting={removingFile}
          emptyMessage="No supplier paperwork has been filed against this bill yet."
          onUpload={async (file, caption) => {
            try { await attachFile({ id: invoice.id, entity, file, caption }).unwrap(); toast.success("Attachment uploaded."); } catch { /* central */ }
          }}
          onDelete={async (attachmentId) => {
            try { await removeFile({ id: invoice.id, entity, attachmentId }).unwrap(); toast.success("Attachment removed."); } catch { /* central */ }
          }}
        />}
        {tab === "activity" && <ActivityPanel invoice={invoice} workflow={workflow} name={name} />}
      </div>}
      {noApproverDialog}
    </DetailDrawer>
    {invoice && editing && <InvoiceForm entity={entity} currency={currency} initial={invoice} onClose={() => setEditing(false)} />}
  </>;
}

function InvoicePostingRecap({ invoice, currency }: { invoice: VendorInvoice; currency?: string | null }) {
  if (invoice.posting_lines?.length) return <PostingRecap title="Posted journal" currency={currency} dr={invoice.posting_lines.filter((line) => line.debit).map((line) => ({ code: line.account_code, name: line.account_name, amount: line.debit }))} cr={invoice.posting_lines.filter((line) => line.credit).map((line) => ({ code: line.account_code, name: line.account_name, amount: line.credit }))} helper="This is the actual posted journal." />;
  const dr = [{ code: invoice.purchase_order_id ? "GR/IR" : "Expense", name: invoice.purchase_order_id ? "Goods received / invoice received" : "Direct purchase expense", amount: invoice.subtotal }];
  if (invoice.tax_total) dr.push({ code: "Input VAT", name: "Recoverable input tax", amount: invoice.tax_total });
  return <PostingRecap title="Posting preview" currency={currency} dr={dr} cr={[{ code: "AP", name: "Accounts payable", amount: invoice.total }]} helper="Posting revalidates approval and the three-way match under row locks." />;
}

const MATCH_STATUS_HEADLINE: Record<string, string> = {
  AUTO_MATCHED: "3-way match passed",
  NOT_MATCHED: "Not matched yet",
  PRICE_VARIANCE: "Price variance - does not block posting",
  UNDER_RECEIVED: "Under received - blocks posting",
  OVER_BILLED: "Over billed - blocks posting",
  NON_PO_BLOCKED: "No purchase order - blocks posting",
};

function MatchPanel({ invoice, currency }: { invoice: VendorInvoice; currency?: string | null }) {
  const blocking = isBlockingInvoiceVariance(invoice.match_status);
  const reason = blockingMatchReason(invoice.match_status);
  // A non-PO bill has nothing to compare, but when the entity disallows one it is
  // still the state the reader most needs explained - so the banner comes first and
  // only a genuinely unremarkable direct bill falls through to the empty panel.
  if (!invoice.purchase_order_id && !blocking) {
    return <EmptyPanel>This is a direct invoice, so there is no PO or goods receipt to match.</EmptyPanel>;
  }
  return <div className="space-y-4">
    <div className={cn(
      "rounded-md border p-4",
      blocking ? "border-red-200 bg-red-50"
        : invoice.match_status === "PRICE_VARIANCE" ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50",
    )}>
      <p className="font-mont text-sm font-semibold">{MATCH_STATUS_HEADLINE[invoice.match_status] ?? invoice.match_status.replaceAll("_", " ").toLowerCase()}</p>
      <p className="mt-1 font-mont text-xs leading-5 text-gray-05">
        {reason
          ?? (invoice.match_status === "PRICE_VARIANCE"
            ? "The unit price differs from the order beyond the price tolerance. GR/IR clears at the receipt basis and the difference posts to purchase price variance, so this bill posts without an override."
            : "Quantity and unit price are compared against the order and its posted receipts, within the tolerances set in procurement settings.")}
      </p>
    </div>
    {invoice.match_comparisons?.map((row) => <div key={row.invoice_line_id} className="rounded-md border border-white-02 p-4"><p className="font-mont text-sm font-semibold">{row.description}</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Field label="Ordered" value={formatQuantity(row.po_quantity)} /><Field label="Received" value={formatQuantity(row.received_quantity)} /><Field label="Previously invoiced" value={formatQuantity(row.previously_invoiced_quantity)} /><Field label="This invoice" value={formatQuantity(row.invoice_quantity)} /><Field label="PO price" value={row.po_unit_price == null ? "-" : formatMoney(row.po_unit_price, currency)} /><Field label="Invoice price" value={formatMoney(row.invoice_unit_price, currency)} /><Field label="Goods receipt" value={row.grn_number || "All posted receipts"} /><Field label="GR accepted" value={formatQuantity(row.grn_accepted_quantity)} /></div></div>)}
  </div>;
}

function ActivityPanel({ invoice, workflow, name }: { invoice: VendorInvoice; workflow: ReturnType<typeof useGetWorkflowInstanceQuery>["data"]; name: (id: string | number | null | undefined) => string }) {
  return <ActivityFeed workflowLogs={workflow?.audit_logs} activity={invoice.activity} resolveActorName={name} emptyMessage="No approval or posting activity has been recorded yet." />;
}

type POLineDraft = { po_line: number; description: string; expense_account: string; quantity: number; unit_price: number };
function InvoiceForm({ entity, currency, initial, onClose }: { entity: string; currency?: string | null; initial?: VendorInvoice; onClose: () => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<"po" | "direct">(initial ? (initial.purchase_order_id ? "po" : "direct") : "po");
  const { can } = useCan();
  // A bill with no PO has nothing to three-way match, so the entity has to opt in.
  // Read the policy rather than assume it - but fall back to offering the choice
  // when we cannot read it (the settings key is separate from the invoicing keys),
  // because the server refuses the post either way and hiding the option from
  // somebody whose entity genuinely allows it would be the worse failure.
  const settingsQ = useGetProcurementSettingsQuery(
    { entity }, { skip: !can(P.PROC_VIEW_SETTINGS) },
  );
  const nonPoPolicyKnown = !!settingsQ.data?.data?.settings;
  const nonPoAllowed = !nonPoPolicyKnown || settingsQ.data!.data.settings.allow_non_po_invoices;
  // An existing direct draft stays editable whatever the policy now says: it was
  // recorded under the old one and blocking its edit strands it.
  const editingExistingDirect = !!initial && !initial.purchase_order_id;
  const directDisabled = !nonPoAllowed && !editingExistingDirect;
  const [vendor, setVendor] = useState(initial?.vendor_code || "");
  const [po, setPo] = useState(initial?.purchase_order_id ? String(initial.purchase_order_id) : "");
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoice_date || "");
  const [dueDate, setDueDate] = useState(initial?.due_date || "");
  const [reference, setReference] = useState(initial?.vendor_reference || "");
  const [referenceError, setReferenceError] = useState("");
  const [referenceCheck, setReferenceCheck] = useState<VendorInvoiceReferenceCheck | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSubmitAfter, setPendingSubmitAfter] = useState(false);
  const [narration, setNarration] = useState(initial?.narration || "");
  const [poLines, setPoLines] = useState<POLineDraft[]>(initial?.purchase_order_id ? initial.lines.map((line) => ({ po_line: line.po_line_id!, description: line.description, expense_account: line.expense_code, quantity: Number(line.quantity), unit_price: line.unit_price })) : []);
  const [directLines, setDirectLines] = useState<DocLine[]>(initial && !initial.purchase_order_id ? initial.lines.map((line) => ({ id: crypto.randomUUID(), description: line.description, quantity: Number(line.quantity), unitPriceKobo: line.unit_price, account: line.expense_code, taxCode: line.tax_code_id ? String(line.tax_code_id) : "", costCenter: "" })) : [emptyLine()]);
  const { data: poData } = useGetPurchaseOrderQuery({ id: Number(po), entity }, { skip: !po });
  const source = poData?.data;
  // Prefill vendor + PO lines once when a PO different from the initial one is
  // chosen and its data has loaded - adjusted during render so a background
  // refetch never clobbers edits made after picking.
  const [filledFrom, setFilledFrom] = useState<number | null>(null);
  if (source && initial?.purchase_order_id !== source.id && filledFrom !== source.id) {
    setFilledFrom(source.id);
    setVendor(source.vendor_code);
    setPoLines(source.lines.filter((line) => Number(line.received_qty) - Number(line.invoiced_qty) > 0).map((line) => ({ po_line: line.id, description: line.description, expense_account: line.expense_code, quantity: Math.max(0, Number(line.received_qty) - Number(line.invoiced_qty)), unit_price: line.unit_price })));
  }
  const [create, { isLoading: creating }] = useCreateVendorInvoiceMutation();
  const [update, { isLoading: updating }] = useUpdateVendorInvoiceMutation();
  const [submit, { isLoading: submitting }] = useSubmitVendorInvoiceMutation();
  const [checkReference, { isFetching: checkingReference }] = useLazyCheckVendorInvoiceReferenceQuery();
  useEffect(() => {
    const trimmed = reference.trim();
    if (!vendor || !trimmed) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkReference({
          entity,
          vendor,
          reference: trimmed,
          ...(initial ? { exclude: initial.id } : {}),
        }).unwrap();
        if (!current) return;
        setReferenceCheck(result.data);
        if (result.data.same_vendor_duplicate) {
          setReferenceError("This vendor invoice number is already recorded for the selected vendor.");
        }
      } catch (error) {
        if (!current) return;
        const fieldError = apiFieldError(error, "reference");
        if (fieldError) setReferenceError(fieldError);
      }
    }, 350);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [checkReference, entity, initial, reference, vendor]);
  const lines = mode === "po" ? poLines.map((line, index) => ({ ...line, line_no: index + 1 })) : toApiLines(directLines, "expense_account");
  const total = mode === "po" ? poLines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price), 0) : directLines.reduce((sum, line) => sum + Math.round(Number(line.quantity || 0) * Number(line.unitPriceKobo || 0)), 0);
  const saving = creating || updating || submitting;
  const canSave = !!vendor && !!invoiceDate && !!reference.trim() && !referenceError && lines.length > 0 && (mode === "direct" || !!po) && total > 0;
  // Open-to-invoice position, straight off the PO's running received/invoiced
  // totals - so AP bills against one figure instead of hunting through receipts.
  const poLineById = source ? new Map(source.lines.map((l) => [l.id, l])) : null;
  const poPosition = source ? {
    received: source.lines.reduce((s, l) => s + Math.round(Number(l.received_qty) * l.unit_price), 0),
    invoiced: source.lines.reduce((s, l) => s + Math.round(Number(l.invoiced_qty) * l.unit_price), 0),
    open: source.lines.reduce((s, l) => s + Math.round(Math.max(0, Number(l.received_qty) - Number(l.invoiced_qty)) * l.unit_price), 0),
  } : null;
  const save = async (submitAfter: boolean, confirmed = false) => {
    if (!canSave) return;
    try {
      const checked = await checkReference({
        entity,
        vendor,
        reference: reference.trim(),
        ...(initial ? { exclude: initial.id } : {}),
      }).unwrap();
      setReferenceCheck(checked.data);
      if (checked.data.same_vendor_duplicate) {
        setReferenceError("This vendor invoice number is already recorded for the selected vendor.");
        return;
      }
      if (checked.data.other_vendor_match_count > 0 && !confirmed) {
        setPendingSubmitAfter(submitAfter);
        setConfirmOpen(true);
        return;
      }
    } catch (error) {
      const fieldError = apiFieldError(error, "reference");
      if (fieldError) {
        setReferenceError(fieldError);
        return;
      }
      // The create or update endpoint repeats the authoritative check, so a
      // transient advisory-check failure must not discard an otherwise valid form.
    }
    try {
      const body = {
        vendor,
        purchase_order: mode === "po" ? Number(po) : null,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        vendor_reference: reference.trim(),
        narration: narration.trim(),
        confirm_cross_vendor_reference: confirmed,
        lines,
      };
      const result = initial
        ? await update({ id: initial.id, entity, ...body }).unwrap()
        : await create({
            entity,
            idempotency_key: idempotencyKey,
            ...body,
            purchase_order: body.purchase_order || undefined,
          }).unwrap();
      if (submitAfter) await submit({ id: result.data.id, entity }).unwrap();
      toast.success(submitAfter ? "Vendor invoice created and submitted." : initial ? "Vendor invoice updated." : "Vendor invoice saved as draft.");
      onClose();
    } catch (error) {
      const fieldError = apiFieldError(error, "vendor_reference");
      if (fieldError) {
        if (fieldError.includes("another vendor")) {
          setReferenceError("");
          try {
            const checked = await checkReference({
              entity,
              vendor,
              reference: reference.trim(),
              ...(initial ? { exclude: initial.id } : {}),
            }).unwrap();
            setReferenceCheck(checked.data);
            if (checked.data.other_vendor_match_count > 0) {
              setPendingSubmitAfter(submitAfter);
              setConfirmOpen(true);
            }
          } catch {
            setReferenceError(fieldError);
          }
        } else {
          setReferenceError(fieldError);
        }
        return;
      }
      toast.error(apiErrorMessage(error, "The vendor invoice could not be saved."));
    }
  };
  const otherMatches = referenceCheck?.other_vendor_matches || [];
  return <>
  <DetailDrawer open onOpenChange={(open) => !saving && !open && onClose()} title={initial ? "Edit Vendor Invoice" : "Record Invoice"} description={initial ? "Update this unsubmitted draft; its prior match will be cleared." : "Capture a supplier bill for matching and approval."} widthClass="sm:max-w-[720px]" footer={<><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="outline" disabled={!canSave} loading={creating || updating} onClick={() => save(false)}>Save Draft</Button>{!initial && <Button disabled={!canSave} loading={saving} onClick={() => save(true)}>Create & Submit</Button>}</>}>
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-md bg-gray-100 p-1">{(["po", "direct"] as const).map((value) => { const off = value === "direct" && directDisabled; return <button key={value} disabled={off} title={off ? "This entity does not allow bills without a purchase order." : undefined} onClick={() => { setMode(value); if (value === "direct") setPo(""); }} className={cn("rounded px-3 py-2 font-mont text-xs font-medium", mode === value ? "bg-white text-primary shadow-sm" : "text-gray-05", off && "cursor-not-allowed opacity-50")}>{value === "po" ? "PO-backed invoice" : "Direct invoice"}</button>; })}</div>
      {directDisabled && <p className="font-mont text-[11px] leading-5 text-gray-05">Bills without a purchase order are turned off for this entity. A non-PO bill has no ordered quantity, no receipt and no agreed price to check against, so approval is its only control. An administrator can turn it on under Procurement settings.</p>}
      {mode === "direct" && editingExistingDirect && !nonPoAllowed && <p className="font-mont text-[11px] leading-5 text-amber-800">Bills without a purchase order are now turned off for this entity. You can still edit this draft, but posting it will need a variance override.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={(value) => { setVendor(value); setReferenceError(""); setReferenceCheck(null); }} disabled={mode === "po" && !!source} /></FormField>{mode === "po" && <FormField label="Purchase order" required><PurchaseOrderPicker entity={entity} value={po} onChange={setPo} placeholder="Select a received PO" /></FormField>}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><FormField label="Vendor invoice #" required><div><Input value={reference} onChange={(event) => { setReference(event.target.value); setReferenceError(""); setReferenceCheck(null); }} aria-invalid={!!referenceError} className={cn("bg-white", referenceError && "border-red-500 focus-visible:ring-red-200")} />{checkingReference && <p className="mt-1 font-mont text-[11px] text-gray-05">Checking this number...</p>}{referenceError && <p role="alert" className="mt-1 font-mont text-[11px] font-medium text-red-600">{referenceError}</p>}</div></FormField><PostingDateField label="Invoice date" entity={entity} value={invoiceDate} onChange={setInvoiceDate} /><FormField label="Due date"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="bg-white" /></FormField></div>
      {otherMatches.length > 0 && <section className="rounded-md border border-amber-300 bg-amber-50 p-3" aria-label="Invoice number warning"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" /><div className="min-w-0"><p className="font-mont text-xs font-semibold text-amber-900">This invoice number is used by another vendor</p><p className="mt-1 font-mont text-[11px] text-amber-800">Review the existing record. You will need to confirm before this invoice can be saved.</p></div></div><div className="mt-3 space-y-2">{otherMatches.map((match) => <div key={match.id} className="grid grid-cols-1 gap-1 rounded border border-amber-200 bg-white px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-3"><div className="min-w-0"><p className="truncate font-mont text-xs font-semibold text-gray-01">{match.vendor_name}</p><p className="font-mont text-[11px] text-gray-05">{match.vendor_code} · {match.document_number}</p></div><span className="font-mont text-[11px] text-gray-05">{shortDate(match.invoice_date)}</span><span className="font-mont text-xs font-semibold tabular-nums">{formatMoney(match.total, currency)}</span><StatusPill status={match.status} /></div>)}{(referenceCheck?.other_vendor_match_count || 0) > otherMatches.length && <p className="font-mont text-[11px] text-amber-800">Plus {(referenceCheck?.other_vendor_match_count || 0) - otherMatches.length} more matching invoice(s).</p>}</div></section>}
      <FormField label="Narration"><Textarea value={narration} onChange={(event) => setNarration(event.target.value)} className="bg-white" /></FormField>
      {mode === "po" ? <div className="space-y-3">
        {poPosition && <div className="grid grid-cols-3 gap-2 rounded-md border border-primary/15 bg-primary/5 p-3">
          <OpenStat label="Received" value={formatMoney(poPosition.received, currency)} />
          <OpenStat label="Already invoiced" value={formatMoney(poPosition.invoiced, currency)} />
          <OpenStat label="Open to invoice" value={formatMoney(poPosition.open, currency)} highlight />
        </div>}
        <p className="font-mont text-xs font-semibold text-gray-05">Received quantities available to invoice</p>
        {poLines.length ? poLines.map((line, index) => {
          const src = poLineById?.get(line.po_line);
          const open = src ? Math.max(0, Number(src.received_qty) - Number(src.invoiced_qty)) : line.quantity;
          return <div key={line.po_line} className="grid grid-cols-1 gap-3 rounded-md border border-white-02 p-3 sm:grid-cols-[minmax(0,1fr)_110px_150px]">
            <div className="min-w-0">
              <p className="font-mont text-sm font-semibold">{line.description}</p>
              <p className="mt-1 font-mont text-xs text-gray-05">{src && <>Received {formatQuantity(src.received_qty)} · Invoiced {formatQuantity(src.invoiced_qty)} · <span className="font-semibold text-primary">Open {formatQuantity(open)}</span> · </>}{formatMoney(line.unit_price, currency)} each</p>
            </div>
            <Input type="number" min="0" max={open || undefined} step="0.0001" value={line.quantity} onChange={(event) => setPoLines((rows) => rows.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) } : row))} aria-label={`${line.description} quantity`} className="bg-white text-right tabular-nums" />
            <p className="self-center text-right font-mont text-sm font-semibold tabular-nums">{formatMoney(Math.round(line.quantity * line.unit_price), currency)}</p>
          </div>;
        }) : <EmptyPanel>Select a PO with posted, uninvoiced receipt quantities.</EmptyPanel>}
      </div> : <LineEditor entity={entity} lines={directLines} onChange={setDirectLines} accountLabel="Expense account" accountType="EXPENSE" currency={currency} showCostCenter={false} taxUsage="purchase" />}
      <PostingRecap title="Live posting preview" currency={currency} dr={[{ code: mode === "po" ? "GR/IR" : "Expense", name: mode === "po" ? "Goods received / invoice received" : "Direct purchase expense", amount: total }]} cr={[{ code: "AP", name: "Accounts payable", amount: total }]} helper="Tax, when selected on a direct line, is priced by the server and shown on the saved draft." />
    </div>
  </DetailDrawer>
  <AlertDialog open={confirmOpen} onOpenChange={(open) => !saving && setConfirmOpen(open)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Use this invoice number again?</AlertDialogTitle>
        <AlertDialogDescription>This number already belongs to {referenceCheck?.other_vendor_match_count || 0} invoice(s) from another vendor. Confirm that you checked the supplier and supporting document before continuing.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={saving}>Go back and review</AlertDialogCancel>
        <AlertDialogAction disabled={saving} onClick={() => { setConfirmOpen(false); void save(pendingSubmitAfter, true); }}>Confirm and continue</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  </>;
}
