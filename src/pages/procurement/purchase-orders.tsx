import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import {
  CheckCircle2, ChevronRight, Clock3, FilePenLine, FileText, Info, Mail, PackageCheck,
  Plus, Printer, ReceiptText, Search, Send, ShoppingCart,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import { RequisitionPicker, VendorPicker, ContractPicker } from "./pickers";
import { useUserDirectory } from "../../components/workflow/use-user-directory";
import {
  Can, ConfirmActionModal, DataTable, DetailDrawer, EmptyState, ErrorState,
  FormField, InfoHint, LoadingState, StatCard, StatusPill, toArray, useActiveEntity, useCan, type Column,
} from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { QuickExportButton } from "@/components/custom/quick-export-drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "@/permissions";
import { routesPath } from "@/routes/routes-path";
import {
  useCreatePurchaseOrderMutation, useGetPurchaseOrderQuery,
  useGetPurchaseOrderEmailPreviewQuery,
  useGetPurchaseOrderSummaryQuery, useGetRequisitionQuery,
  useGetPurchaseOrdersQuery, useRetryPurchaseOrderEmailMutation,
  useSendPurchaseOrderEmailMutation, useSubmitPurchaseOrderMutation, useUpdatePurchaseOrderMutation,
} from "@/redux/services/procurement/procurement-api";
import type { PurchaseOrder, PurchaseOrderEmailDelivery } from "@/redux/services/procurement/procurement-types";
import { useGetWorkflowInstanceQuery } from "@/redux/services/dashboard/workflow-api";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { sourceDocumentIdFromParams } from "@/lib/source-document-route";
import { PageShell } from "@/components/layout/page-shell";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Approved", value: "APPROVED" },
  { label: "Partially Received", value: "PARTIAL" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Draft", value: "DRAFT" },
];

const DETAIL_TABS = [
  { value: "overview", label: "Overview", icon: Info },
  { value: "lines", label: "Line Items", icon: FileText },
  { value: "receipts", label: "Goods Receipts", icon: PackageCheck },
  { value: "invoices", label: "Invoices", icon: ReceiptText },
  { value: "approval", label: "Approval Trail", icon: CheckCircle2 },
  { value: "email", label: "Vendor Email", icon: Mail },
] as const;

type DetailTab = typeof DETAIL_TABS[number]["value"];

function shortDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function shortDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function percent(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return `${Number.isFinite(number) ? Math.round(number) : 0}%`;
}

export default function PurchaseOrdersPage() {
  const { code: entity, currency } = useActiveEntity();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(() => (
    sourceDocumentIdFromParams(searchParams)
  ));
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const normalized = search.trim();
    if (!normalized) return;
    const timer = window.setTimeout(() => setDebouncedSearch(normalized), 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  // Clearing search must drop the previous server filter immediately instead of
  // retaining stale rows - adjust during render, not on a delay.
  if (!search.trim() && debouncedSearch !== "") setDebouncedSearch("");

  const params = useMemo(() => ({
    entity: entity!, page, ...(status ? { status } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [entity, page, status, debouncedSearch]);
  const { currentData: data, isLoading, isFetching, isError, refetch } = useGetPurchaseOrdersQuery(
    params, { skip: !entity },
  );
  const { data: summaryData, isLoading: summaryLoading } = useGetPurchaseOrderSummaryQuery(
    { entity: entity! }, { skip: !entity },
  );
  const rows = toArray(data?.data);
  const summary = summaryData?.data;
  const pg = data?.pagination;
  const money = (value: number) => formatMoney(value, currency);

  const columns: Column<PurchaseOrder>[] = [
    {
      header: "PO Number",
      cell: (po) => <div className="min-w-32"><p className="font-mont text-sm font-semibold text-primary">{po.document_number}</p><p className="mt-1 max-w-56 truncate font-mont text-[11px] text-gray-05">{po.requisition_number || po.quotation_number || "Direct purchase order"}</p></div>,
    },
    { header: "Vendor", cell: (po) => <div className="min-w-36"><p className="font-mont text-sm font-semibold">{po.vendor_name || po.vendor_code}</p><p className="mt-0.5 font-mont text-[11px] text-gray-05">{po.vendor_code}</p></div> },
    { header: "Issue date", cell: (po) => shortDate(po.order_date) },
    { header: "Delivery", cell: (po) => shortDate(po.expected_date) },
    { header: "Total", align: "right", cell: (po) => <span className="tabular-nums">{money(po.total)}</span> },
    { header: "Received", cell: (po) => <span className="tabular-nums">{percent(po.received_pct)}</span> },
    { header: "Status", cell: (po) => <StatusPill status={po.display_status} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  if (!entity) return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view its purchase orders." /></PageShell></ProcurementShell>;

  return (
    <ProcurementShell>
      <PageShell className="space-y-5 text-black-01">
        <header data-guide="procurement-purchase-orders.heading" className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5"><h1 className="font-mont text-lg font-semibold text-gray-01">Purchase Orders</h1><InfoHint ariaLabel="About purchase orders">Approved orders issued to vendors. Receipt and invoice progress are calculated from the real linked documents.</InfoHint></div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">Track supplier commitments, delivery progress, and approval status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickExportButton
              screen="procurement.purchase_orders"
              params={{ status, search: debouncedSearch }}
              entity={entity}
              typeface="geist"
              defaultName="Purchase orders"
            />
            <Can permission={P.PROC_CREATE_PURCHASE_ORDER}><Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New Purchase Order</Button></Can>
          </div>
        </header>

        <div data-guide="procurement-purchase-orders.summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryLoading || !summary ? <div className={cn(INFORMATION_CARD_SURFACE, "col-span-full rounded-md")}><LoadingState rows={2} /></div> : <>
            <StatCard label="Open POs" value={summary.open.count} sub={money(summary.open.amount)} icon={ShoppingCart} />
            <StatCard label="Partially Received" value={summary.partially_received.count} sub={summary.partially_received.count ? "Receipt work in progress" : "No partial receipts"} icon={PackageCheck} tone="amber" />
            <StatCard label="Awaiting Receipt" value={summary.awaiting_receipt.count} sub={summary.awaiting_receipt.count ? "No accepted quantity yet" : "All open orders have receipts"} icon={Clock3} tone="gray" />
            <StatCard label="PO Value (MTD)" value={money(summary.po_value_mtd.amount)} sub={summary.po_value_mtd.change_pct == null ? "No prior MTD comparison" : `${summary.po_value_mtd.change_pct >= 0 ? "+" : ""}${summary.po_value_mtd.change_pct}% vs prior MTD`} icon={FileText} tone="green" />
          </>}
        </div>

        <section data-guide="procurement-purchase-orders.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
            <div className="max-w-full overflow-x-auto"><div className="flex min-w-max gap-5">
              {STATUS_TABS.map((tab) => <button key={tab.value || "all"} type="button" onClick={() => { setStatus(tab.value); setPage(1); }} className={cn("border-b-2 px-0.5 py-3 font-mont text-xs font-medium whitespace-nowrap", status === tab.value ? "border-primary text-primary" : "border-transparent text-gray-05 hover:text-black-01")}>{tab.label}</button>)}
            </div></div>
            <div className="flex w-full items-center py-2 sm:ml-auto sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search purchase orders" className="h-9 bg-white pl-9" /></label></div>
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(po) => po.id} loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(po) => setSelectedId(po.id)} page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage} emptyTitle={status ? `No ${STATUS_TABS.find((tab) => tab.value === status)?.label.toLowerCase()} purchase orders` : "No purchase orders yet"} emptyMessage={debouncedSearch ? "Try a different search term or status." : "Create an order from an approved requisition to begin."} />
        </section>
      </PageShell>

      <PurchaseOrderDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      {creating && <CreatePurchaseOrderDrawer open entity={entity} currency={currency} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelectedId(id); }} />}
    </ProcurementShell>
  );
}

function PurchaseOrderDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const { name } = useUserDirectory();
  const { can } = useCan();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [autoEmailVendor, setAutoEmailVendor] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [retryDelivery, setRetryDelivery] = useState<PurchaseOrderEmailDelivery | null>(null);
  const { data, isLoading, isError, refetch } = useGetPurchaseOrderQuery({ id: id!, entity }, { skip: id == null });
  const po = data?.data;
  const workflowId = po?.workflow_instance_id ?? "";
  const { data: workflow } = useGetWorkflowInstanceQuery(workflowId, { skip: !workflowId });
  const [submit, { isLoading: submitting }] = useSubmitPurchaseOrderMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "purchase order" });
  const [sendEmail, { isLoading: sendingEmail }] = useSendPurchaseOrderEmailMutation();
  const [retryEmail, { isLoading: retryingEmail }] = useRetryPurchaseOrderEmailMutation();
  const canVendorEmail = can(P.PROC_EMAIL_PURCHASE_ORDER_VENDOR);
  const { data: previewData, isLoading: previewLoading, isError: previewError } = useGetPurchaseOrderEmailPreviewQuery(
    { id: id!, entity },
    { skip: id == null || !canVendorEmail || (!confirmApproval && !emailOpen), refetchOnMountOrArgChange: true },
  );
  const emailPreview = previewData?.data;
  const money = (value: number) => formatMoney(value, currency);
  const approvalPending = po?.status === "PENDING_APPROVAL" || po?.approval_state === "PENDING";
  const draftEditable = po?.status === "DRAFT" && !approvalPending;

  const submitForApproval = async () => {
    if (!po) return;
    try {
      const r = await submit({
        id: po.id,
        entity,
        auto_email_vendor: autoEmailVendor,
        email_message: autoEmailVendor ? emailMessage.trim() : "",
      }).unwrap();
      toast.success("Purchase order submitted for approval.");
      // Nobody may hold the approving permission, leaving it submitted but stuck.
      promptIfParked(r.data?.approval);
      setConfirmApproval(false);
      setAutoEmailVendor(false);
      setEmailMessage("");
      // The mutation invalidates ProcPurchaseOrders, so this drawer, the list and
      // the summary all refetch automatically - no manual refetch needed.
    } catch { /* Central API handling presents the server validation message. */ }
  };
  const openEmail = (delivery: PurchaseOrderEmailDelivery | null = null) => {
    setRetryDelivery(delivery);
    setEmailMessage(delivery?.buyer_message || "");
    setEmailOpen(true);
  };
  const deliverEmail = async () => {
    if (!po) return;
    try {
      if (retryDelivery) {
        await retryEmail({ id: po.id, deliveryId: retryDelivery.id, entity, email_message: emailMessage.trim() }).unwrap();
        toast.success("Purchase order email retry queued.");
      } else {
        await sendEmail({ id: po.id, entity, email_message: emailMessage.trim() }).unwrap();
        toast.success("Purchase order email queued.");
      }
      setEmailOpen(false);
      setRetryDelivery(null);
      setEmailMessage("");
    } catch { /* Central API handling presents the server validation message. */ }
  };
  const openRoute = (route: string) => { onClose(); navigate(route); };

  return <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} widthClass="sm:max-w-[720px]" title={po?.document_number || "Purchase order"} description={po ? `${po.vendor_name || po.vendor_code} · ${shortDate(po.order_date)}` : "Loading purchase order"} footer={po && <>
    <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
    {po.can_email_vendor && <Can permission={P.PROC_EMAIL_PURCHASE_ORDER_VENDOR}><Button variant="outline" onClick={() => openEmail()}><Mail className="size-4" /> Email Vendor</Button></Can>}
    {draftEditable && <Can permission={P.PROC_UPDATE_PURCHASE_ORDER}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
    {approvalPending && <span className="font-mont text-xs text-gray-05">Locked while approval is pending</span>}
    {draftEditable && <Can permission={P.PROC_SUBMIT_PURCHASE_ORDER}><Button loading={submitting} onClick={() => setConfirmApproval(true)}><Send className="size-4" /> Submit for Approval</Button></Can>}
  </>}>
    {isLoading ? <LoadingState rows={7} /> : isError || !po ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><StatusPill status={po.display_status} /><p className="font-mont text-lg font-semibold tabular-nums text-black-01">{money(po.total)}</p></div>
      <div className="max-w-full overflow-x-auto border-b border-white-02"><div className="flex min-w-max gap-5">{DETAIL_TABS.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setTab(value)} className={cn("flex items-center gap-1.5 border-b-2 py-2.5 font-mont text-xs font-medium whitespace-nowrap", tab === value ? "border-primary text-primary" : "border-transparent text-gray-05")}><Icon className="size-3.5" />{label}</button>)}</div></div>

      {tab === "overview" && <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Vendor" value={po.vendor_name || po.vendor_code} /><Field label="Order date" value={shortDate(po.order_date)} /><Field label="Expected delivery" value={shortDate(po.expected_date)} /><Field label="Payment terms" value={po.payment_terms || "Not specified"} /><Field label="Delivery address" value={po.delivery_address || "Not specified"} /><Field label="Invoice progress" value={percent(po.invoiced_pct)} /></dl>
        <section className="rounded-md border border-white-02 p-4"><p className="font-mont text-sm font-semibold">Document Flow</p><div className="mt-3 grid gap-2 sm:grid-cols-2">
          <DocumentLink label="Source requisition" value={po.requisition_number || "Not linked"} disabled={!po.requisition_id} onClick={() => openRoute(routesPath.PROTECTED.PROCUREMENT.REQUISITIONS)} />
          <DocumentLink label="Awarded quotation" value={po.quotation_number || "Not linked"} disabled={!po.quotation_number} onClick={() => openRoute(`${routesPath.PROTECTED.PROCUREMENT.SOURCING}/quotations`)} />
          <DocumentLink label="Goods receipts" value={`${po.receipt_documents.length} linked`} onClick={() => setTab("receipts")} />
          <DocumentLink label="Vendor invoices" value={`${po.invoice_documents.length} linked`} onClick={() => setTab("invoices")} />
        </div></section>
        {po.narration && <section><p className="font-mont text-xs font-semibold text-gray-05">Narration</p><p className="mt-2 font-mont text-sm leading-6 text-black-01">{po.narration}</p></section>}
      </div>}

      {tab === "lines" && (po.lines.length ? <div className="overflow-x-auto rounded-md border border-white-02"><div className="grid min-w-[460px] grid-cols-[minmax(200px,1fr)_110px_150px] font-mont text-xs">
        <div className="contents bg-[#F1F1F1] font-semibold text-gray-01">
          <span className="bg-[#F1F1F1] px-3 py-2 text-[11px]">Item</span>
          <span className="bg-[#F1F1F1] px-3 py-2 text-right text-[11px]">Received</span>
          <span className="bg-[#F1F1F1] px-3 py-2 text-right text-[11px]">Total</span>
        </div>
        {po.lines.map((line) => <div key={line.id} className="contents">
          <div className="min-w-0 border-t border-white-02 px-3 py-3"><p className="truncate font-semibold text-black-01">{line.description}</p><p className="mt-1 text-gray-05">{formatQuantity(line.quantity)} × {money(line.unit_price)}</p></div>
          <div className="border-t border-white-02 px-3 py-3 text-right tabular-nums text-gray-05">{formatQuantity(line.received_qty)} / {formatQuantity(line.quantity)}</div>
          <div className="border-t border-white-02 px-3 py-3 text-right font-semibold tabular-nums">{money(line.net_amount + line.tax_amount)}</div>
        </div>)}
      </div></div> : <EmptyBlock text="No line items were added." />)}
      {tab === "receipts" && (po.receipt_documents.length ? <div className="overflow-hidden rounded-md border border-white-02"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01"><span>Receipt</span><span>Date</span><span>Status</span></div>{po.receipt_documents.map((receipt) => <button type="button" key={receipt.id} onClick={() => openRoute(routesPath.PROTECTED.PROCUREMENT.GOODS_RECEIPTS)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-white-02 px-3 py-3 text-left font-mont text-xs hover:bg-gray-50"><span className="font-semibold text-primary">{receipt.document_number}<span className="ml-2 font-normal text-gray-05">{receipt.item_count} item{receipt.item_count === 1 ? "" : "s"}</span></span><span>{shortDate(receipt.received_date)}</span><StatusPill status={receipt.status} /></button>)}</div> : <EmptyBlock text="No goods receipts have been posted against this purchase order." />)}
      {tab === "invoices" && (po.invoice_documents.length ? <div className="overflow-hidden rounded-md border border-white-02"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01"><span>Invoice</span><span>Amount</span><span>Status</span></div>{po.invoice_documents.map((invoice) => <button type="button" key={invoice.id} onClick={() => openRoute(routesPath.PROTECTED.PROCUREMENT.VENDOR_INVOICES)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-white-02 px-3 py-3 text-left font-mont text-xs hover:bg-gray-50"><span className="font-semibold text-primary">{invoice.document_number}<span className="ml-2 font-normal text-gray-05">{shortDate(invoice.invoice_date)}</span></span><span className="font-semibold tabular-nums">{money(invoice.total)}</span><StatusPill status={invoice.status} /></button>)}</div> : <EmptyBlock text="No vendor invoices are linked to this purchase order." />)}
      {tab === "approval" && (workflow?.stage_instances.length ? <div className="space-y-3">{workflow.stage_instances.map((stage) => <section key={stage.id} className="rounded-md border border-white-02 p-3"><div className="flex items-center justify-between gap-3"><p className="font-mont text-sm font-semibold">{stage.stage_label}</p><StatusPill status={stage.status} /></div>{stage.actions.length ? <div className="mt-3 space-y-2">{stage.actions.filter((action) => !action.is_reversal_of).map((action) => <div key={action.id} className="border-t border-white-02 pt-2 font-mont text-xs"><p><span className="font-semibold">{name(action.actor)}</span> · {action.action.toLowerCase()}</p><p className="mt-0.5 text-gray-05">{action.comment || "No comment"}</p></div>)}</div> : <p className="mt-2 font-mont text-xs text-gray-05">No decision recorded for this stage.</p>}</section>)}</div> : <EmptyBlock text={po.status === "DRAFT" ? "Submit this draft to begin its approval trail." : "No approval trail is available."} />)}
      {tab === "email" && (po.email_deliveries?.length ? <div className="space-y-3">{po.email_deliveries.map((delivery) => <section key={delivery.id} className="rounded-md border border-white-02 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mont text-sm font-semibold">{delivery.source === "AUTOMATIC" ? "Automatic after approval" : delivery.source === "RETRY" ? "Retry" : "Manual send"}</p><p className="mt-1 font-mont text-[11px] text-gray-05">Requested by {delivery.requested_by_name} · {shortDateTime(delivery.created_at)}</p></div><StatusPill status={delivery.status} /></div><div className="mt-3 grid grid-cols-2 gap-2 rounded bg-gray-50 p-2 font-mont text-xs"><span className="text-gray-05">Recipients</span><span className="text-right font-semibold">{delivery.recipient_count}</span><span className="text-gray-05">BCC recipients</span><span className="text-right font-semibold">{delivery.bcc_count}</span></div>{delivery.buyer_message && <p className="mt-3 whitespace-pre-wrap font-mont text-xs leading-5 text-gray-05">{delivery.buyer_message}</p>}{delivery.failure_reason && <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 font-mont text-xs text-red-700">{delivery.failure_reason}</div>}{delivery.status === "FAILED" && canVendorEmail && <div className="mt-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => openEmail(delivery)}>Retry Email</Button></div>}</section>)}</div> : <EmptyBlock text={po.can_email_vendor ? "This approved purchase order has not been emailed yet." : "Email Vendor becomes available after the purchase order is fully approved."} />)}
    </div>}
    {po && editing && <EditPurchaseOrderDrawer po={po} entity={entity} currency={currency} onClose={() => setEditing(false)} />}
    {po && <ConfirmActionModal open={confirmApproval} onOpenChange={setConfirmApproval} title="Raise this purchase order for approval?" description="Submitting locks the purchase order while approvers review it. You can email the vendor only after full approval." confirmText="Raise for Approval" onConfirm={submitForApproval} loading={submitting} confirmDisabled={autoEmailVendor && (previewLoading || previewError || !emailPreview?.recipients.length)}>
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 font-mont text-xs leading-5 text-amber-900">The vendor will not receive this draft. Approval must finish first.</div>
        {canVendorEmail && <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-white-02 p-3"><Checkbox className="mt-0.5" checked={autoEmailVendor} onCheckedChange={(checked) => setAutoEmailVendor(checked === true)} /><span className="min-w-0"><span className="block font-mont text-sm font-semibold">Automatically email this PO to the vendor when fully approved</span><span className="mt-1 block font-mont text-xs leading-5 text-gray-05">A PDF copy will be attached, and the send remains pending until approval completes.</span></span></label>}
        {autoEmailVendor && <EmailDetails preview={emailPreview} loading={previewLoading} error={previewError} message={emailMessage} onMessageChange={setEmailMessage} />}
      </div>
    </ConfirmActionModal>}
    {po && <ConfirmActionModal open={emailOpen} onOpenChange={(open) => { setEmailOpen(open); if (!open) setRetryDelivery(null); }} title={retryDelivery ? "Retry vendor email?" : "Email this purchase order to the vendor?"} description="A new audited delivery will be queued with the current approved PO attached as a PDF." confirmText={retryDelivery ? "Retry Email" : "Send Email"} onConfirm={deliverEmail} loading={sendingEmail || retryingEmail} confirmDisabled={previewLoading || previewError || !emailPreview?.recipients.length}>
      <EmailDetails preview={emailPreview} loading={previewLoading} error={previewError} message={emailMessage} onMessageChange={setEmailMessage} />
    </ConfirmActionModal>}
    {noApproverDialog}
  </DetailDrawer>;
}

function EmailDetails({ preview, loading, error, message, onMessageChange }: { preview?: { recipients: string[]; bcc: string[]; subject: string }; loading: boolean; error: boolean; message: string; onMessageChange: (value: string) => void }) {
  return <div className="space-y-3">
    <div className="rounded-md border border-white-02 bg-gray-50 p-3 font-mont text-xs">
      {loading ? <p className="text-gray-05">Loading recipients…</p> : error || !preview ? <p className="text-red-600">Recipient details could not be loaded.</p> : <div className="space-y-2"><p><span className="text-gray-05">Subject:</span> <span className="font-semibold">{preview.subject}</span></p><p><span className="text-gray-05">To:</span> <span className="font-semibold break-all">{preview.recipients.join(", ") || "No recipient"}</span></p><p><span className="text-gray-05">BCC:</span> <span className="font-semibold break-all">{preview.bcc.join(", ") || "None"}</span></p></div>}
    </div>
    <FormField label="Optional note to vendor"><Textarea value={message} maxLength={1000} onChange={(event) => onMessageChange(event.target.value)} placeholder="Add delivery instructions or a short note." className="min-h-24" /></FormField>
    <p className="text-right font-mont text-[11px] text-gray-05">{message.length}/1,000</p>
  </div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-mont text-xs text-gray-05">{label}</dt><dd className="mt-1 font-mont text-sm font-semibold text-black-01">{value}</dd></div>;
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{text}</div>;
}

function DocumentLink({ label, value, disabled, onClick }: { label: string; value: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-white-02 px-3 py-2 text-left enabled:hover:bg-gray-50 disabled:cursor-default disabled:opacity-60"><span className="min-w-0"><span className="block font-mont text-[11px] text-gray-05">{label}</span><span className="mt-1 block truncate font-mont text-sm font-semibold text-black-01">{value}</span></span>{!disabled && <ChevronRight className="size-4 shrink-0 text-gray-04" />}</button>;
}

function EditPurchaseOrderDrawer({ po, entity, currency, onClose }: { po: PurchaseOrder; entity: string; currency?: string | null; onClose: () => void }) {
  const [vendor, setVendor] = useState(po.vendor_code);
  const [orderDate, setOrderDate] = useState(po.order_date);
  const [expectedDate, setExpectedDate] = useState(po.expected_date || "");
  const [deliveryAddress, setDeliveryAddress] = useState(po.delivery_address || "");
  const [paymentTerms, setPaymentTerms] = useState(po.payment_terms || "");
  const [contract, setContract] = useState(po.contract_id ? String(po.contract_id) : "");
  const [update, { isLoading }] = useUpdatePurchaseOrderMutation();
  const canSave = !!vendor && !!orderDate;
  // A contract belongs to one vendor - changing vendor drops a now-invalid link.
  const changeVendor = (v: string) => { setVendor(v); if (v !== po.vendor_code) setContract(""); };

  const save = async () => {
    if (!canSave) return;
    try {
      await update({ id: po.id, entity, vendor, order_date: orderDate, expected_date: expectedDate, delivery_address: deliveryAddress.trim(), payment_terms: paymentTerms.trim(), contract }).unwrap();
      toast.success("Purchase order draft updated.");
      onClose();
    } catch { /* Central API handling presents the server validation message. */ }
  };

  return <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()} title={`Edit ${po.document_number}`} description="Update this draft purchase order" widthClass="sm:max-w-[720px]" footer={<><Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button><Button disabled={!canSave} loading={isLoading} onClick={save}>Save Changes</Button></>}>
    <div className="space-y-5">
      <section className="space-y-3"><p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Order</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Source requisition"><Input value={po.requisition_number || "Not linked"} disabled /></FormField><FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={changeVendor} purchaseEligible /></FormField><FormField label="Order date" required><Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></FormField><FormField label="Expected delivery"><Input type="date" min={orderDate} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></FormField><FormField label="Payment terms"><Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} /></FormField><FormField label="Against contract"><ContractPicker entity={entity} vendor={vendor} value={contract} onChange={setContract} /></FormField><FormField label="Delivery address"><Textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="min-h-20" /></FormField></div></section>
      <section className="rounded-md border border-white-02 bg-gray-50 p-4"><p className="font-mont text-sm font-semibold">Copied Line Items</p><p className="mt-1 font-mont text-xs text-gray-05">These remain the approved requisition snapshot.</p><div className="mt-3 space-y-2">{po.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 font-mont text-xs"><span className="min-w-0 truncate">{line.description}<span className="ml-2 text-gray-05">×{formatQuantity(line.quantity)}</span></span><span className="shrink-0 font-semibold tabular-nums">{formatMoney(line.net_amount + line.tax_amount, currency)}</span></div>)}</div></section>
    </div>
  </DetailDrawer>;
}

function CreatePurchaseOrderDrawer({ open, entity, currency, onClose, onCreated }: { open: boolean; entity: string; currency?: string | null; onClose: () => void; onCreated: (id: number) => void }) {
  const [requisition, setRequisition] = useState("");
  const [vendor, setVendor] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [contract, setContract] = useState("");
  // A contract belongs to one vendor - changing vendor drops a now-invalid link.
  const changeVendor = (v: string) => { setVendor(v); setContract(""); };
  const { data: requisitionData, isLoading: requisitionLoading } = useGetRequisitionQuery({ id: Number(requisition), entity }, { skip: !requisition });
  const [create, { isLoading: creating }] = useCreatePurchaseOrderMutation();
  const source = requisitionData?.data;
  const money = (value: number) => formatMoney(value, currency);
  const canSubmit = !!requisition && !!vendor && !!orderDate;

  const saving = creating;
  const save = async (reviewApproval: boolean) => {
    if (!canSubmit) return;
    try {
      const response = await create({ entity, requisition: Number(requisition), vendor, order_date: orderDate, expected_date: expectedDate || undefined, delivery_address: deliveryAddress.trim() || undefined, payment_terms: paymentTerms.trim() || undefined, contract: contract || undefined }).unwrap();
      toast.success("Purchase order draft created.");
      if (reviewApproval) onCreated(response.data.id); else onClose();
    } catch { /* Central API handling presents the server validation message. */ }
  };

  return <DetailDrawer open={open} onOpenChange={(value) => !saving && !value && onClose()} title="New Purchase Order" description="Create an order from an approved requisition" widthClass="sm:max-w-[720px]" footer={<><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="outline" disabled={!canSubmit} loading={creating} onClick={() => save(false)}>Save Draft</Button><Can permission={P.PROC_SUBMIT_PURCHASE_ORDER}><Button disabled={!canSubmit} loading={saving} onClick={() => save(true)}>Create & Review Approval</Button></Can></>}>
    <div className="space-y-5">
    <section className="space-y-3"><p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Order</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Approved requisition" required><RequisitionPicker entity={entity} value={requisition} onChange={setRequisition} status="APPROVED" placeholder="Select approved requisition" /></FormField><FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={changeVendor} purchaseEligible /></FormField><FormField label="Order date" required><Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></FormField><FormField label="Expected delivery"><Input type="date" min={orderDate} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></FormField><FormField label="Payment terms"><Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} placeholder="Defaults from vendor" /></FormField><FormField label="Against contract"><ContractPicker entity={entity} vendor={vendor} value={contract} onChange={setContract} /></FormField><FormField label="Delivery address"><Textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Where should the vendor deliver?" className="min-h-20" /></FormField></div></section>
    <section className="rounded-md border border-white-02 bg-gray-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mont text-sm font-semibold">Copied Line Items</p>{source && <p className="font-mont text-sm font-semibold tabular-nums">{money(source.estimated_total)}</p>}</div>{!requisition ? <p className="mt-2 font-mont text-xs text-gray-05">Choose an approved requisition to review the lines that will be copied.</p> : requisitionLoading ? <p className="mt-2 font-mont text-xs text-gray-05">Loading requisition lines…</p> : source?.lines.length ? <div className="mt-3 space-y-2">{source.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 font-mont text-xs"><span className="min-w-0 truncate">{line.description}<span className="ml-2 text-gray-05">×{formatQuantity(line.quantity)}</span></span><span className="shrink-0 font-semibold tabular-nums">{money(line.estimated_line_total)}</span></div>)}</div> : <p className="mt-2 font-mont text-xs text-gray-05">This requisition has no available lines.</p>}</section>
    </div>
  </DetailDrawer>;
}
