import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import {
  Ban, CheckCircle2, ChevronRight, Clock3, FilePenLine, FileText, Info, Mail, PackageCheck,
  Plus, Printer, ReceiptText, Search, Send, ShoppingCart,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import { RequisitionPicker, VendorPicker, ContractPicker } from "./pickers";
import { useUserDirectory } from "../../components/workflow/use-user-directory";
import {
  Can, ConfirmActionModal, DataTable, DetailDrawer, EmptyState, ErrorState,
  FormField, InfoHint, LoadingState, StatCard, StatusPill, TabStrip, toArray, useActiveEntity,
  useCan, type Column, type TabStripItem,
} from "@/components/finance-ui";
import { noAccessMessage } from "@/components/finance-ui/no-access";
import { Button } from "@/components/ui/button";
import { QuickExportButton } from "../../host";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Textarea } from "@/components/ui/textarea";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../permissions";
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
import { useSourceDocumentParam } from "@/lib/source-document-route";
import { PageShell } from "@/components/layout/page-shell";
import { NoEntityState } from "@/components/finance-ui/no-entity-state";
import { useDates } from "../../lib/display-prefs";
import { ReasonField } from "@/components/finance-ui/reason-field";
import { useCancelPurchaseOrderMutation } from "@/redux/services/procurement/payables-corrections-api";
import { SOURCE_DOCUMENT_ID_PARAM } from "@/lib/source-document-route";
import { PURCHASE_ORDER_TABS, purchaseOrderPill } from "./document-status";
import { purchaseOrderChanges, purchaseOrderForm } from "./purchase-order-edit";
import { WITH_APPROVERS_NOTE, exportStatus, statusFilterArgs } from "@/components/finance-ui/returned-correction";
import { ResumeButton, ReturnedNote, useReturnedStanding } from "@/components/finance-ui/returned-note";

const STATUS_TABS = PURCHASE_ORDER_TABS;

const DETAIL_TABS = [
  { value: "overview", label: "Overview", icon: Info },
  { value: "lines", label: "Line Items", icon: FileText },
  { value: "receipts", label: "Goods Receipts", icon: PackageCheck },
  { value: "invoices", label: "Invoices", icon: ReceiptText },
  { value: "approval", label: "Approval Trail", icon: CheckCircle2 },
  { value: "email", label: "Vendor Email", icon: Mail },
] as const;

type DetailTab = typeof DETAIL_TABS[number]["value"];

/** Strip items for the two switchers, built once so the sliding bar re-measures only when the active tab changes. */
const STATUS_TAB_ITEMS: TabStripItem<string>[] = STATUS_TABS.map((tab) => ({ value: tab.value, label: tab.label }));
const DETAIL_TAB_ITEMS: TabStripItem<DetailTab>[] = DETAIL_TABS.map(({ value, label, icon: Icon }) => ({
  value,
  label: <><Icon className="size-3.5" />{label}</>,
}));

function percent(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return `${Number.isFinite(number) ? Math.round(number) : 0}%`;
}

export default function PurchaseOrdersPage() {
  const dates = useDates();
  const { code: entity, currency } = useActiveEntity();
  // Asked before the tables below fetch on mount. A finance grant does not
  // carry procurement.purchase_order.view with it, and without this the screen
  // opened on a pair of 403s and a red toast.
  const canPROC_VIEW_PURCHASE_ORDERS = useCan().can(P.PROC_VIEW_PURCHASE_ORDERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // A link from an approval names the record to open; it opens here.
  useSourceDocumentParam(setSelectedId);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PROC_CREATE_PURCHASE_ORDER), () => setCreating(true));
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
    entity: entity!, page, ...statusFilterArgs(status),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [entity, page, status, debouncedSearch]);
  const { currentData: data, isLoading, isFetching, isError, refetch } = useGetPurchaseOrdersQuery(
    params, { skip: !entity || !canPROC_VIEW_PURCHASE_ORDERS },
  );
  const { data: summaryData, isLoading: summaryLoading } = useGetPurchaseOrderSummaryQuery(
    { entity: entity! }, { skip: !entity || !canPROC_VIEW_PURCHASE_ORDERS },
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
    { header: "Issue date", cell: (po) => dates.day(po.order_date) },
    { header: "Delivery", cell: (po) => dates.day(po.expected_date) },
    { header: "Total", align: "right", cell: (po) => <span className="tabular-nums">{money(po.total)}</span> },
    { header: "Received", cell: (po) => <span className="tabular-nums">{percent(po.received_pct)}</span> },
    { header: "Status", cell: (po) => <StatusPill {...purchaseOrderPill(po)} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-05" /> },
  ];

  if (!entity) return <ProcurementShell><PageShell><NoEntityState message="Choose an entity to view its purchase orders." /></PageShell></ProcurementShell>;
  if (!canPROC_VIEW_PURCHASE_ORDERS) return <ProcurementShell><PageShell><EmptyState title="No purchase orders access" message={noAccessMessage("view purchase orders")} /></PageShell></ProcurementShell>;

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
              params={{ status: exportStatus(status), search: debouncedSearch }}
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
            <TabStrip
              items={STATUS_TAB_ITEMS}
              value={status}
              onChange={(next) => { setStatus(next); setPage(1); }}
              variant="underline"
              ariaLabel="Purchase order status"
              className="gap-5 self-center border-b-0"
              buttonClassName="py-3"
            />
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

export function PurchaseOrderDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const dates = useDates();
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
  const standing = useReturnedStanding(po, workflow);
  const cancellable = !!po && !["CANCELLED", "REVERSED"].includes(po.status) && !approvalPending;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOrder, { isLoading: cancelling }] = useCancelPurchaseOrderMutation();
  const doCancel = async () => {
    if (!po || !cancelReason.trim()) return;
    try {
      const r = await cancelOrder({ id: po.id, entity, reason: cancelReason.trim() }).unwrap();
      toast.success(r.message || "Purchase order cancelled.");
      setCancelOpen(false);
      setCancelReason("");
    } catch { /* The server names the correction: return the goods, void the bill or credit it. */ }
  };

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

  return <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} widthClass="sm:max-w-[720px]" title={po?.document_number || "Purchase order"} description={po ? `${po.vendor_name || po.vendor_code} · ${dates.day(po.order_date)}` : "Loading purchase order"} footer={po && <>
    <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
    {po.can_email_vendor && <Can permission={P.PROC_EMAIL_PURCHASE_ORDER_VENDOR}><Button variant="outline" onClick={() => openEmail()}><Mail className="size-4" /> Email Vendor</Button></Can>}
    {(draftEditable || standing === "sender") && <Can permission={P.PROC_UPDATE_PURCHASE_ORDER}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
    {standing === "sender" && <ResumeButton workflowId={workflowId} />}
    {draftEditable && <Can permission={P.PROC_SUBMIT_PURCHASE_ORDER}><Button loading={submitting} onClick={() => setConfirmApproval(true)}><Send className="size-4" /> Submit for Approval</Button></Can>}
    {cancellable && <Can permission={P.PROC_UPDATE_PURCHASE_ORDER}><Button variant="outline-dest" onClick={() => setCancelOpen(true)}><Ban className="size-4" /> Cancel order</Button></Can>}
  </>}>
    {isLoading ? <LoadingState rows={7} /> : isError || !po ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><StatusPill {...purchaseOrderPill(po)} /><p className="font-mont text-lg font-semibold tabular-nums text-black-01">{money(po.total)}</p></div>
      <TabStrip
        items={DETAIL_TAB_ITEMS}
        value={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel="Purchase order sections"
        className="w-full gap-5"
        buttonClassName="flex items-center gap-1.5 px-0"
      />

      {tab === "overview" && <div className="space-y-5">
        <ReturnedNote standing={standing} request={workflow} />
        {approvalPending && !po.approval_returned && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mont text-xs leading-5 text-amber-900">{WITH_APPROVERS_NOTE}</p>}
        <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2"><Field label="Vendor" value={po.vendor_name || po.vendor_code} /><Field label="Order date" value={dates.day(po.order_date)} /><Field label="Expected delivery" value={dates.day(po.expected_date)} /><Field label="Payment terms" value={po.payment_terms || "Not specified"} /><Field label="Delivery address" value={po.delivery_address || "Not specified"} /><Field label="Invoice progress" value={percent(po.invoiced_pct)} /></dl>
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
      {tab === "receipts" && (po.receipt_documents.length ? <div className="overflow-hidden rounded-md border border-white-02"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01"><span>Receipt</span><span>Date</span><span>Status</span></div>{po.receipt_documents.map((receipt) => <button type="button" key={receipt.id} onClick={() => openRoute(`${routesPath.PROTECTED.PROCUREMENT.GOODS_RECEIPTS}?${SOURCE_DOCUMENT_ID_PARAM}=${receipt.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-white-02 px-3 py-3 text-left font-mont text-xs hover:bg-gray-50"><span className="font-semibold text-primary">{receipt.document_number}<span className="ml-2 font-normal text-gray-05">{receipt.item_count} item{receipt.item_count === 1 ? "" : "s"}</span></span><span>{dates.day(receipt.received_date)}</span><StatusPill status={receipt.status} /></button>)}</div> : <EmptyBlock text="No goods receipts have been posted against this purchase order." />)}
      {tab === "invoices" && (po.invoice_documents.length ? <div className="overflow-hidden rounded-md border border-white-02"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01"><span>Invoice</span><span>Amount</span><span>Status</span></div>{po.invoice_documents.map((invoice) => <button type="button" key={invoice.id} onClick={() => openRoute(`${routesPath.PROTECTED.PROCUREMENT.VENDOR_INVOICES}?${SOURCE_DOCUMENT_ID_PARAM}=${invoice.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-white-02 px-3 py-3 text-left font-mont text-xs hover:bg-gray-50"><span className="font-semibold text-primary">{invoice.document_number}<span className="ml-2 font-normal text-gray-05">{dates.day(invoice.invoice_date)}</span></span><span className="font-semibold tabular-nums">{money(invoice.total)}</span><StatusPill status={invoice.status} /></button>)}</div> : <EmptyBlock text="No vendor invoices are linked to this purchase order." />)}
      {tab === "approval" && (workflow?.stage_instances.length ? <div className="space-y-3">{workflow.stage_instances.map((stage) => <section key={stage.id} className="rounded-md border border-white-02 p-3"><div className="flex items-center justify-between gap-3"><p className="font-mont text-sm font-semibold">{stage.stage_label}</p><StatusPill status={stage.status} /></div>{stage.actions.length ? <div className="mt-3 space-y-2">{stage.actions.filter((action) => !action.is_reversal_of).map((action) => <div key={action.id} className="border-t border-white-02 pt-2 font-mont text-xs"><p><span className="font-semibold">{name(action.actor)}</span> · {action.action.toLowerCase()}</p><p className="mt-0.5 text-gray-05">{action.comment || "No comment"}</p></div>)}</div> : <p className="mt-2 font-mont text-xs text-gray-05">No decision recorded for this stage.</p>}</section>)}</div> : <EmptyBlock text={po.status === "DRAFT" ? "Submit this draft to begin its approval trail." : "No approval trail is available."} />)}
      {tab === "email" && (po.email_deliveries?.length ? <div className="space-y-3">{po.email_deliveries.map((delivery) => <section key={delivery.id} className="rounded-md border border-white-02 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mont text-sm font-semibold">{delivery.source === "AUTOMATIC" ? "Automatic after approval" : delivery.source === "RETRY" ? "Retry" : "Manual send"}</p><p className="mt-1 font-mont text-[11px] text-gray-05">Requested by {delivery.requested_by_name} · {dates.dateTime(delivery.created_at)}</p></div><StatusPill status={delivery.status} /></div><div className="mt-3 grid grid-cols-2 gap-2 rounded bg-gray-50 p-2 font-mont text-xs"><span className="text-gray-05">Recipients</span><span className="text-right font-semibold">{delivery.recipient_count}</span><span className="text-gray-05">BCC recipients</span><span className="text-right font-semibold">{delivery.bcc_count}</span></div>{delivery.buyer_message && <p className="mt-3 whitespace-pre-wrap font-mont text-xs leading-5 text-gray-05">{delivery.buyer_message}</p>}{delivery.failure_reason && <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 font-mont text-xs text-red-700">{delivery.failure_reason}</div>}{delivery.status === "FAILED" && canVendorEmail && <div className="mt-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => openEmail(delivery)}>Retry Email</Button></div>}</section>)}</div> : <EmptyBlock text={po.can_email_vendor ? "This approved purchase order has not been emailed yet." : "Email Vendor becomes available after the purchase order is fully approved."} />)}
    </div>}
    {po && editing && <EditPurchaseOrderDrawer po={po} entity={entity} currency={currency} returned={standing === "sender"} onClose={() => setEditing(false)} />}
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
    {po && <ConfirmActionModal open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${po.document_number}?`} description="Withdraws a commitment nobody will fulfil. The vendor is not emailed: tell them yourself if the order already reached them." confirmText="Cancel order" destructive loading={cancelling} confirmDisabled={!cancelReason.trim()} onConfirm={doCancel}>
      <div className="space-y-3">
        {(po.receipt_documents.length > 0 || po.invoice_documents.length > 0) && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 font-mont text-xs leading-5 text-amber-900">An order with goods received or a bill against it is corrected first: return the goods on their receipt, then void the bill while nothing is paid on it, or credit it in full with a credit note.</div>}
        <ReasonField value={cancelReason} onChange={setCancelReason} label="Why the order is cancelled" placeholder="e.g. Supplier cannot deliver before term starts" />
      </div>
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
  return <button type="button" disabled={disabled} onClick={onClick} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-white-02 px-3 py-2 text-left enabled:hover:bg-gray-50 disabled:cursor-default disabled:opacity-60"><span className="min-w-0"><span className="block font-mont text-[11px] text-gray-05">{label}</span><span className="mt-1 block truncate font-mont text-sm font-semibold text-black-01">{value}</span></span>{!disabled && <ChevronRight className="size-4 shrink-0 text-gray-05" />}</button>;
}

/**
 * Edit a draft order's terms, or correct those of one an approver sent back
 * (`returned`). Lines stay the approved requisition's snapshot either way, and
 * only the changed terms are sent (see purchase-order-edit.ts).
 */
function EditPurchaseOrderDrawer({ po, entity, currency, returned = false, onClose }: { po: PurchaseOrder; entity: string; currency?: string | null; returned?: boolean; onClose: () => void }) {
  const saved = purchaseOrderForm(po);
  const [vendor, setVendor] = useState(saved.vendor);
  const [orderDate, setOrderDate] = useState(saved.orderDate);
  const [expectedDate, setExpectedDate] = useState(saved.expectedDate);
  const [deliveryAddress, setDeliveryAddress] = useState(saved.deliveryAddress);
  const [paymentTerms, setPaymentTerms] = useState(saved.paymentTerms);
  const [contract, setContract] = useState(saved.contract);
  const [update, { isLoading }] = useUpdatePurchaseOrderMutation();
  const canSave = !!vendor && !!orderDate;
  // A contract belongs to one vendor - changing vendor drops a now-invalid link.
  const changeVendor = (v: string) => { setVendor(v); if (v !== po.vendor_code) setContract(""); };

  const save = async () => {
    if (!canSave) return;
    try {
      const changes = purchaseOrderChanges(po, { vendor, orderDate, expectedDate, deliveryAddress, paymentTerms, contract });
      // Nothing changed: nothing to send.
      if (!Object.keys(changes).length) { onClose(); return; }
      await update({ id: po.id, entity, ...changes }).unwrap();
      toast.success(returned ? "Changes saved. Resume it to send it back to the approver." : "Purchase order draft updated.");
      onClose();
    } catch { /* Central API handling presents the server validation message. */ }
  };

  return <DetailDrawer open onOpenChange={(open) => !isLoading && !open && onClose()} title={`${returned ? "Correct" : "Edit"} ${po.document_number}`} description={returned ? "Your changes reach the approver when you resume the request." : "Update this draft purchase order"} widthClass="sm:max-w-[720px]" footer={<><Button variant="outline" disabled={isLoading} onClick={onClose}>Cancel</Button><Button disabled={!canSave} loading={isLoading} onClick={save}>Save Changes</Button></>}>
    <div className="space-y-5">
      <section className="space-y-3"><p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Order</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Source requisition"><Input value={po.requisition_number || "Not linked"} disabled /></FormField><FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={changeVendor} purchaseEligible /></FormField><FormField label="Order date" required><DatePickerInput value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></FormField><FormField label="Expected delivery"><DatePickerInput min={orderDate} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></FormField><FormField label="Payment terms"><Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} /></FormField><FormField label="Against contract"><ContractPicker entity={entity} vendor={vendor} value={contract} onChange={setContract} /></FormField><FormField label="Delivery address"><Textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="min-h-20" /></FormField></div></section>
      <section className="rounded-md border border-white-02 bg-gray-50 p-4"><p className="font-mont text-sm font-semibold">Copied Line Items</p><p className="mt-1 font-mont text-xs text-gray-05">These remain the approved requisition snapshot.</p><div className="mt-3 space-y-2">{po.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 font-mont text-xs"><span className="min-w-0 truncate">{line.description}<span className="ml-2 text-gray-05">×{formatQuantity(line.quantity)}</span></span><span className="shrink-0 font-semibold tabular-nums">{formatMoney(line.net_amount + line.tax_amount, currency)}</span></div>)}</div></section>
    </div>
  </DetailDrawer>;
}

function CreatePurchaseOrderDrawer({ open, entity, currency, onClose, onCreated }: { open: boolean; entity: string; currency?: string | null; onClose: () => void; onCreated: (id: number) => void }) {
  const dates = useDates();
  const [requisition, setRequisition] = useState("");
  const [vendor, setVendor] = useState("");
  const [orderDate, setOrderDate] = useState(() => dates.today());
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
    <section className="space-y-3"><p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Order</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Approved requisition" required><RequisitionPicker entity={entity} value={requisition} onChange={setRequisition} status="APPROVED" sourcing="order" placeholder="Select approved requisition" /></FormField><FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={changeVendor} purchaseEligible /></FormField><FormField label="Order date" required><DatePickerInput value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></FormField><FormField label="Expected delivery"><DatePickerInput min={orderDate} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></FormField><FormField label="Payment terms"><Input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} placeholder="Defaults from vendor" /></FormField><FormField label="Against contract"><ContractPicker entity={entity} vendor={vendor} value={contract} onChange={setContract} /></FormField><FormField label="Delivery address"><Textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Where should the vendor deliver?" className="min-h-20" /></FormField></div></section>
    <section className="rounded-md border border-white-02 bg-gray-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mont text-sm font-semibold">Copied Line Items</p>{source && <p className="font-mont text-sm font-semibold tabular-nums">{money(source.estimated_total)}</p>}</div>{!requisition ? <p className="mt-2 font-mont text-xs text-gray-05">Choose an approved requisition to review the lines that will be copied.</p> : requisitionLoading ? <p className="mt-2 font-mont text-xs text-gray-05">Loading requisition lines…</p> : source?.lines.length ? <div className="mt-3 space-y-2">{source.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 font-mont text-xs"><span className="min-w-0 truncate">{line.description}<span className="ml-2 text-gray-05">×{formatQuantity(line.quantity)}</span></span><span className="shrink-0 font-semibold tabular-nums">{money(line.estimated_line_total)}</span></div>)}</div> : <p className="mt-2 font-mont text-xs text-gray-05">This requisition has no available lines.</p>}</section>
    </div>
  </DetailDrawer>;
}
