import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { ClipboardCheck, FilePenLine, FileText, PackageCheck, Plus, Printer, Send } from "lucide-react";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import { PurchaseOrderPicker, VendorPicker } from "./pickers";
import {
  DataTable, DetailDrawer, EmptyState, ErrorState, FormField, InfoHint, LoadingState,
  PostingRecap, StatusPill, toArray, useActiveEntity, type Column,
  PostingDateField,} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../permissions";
import {
  useCreateGoodsReceiptMutation, useGetGoodsReceiptQuery, useGetGoodsReceiptsQuery,
  useGetPurchaseOrderQuery, usePostGoodsReceiptMutation, useUpdateGoodsReceiptMutation,
} from "@/redux/services/procurement/procurement-api";
import type { GoodsReceipt } from "@/redux/services/procurement/procurement-types";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { canReceiveRemaining, completeReceiptSave } from "./goods-receipt-fulfilment";
import { PageShell } from "@/components/layout/page-shell";

const DETAIL_TABS = [
  { value: "overview", label: "Overview", icon: FileText },
  { value: "items", label: "Received Items", icon: PackageCheck },
  { value: "quality", label: "Quality Notes", icon: ClipboardCheck },
] as const;
type DetailTab = typeof DETAIL_TABS[number]["value"];

function shortDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function GoodsReceiptsPage() {
  const { code: entity, currency } = useActiveEntity();
  // Asked before the tables below fetch on mount. A finance grant does not
  // carry procurement.goods_receipt.view with it, and without this the screen
  // opened on 403s and a red toast.
  const canPROC_VIEW_GOODS_RECEIPTS = useCan().can(P.PROC_VIEW_GOODS_RECEIPTS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PROC_CREATE_GOODS_RECEIPT), () => setCreating(true));
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useGetGoodsReceiptsQuery(
    { entity: entity!, page }, { skip: !entity || !canPROC_VIEW_GOODS_RECEIPTS },
  );
  const rows = toArray(data?.data);
  const pg = data?.pagination;

  const columns: Column<GoodsReceipt>[] = [
    { header: "GR Number", cell: (receipt) => <span className="font-mont text-sm font-semibold text-primary">{receipt.document_number}</span> },
    { header: "PO Ref", cell: (receipt) => receipt.purchase_order_number || "-" },
    { header: "Vendor", cell: (receipt) => <span className="font-mont text-sm font-semibold">{receipt.vendor_name || receipt.vendor_code}</span> },
    { header: "Received", cell: (receipt) => shortDate(receipt.received_date) },
    { header: "Items", cell: (receipt) => `${formatQuantity(receipt.received_item_count)} of ${formatQuantity(receipt.ordered_item_count)}` },
    { header: "Status", cell: (receipt) => <div className="flex flex-wrap items-center gap-1.5"><StatusPill status={receipt.status} /><StatusPill status={receipt.receipt_status} /></div> },
  ];

  if (!entity) {
    return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view goods receipts." /></PageShell></ProcurementShell>;
  }
  if (!canPROC_VIEW_GOODS_RECEIPTS) {
    return <ProcurementShell><PageShell><EmptyState title="No goods receipts access" message="This screen needs procurement.goods_receipt.view." /></PageShell></ProcurementShell>;
  }

  return (
    <ProcurementShell>
      <PageShell className="space-y-5 text-black-01">
        <header data-guide="procurement-goods-receipts.heading" className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Goods Receipts</h1>
              <InfoHint ariaLabel="About goods receipts">Record deliveries against open purchase orders, including accepted quantities, rejections, and inspection findings.</InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">Record deliveries against open purchase orders.</p>
          </div>
          <Can permission={P.PROC_CREATE_GOODS_RECEIPT}>
            <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New Goods Receipt</Button>
          </Can>
        </header>

        <section data-guide="procurement-goods-receipts.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
          <DataTable columns={columns} rows={rows} rowKey={(receipt) => receipt.id}
            loading={isLoading || isFetching} error={isError} onRetry={refetch}
            onRowClick={(receipt) => setSelectedId(receipt.id)} page={pg?.currentPage} totalPages={pg?.totalPages}
            onPageChange={setPage} emptyTitle="No goods receipts yet"
            emptyMessage="Record a delivery against an open purchase order."
          />
        </section>
      </PageShell>

      <ReceiptDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency}
        onClose={() => setSelectedId(null)} onSelectReceipt={setSelectedId} />
      {creating && <ReceiptForm entity={entity} currency={currency} onClose={() => setCreating(false)}
        onSaved={(receipt) => { setCreating(false); setSelectedId(receipt.id); }} />}
    </ProcurementShell>
  );
}

function ReceiptDrawer({ id, entity, currency, onClose, onSelectReceipt }: {
  id: number | null; entity: string; currency?: string | null; onClose: () => void;
  onSelectReceipt: (id: number) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [editing, setEditing] = useState(false);
  const [receivingRemaining, setReceivingRemaining] = useState(false);
  // The list ships only summary columns; the drawer fetches its own line-level detail.
  const { data, isLoading: loadingReceipt, isError, refetch } = useGetGoodsReceiptQuery(
    { id: id!, entity }, { skip: id == null },
  );
  const receipt = data?.data;
  const [post, { isLoading: posting }] = usePostGoodsReceiptMutation();
  const total = receipt?.total_value ?? 0;

  const postReceipt = async () => {
    if (!receipt) return;
    try {
      await post({ id: receipt.id, entity }).unwrap();
      toast.success("Goods receipt posted.");
      onClose();
    } catch { /* Central API handling shows the posting error. */ }
  };

  return (
    <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()}
      title={receipt?.document_number || "Goods receipt"}
      description={receipt ? `${receipt.vendor_name || receipt.vendor_code} delivery · Against ${receipt.purchase_order_number || "no PO"}` : "Loading goods receipt"}
      widthClass="sm:max-w-[720px]"
      footer={receipt && <>
        <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
        {receipt.status === "DRAFT" && <Can permission={P.PROC_UPDATE_GOODS_RECEIPT}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
        {canReceiveRemaining(receipt) && <Can permission={P.PROC_CREATE_GOODS_RECEIPT}><Button variant="outline" onClick={() => setReceivingRemaining(true)}><PackageCheck className="size-4" /> Receive Remaining</Button></Can>}
        {receipt.status === "DRAFT" && <Can permission={P.PROC_POST_GOODS_RECEIPT}><Button loading={posting} onClick={postReceipt}><Send className="size-4" /> Post Receipt</Button></Can>}
      </>}
    >
      {loadingReceipt ? <LoadingState rows={7} /> : isError || !receipt ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5"><StatusPill status={receipt.status} /><span className="font-mont text-xs text-gray-05">This delivery</span><StatusPill status={receipt.receipt_status} /></div>
          <p className="font-mont text-sm font-semibold text-gray-05">{formatQuantity(receipt.received_item_count)} of {formatQuantity(receipt.ordered_item_count)} items</p>
        </div>

        {receipt.purchase_order_id && <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white-02 bg-gray-02/30 p-3">
          <div>
            <p className="font-mont text-xs font-semibold text-gray-05">Purchase order fulfilment</p>
            <p className="mt-1 font-mont text-xs text-gray-05">
              {formatQuantity(receipt.purchase_order_received_item_count)} of {formatQuantity(receipt.purchase_order_ordered_item_count)} accepted
              {` · ${formatQuantity(receipt.purchase_order_remaining_item_count)} remaining`}
            </p>
          </div>
          <StatusPill status={receipt.purchase_order_fulfilment_status} />
        </section>}

        <div className="max-w-full overflow-x-auto border-b border-white-02">
          <div className="flex min-w-max gap-5">
            {DETAIL_TABS.map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" onClick={() => setTab(value)}
                className={cn("flex items-center gap-1.5 border-b-2 py-2.5 font-mont text-xs font-medium whitespace-nowrap", tab === value ? "border-primary text-primary" : "border-transparent text-gray-05")}
              ><Icon className="size-3.5" /> {label}</button>
            ))}
          </div>
        </div>

        {tab === "overview" && <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
            <Field label="GR number" value={receipt.document_number} />
            <Field label="PO reference" value={receipt.purchase_order_number || "Not linked"} />
            <Field label="Vendor" value={receipt.vendor_name || receipt.vendor_code} />
            <Field label="Received date" value={shortDate(receipt.received_date)} />
            <Field label="Items" value={`${formatQuantity(receipt.received_item_count)} of ${formatQuantity(receipt.ordered_item_count)}`} />
            <Field label="Received by" value={receipt.received_by_name} />
          </dl>
          {receipt.status === "DRAFT" && <PostingRecap title="Posting preview" currency={currency}
            dr={[{ code: "Expense", name: "Accepted delivery value", amount: total }]}
            cr={[{ code: "GR/IR", name: "Goods received / invoice received", amount: total }]}
            helper="Posting records only accepted quantities; rejected quantities remain in the quality record."
          />}
        </div>}

        {tab === "items" && (receipt.lines.length ? <div className="overflow-x-auto rounded-md border border-white-02">
          <div className="grid min-w-[580px] grid-cols-[minmax(220px,1fr)_90px_90px_140px] font-mont text-xs">
            <div className="contents bg-[#F1F1F1] font-semibold text-gray-01">
              <span className="bg-[#F1F1F1] px-3 py-2 text-[11px]">Item</span>
              <span className="bg-[#F1F1F1] px-3 py-2 text-right text-[11px]">Accepted</span>
              <span className="bg-[#F1F1F1] px-3 py-2 text-right text-[11px]">Rejected</span>
              <span className="bg-[#F1F1F1] px-3 py-2 text-right text-[11px]">Value</span>
            </div>
            {receipt.lines.map((line) => <div key={line.id} className="contents">
              <span className="min-w-0 truncate border-t border-white-02 px-3 py-3 font-semibold">{line.description}</span>
              <span className="border-t border-white-02 px-3 py-3 text-right tabular-nums">{formatQuantity(line.accepted_qty)}</span>
              <span className="border-t border-white-02 px-3 py-3 text-right tabular-nums">{formatQuantity(line.rejected_qty)}</span>
              <span className="border-t border-white-02 px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(line.value_amount, currency)}</span>
            </div>)}
          </div>
        </div> : <EmptyPanel text="No received items were recorded." />)}

        {tab === "quality" && <section className="rounded-md border border-white-02 p-4">
          <p className="font-mont text-xs font-semibold text-gray-05">Inspection notes</p>
          <p className="mt-2 whitespace-pre-wrap font-mont text-sm leading-6 text-black-01">{receipt.narration || "No inspection notes were recorded."}</p>
        </section>}
      </div>}
      {receipt && editing && <ReceiptForm entity={entity} currency={currency} initial={receipt} onClose={() => setEditing(false)} />}
      {receipt && receivingRemaining && <ReceiptForm entity={entity} currency={currency}
        sourcePurchaseOrderId={receipt.purchase_order_id || undefined} sourceVendorCode={receipt.vendor_code}
        onClose={() => setReceivingRemaining(false)}
        onSaved={(saved) => { setReceivingRemaining(false); onSelectReceipt(saved.id); }} />}
    </DetailDrawer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-mont text-xs text-gray-05">{label}</dt><dd className="mt-1 font-mont text-sm font-semibold text-black-01">{value}</dd></div>;
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{text}</div>;
}

type ReceiptLine = {
  po_line: number; description: string; expense_account: string; ordered: number;
  remaining: number; accepted_qty: number; rejected_qty: number; unit_price: number;
};

function ReceiptForm({ entity, currency, onClose, onSaved, initial, sourcePurchaseOrderId, sourceVendorCode }: {
  entity: string; currency?: string | null; onClose: () => void; initial?: GoodsReceipt;
  onSaved?: (receipt: GoodsReceipt) => void;
  sourcePurchaseOrderId?: number; sourceVendorCode?: string;
}) {
  const [purchaseOrder, setPurchaseOrder] = useState(initial?.purchase_order_id ? String(initial.purchase_order_id) : sourcePurchaseOrderId ? String(sourcePurchaseOrderId) : "");
  const [vendor, setVendor] = useState(initial?.vendor_code ?? sourceVendorCode ?? "");
  const [receivedDate, setReceivedDate] = useState(initial?.received_date ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [inspectionNotes, setInspectionNotes] = useState(initial?.narration ?? "");
  const [enteredLines, setEnteredLines] = useState<ReceiptLine[]>([]);
  const { data: poData, isLoading: poLoading } = useGetPurchaseOrderQuery(
    { id: Number(purchaseOrder), entity }, { skip: !purchaseOrder },
  );
  const [create, { isLoading: creating }] = useCreateGoodsReceiptMutation();
  const [update, { isLoading: updating }] = useUpdateGoodsReceiptMutation();
  const [post, { isLoading: posting }] = usePostGoodsReceiptMutation();
  const po = poData?.data;

  const sourceLines = useMemo<ReceiptLine[]>(() => (po?.lines ?? []).map((line) => {
    // Remaining quantity is ordered less quantities already posted against the PO line.
    const remaining = Math.max(0, Number(line.quantity) - Number(line.received_qty));
    const existing = initial?.lines.find((candidate) => candidate.po_line_id === line.id);
    return {
      po_line: line.id, description: line.description, expense_account: line.expense_code,
      ordered: Number(line.quantity), remaining,
      accepted_qty: Number(existing?.accepted_qty ?? 0), rejected_qty: Number(existing?.rejected_qty ?? 0),
      unit_price: line.unit_price,
    };
  }), [po?.lines, initial?.lines]);
  const lines = enteredLines.length ? enteredLines : sourceLines;

  // Adopt the PO's vendor once it loads / changes (render-phase, not an effect).
  const [vendorFrom, setVendorFrom] = useState<string | null>(null);
  if (po?.vendor_code && vendorFrom !== po.vendor_code) {
    setVendorFrom(po.vendor_code);
    setVendor(po.vendor_code);
  }

  const updateLine = (index: number, patch: Partial<ReceiptLine>) => {
    setEnteredLines(lines.map((line, current) => current === index ? { ...line, ...patch } : line));
  };
  const updateQuantity = (index: number, field: "accepted_qty" | "rejected_qty", rawValue: string) => {
    const line = lines[index];
    if (!line) return;
    const other = field === "accepted_qty" ? line.rejected_qty : line.accepted_qty;
    // Clamp typed values and stepper clicks to the whole-unit allowance left by the other quantity.
    const maximum = Math.max(0, Math.floor(line.remaining - other));
    const next = Math.min(maximum, Math.max(0, Math.trunc(Number(rawValue) || 0)));
    updateLine(index, { [field]: next });
  };
  const acceptedValue = lines.reduce((sum, line) => sum + Math.round(line.accepted_qty * line.unit_price), 0);
  const hasQuantity = lines.some((line) => line.accepted_qty > 0 || line.rejected_qty > 0);
  const quantitiesValid = lines.every((line) => Number.isInteger(line.accepted_qty) && Number.isInteger(line.rejected_qty) && line.accepted_qty >= 0 && line.rejected_qty >= 0 && line.accepted_qty + line.rejected_qty <= line.remaining);
  const canSave = !!purchaseOrder && !!vendor && !!receivedDate && hasQuantity && quantitiesValid;
  const saving = creating || updating || posting;

  const save = async (postAfter: boolean) => {
    if (!canSave) return;
    try {
      const payload = {
        received_date: receivedDate, reference: reference.trim() || undefined,
        narration: inspectionNotes.trim() || undefined,
        lines: lines.filter((line) => line.accepted_qty || line.rejected_qty).map((line) => ({
          po_line: line.po_line, description: line.description, expense_account: line.expense_account,
          accepted_qty: line.accepted_qty, rejected_qty: line.rejected_qty, unit_price: line.unit_price,
        })),
      };
      const saved = await completeReceiptSave(
        () => initial
          ? update({ id: initial.id, entity, ...payload }).unwrap()
          : create({ entity, vendor, purchase_order: Number(purchaseOrder), ...payload }).unwrap(),
        postAfter ? (id) => post({ id, entity }).unwrap() : undefined,
      );
      toast.success(postAfter ? "Goods receipt saved and posted." : initial ? "Goods receipt draft updated." : "Goods receipt draft saved.");
      onClose();
      onSaved?.(saved);
    } catch { /* Central API handling shows validation or posting failures. */ }
  };

  return (
    <DetailDrawer open onOpenChange={(open) => !saving && !open && onClose()}
      title={initial ? "Edit Goods Receipt" : "New Goods Receipt"} description="Record a delivery against a purchase order"
      widthClass="sm:max-w-[820px]" footer={<>
        <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button variant="outline" disabled={!canSave} loading={creating || updating} onClick={() => save(false)}>{initial ? "Save Changes" : "Save Draft"}</Button>
        <Can permission={P.PROC_POST_GOODS_RECEIPT}><Button disabled={!canSave} loading={saving} onClick={() => save(true)}>{initial ? "Save & Post" : "Create & Post"}</Button></Can>
      </>}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Receipt</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Against PO" required><PurchaseOrderPicker entity={entity} value={purchaseOrder} onChange={(value) => { setPurchaseOrder(value); setEnteredLines([]); }} /></FormField>
            <FormField label="Vendor" required><VendorPicker entity={entity} value={vendor} onChange={setVendor} disabled={!!purchaseOrder} /></FormField>
            <PostingDateField label="Received date" entity={entity} value={receivedDate} onChange={setReceivedDate} />
            <FormField label="Reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Delivery note or waybill" /></FormField>
          </div>
        </section>

        <section className="space-y-3">
          <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Received Items</p>
          {!purchaseOrder ? <EmptyPanel text="Choose a purchase order to load its real line items." />
            : poLoading ? <p className="font-mont text-xs text-gray-05">Loading purchase-order lines…</p>
            : lines.length ? <div className="space-y-2">{lines.map((line, index) => <div key={line.po_line} className="rounded-md border border-white-02 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-mont text-sm font-semibold">{line.description}</p><p className="mt-1 font-mont text-xs text-gray-05">Ordered {formatQuantity(line.ordered)} · Remaining {formatQuantity(line.remaining)} · {formatMoney(line.unit_price, currency)} each</p></div>
                <p className="font-mont text-sm font-semibold tabular-nums">{formatMoney(Math.round(line.accepted_qty * line.unit_price), currency)}</p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FormField label="Accepted qty"><Input type="number" inputMode="numeric" min={0} max={Math.max(0, Math.floor(line.remaining - line.rejected_qty))} step={1} value={line.accepted_qty} onChange={(event) => updateQuantity(index, "accepted_qty", event.target.value)} /></FormField>
                <FormField label="Rejected qty"><Input type="number" inputMode="numeric" min={0} max={Math.max(0, Math.floor(line.remaining - line.accepted_qty))} step={1} value={line.rejected_qty} onChange={(event) => updateQuantity(index, "rejected_qty", event.target.value)} /></FormField>
              </div>
              <p className="mt-2 font-mont text-[11px] text-gray-05">Accepted + rejected cannot exceed {formatQuantity(line.remaining)} remaining.</p>
            </div>)}</div> : <EmptyPanel text="This purchase order has no receivable quantity remaining." />}
        </section>

        <section className="space-y-3">
          <p className="font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">Quality</p>
          <FormField label="Inspection notes"><Textarea value={inspectionNotes} onChange={(event) => setInspectionNotes(event.target.value)} placeholder="Record inspection findings, damage, rejection reasons, or quality observations" className="min-h-28" /></FormField>
        </section>

        <PostingRecap title="Live posting preview" currency={currency}
          dr={[{ code: "Expense", name: "Accepted delivery value", amount: acceptedValue }]}
          cr={[{ code: "GR/IR", name: "Goods received / invoice received", amount: acceptedValue }]}
          helper="This becomes the journal only when the receipt is posted. Rejected quantities never enter the GL."
        />
      </div>
    </DetailDrawer>
  );
}
