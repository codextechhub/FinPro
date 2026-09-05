// Sourcing → Quotations. Capture a vendor's bid against an issued RFQ, submit it,
// and award the winner (which raises a draft PO). No GL effect until receipt.
import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import {
  ChevronRight, FilePenLine, FileText, GitCompareArrows, History, Layers,
  Lock, Paperclip, Plus, Search,
} from "lucide-react";
import { toast } from "sonner";

import { ProcurementShell } from "../procurement-shell";
import { RfqPicker, VendorPicker } from "../pickers";
import { SearchSelect } from "@/components/custom/search-select";
import {
  DataTable, DetailDrawer, EmptyState, ErrorState, FormDrawer, FormField, MoneyInput,
  LoadingState, StatusPill, ActionButton, TabStrip, TaxCodePicker, toArray,
  useActiveEntity, type Column, type TabStripItem,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../../permissions";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useGetQuotationsQuery, useGetQuotationQuery, useGetRfqsQuery, useGetRfqQuery,
  useCreateQuotationMutation, useUpdateQuotationMutation,
  useSubmitQuotationMutation, useAwardQuotationMutation,
} from "@/redux/services/procurement/procurement-ext-api";
import { useGetVendorsQuery } from "@/redux/services/procurement/procurement-api";
import type { Quotation, QuotationDetail } from "@/redux/services/procurement/procurement-types";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { ActivityFeed, CompareModal, EmptyPanel, Field, ExpiredPill } from "./shared";
import { QUOTATION_TABS, isForbidden, shortDate } from "./helpers";
import { useFetchAuthMediaQuery } from "@/redux/services/media-api";
import { PageShell } from "@/components/layout/page-shell";

const DETAIL_TABS = [
  ["overview", "Overview", FileText], ["comparison", "Line comparison", Layers],
  ["evidence", "Evidence", Paperclip],
  ["activity", "Activity", History],
] as const;

/** Strip items for the two switchers, built once so the sliding bar re-measures only when the active tab changes. */
const STATUS_TAB_ITEMS: TabStripItem<string>[] = QUOTATION_TABS.map(([label, value]) => ({ value, label }));
const DETAIL_TAB_ITEMS: TabStripItem<string>[] = DETAIL_TABS.map(([value, label, Icon]) => ({
  value,
  label: <><Icon className="size-3.5" />{label}</>,
}));

export default function QuotationsPage() {
  const { code: entity, currency } = useActiveEntity();
  const [status, setStatus] = useState("");
  const [rfqFilter, setRfqFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [comparing, setComparing] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.PROC_CREATE_QUOTATION), () => setCreating(true));
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(
    () => ({ entity: entity!, page, ...(status ? { status } : {}), ...(rfqFilter ? { rfq: rfqFilter } : {}), ...(vendorFilter ? { vendor: vendorFilter } : {}), ...(debounced ? { q: debounced } : {}) }),
    [entity, page, status, rfqFilter, vendorFilter, debounced],
  );
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetQuotationsQuery(params, { skip: !entity });
  const { data: rfqOptData } = useGetRfqsQuery({ entity: entity! }, { skip: !entity });
  const { data: vendorOptData } = useGetVendorsQuery({ entity: entity!, page_size: 100 }, { skip: !entity });
  const rows = toArray(data?.data);

  const rfqOptions = [{ value: "", label: "All RFQs" }, ...toArray(rfqOptData?.data).map((r) => ({ value: String(r.id), label: `${r.document_number} - ${r.title || "Untitled"}` }))];
  const vendorOptions = [{ value: "", label: "All vendors" }, ...toArray(vendorOptData?.data).map((v) => ({ value: v.code, label: `${v.code} - ${v.name}` }))];

  const columns: Column<Quotation>[] = [
    { header: "Quote #", cell: (q) => <span className="font-mont text-sm font-semibold text-primary">{q.document_number}</span> },
    { header: "Vendor", cell: (q) => <div className="min-w-32"><p className="font-semibold">{q.vendor_name || q.vendor_code}</p><p className="mt-0.5 text-xs text-gray-05">{q.vendor_code}</p></div> },
    { header: "RFQ Ref", cell: (q) => q.rfq_number || "-" },
    { header: "Submitted", cell: (q) => shortDate(q.quote_date) },
    { header: "Lead time", align: "right", cell: (q) => q.lead_time_days == null ? "-" : `${q.lead_time_days}d` },
    { header: "Total", align: "right", cell: (q) => <span className="tabular-nums">{formatMoney(q.total, currency)}</span> },
    { header: "Status", cell: (q) => <div className="flex flex-wrap items-center gap-1.5"><StatusPill status={q.quotation_status} />{q.is_expired && <ExpiredPill />}</div> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  if (!entity) return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view its quotations." /></PageShell></ProcurementShell>;

  return <ProcurementShell>
    <PageShell className="space-y-5 text-black-01">
      <header data-guide="procurement-quotations.heading" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mont text-lg font-semibold text-gray-01">Quotations</h1>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Vendor bids against your RFQs. Compare them, then award the winner.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setComparing(true)}><GitCompareArrows className="size-4" /> Compare</Button>
          <Can permission={P.PROC_CREATE_QUOTATION}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> New Quotation</Button></Can>
        </div>
      </header>

      <section data-guide="procurement-quotations.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
          <TabStrip
            items={STATUS_TAB_ITEMS}
            value={status}
            onChange={(next) => { setStatus(next); setPage(1); }}
            variant="underline"
            ariaLabel="Quotation status"
            className="gap-5 self-center border-b-0"
            buttonClassName="px-0 py-3"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-white-02 px-4 py-2.5">
          <div className="min-w-44 flex-1 sm:max-w-56"><SearchSelect options={rfqOptions} value={rfqFilter} onChange={(e) => { setRfqFilter(e.target.value); setPage(1); }} placeholder="All RFQs" revealOnSearch /></div>
          <div className="min-w-44 flex-1 sm:max-w-56"><SearchSelect options={vendorOptions} value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }} placeholder="All vendors" revealOnSearch /></div>
          <label className="relative min-w-0 flex-1 sm:max-w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search quote #, vendor or reference" className="h-9 bg-white pl-9" /></label>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(q) => q.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(q) => setSelectedId(q.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No quotations" emptyMessage={debounced ? "Try a different search term or filter." : "Capture a vendor's bid against an issued RFQ."} />
      </section>
    </PageShell>
    <QuotationDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <QuotationForm entity={entity} currency={currency} onClose={() => setCreating(false)} />}
    <CompareModal entity={entity} currency={currency} open={comparing} onClose={() => setComparing(false)} />
  </ProcurementShell>;
}

function QuotationDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [competitionExceptionReason, setCompetitionExceptionReason] = useState("");
  const { hasPermission } = usePermissions();
  const canOverrideCompetition = hasPermission(P.PROC_OVERRIDE_COMPETITION);
  const { data, isLoading, isError, refetch } = useGetQuotationQuery({ id: id!, entity }, { skip: id == null });
  const q = data?.data;
  const [submit] = useSubmitQuotationMutation();
  const [award] = useAwardQuotationMutation();

  const isDraft = q?.quotation_status === "DRAFT";
  const canAward = q?.quotation_status === "SUBMITTED" && !q.is_expired && !q.awarded_po_id;

  return <>
    <DetailDrawer
      open={id != null} onOpenChange={(open) => !open && onClose()}
      title={q?.document_number || "Quotation"}
      description={q ? `${q.vendor_name || q.vendor_code} · ${q.rfq_number || "No RFQ"}` : "Loading quotation"}
      widthClass="sm:max-w-2xl"
      footer={q && <>
        {isDraft && <Can permission={P.PROC_UPDATE_QUOTATION}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
        {isDraft && <ActionButton label="Submit" permission={P.PROC_SUBMIT_QUOTATION} title="Submit this quotation?" description={`Records ${q.document_number} as a firm offer in contention for the RFQ.`} onConfirm={async () => { const r = await submit({ id: q.id, entity }).unwrap(); toast.success(r.message || "Quotation submitted."); }} />}
        {canAward && <ActionButton label="Award" permission={P.PROC_AWARD_QUOTATION} title="Award this quotation?" description={`Awards ${q.document_number} and raises a draft purchase order from its lines. Competitive minimums are checked before the other quotations are rejected.`} onConfirm={async () => { const r = await award({ id: q.id, entity, competition_exception_reason: competitionExceptionReason.trim() || undefined }).unwrap(); toast.success(r.message || "Quotation awarded."); setCompetitionExceptionReason(""); onClose(); }}>{canOverrideCompetition ? <label className="block font-mont text-xs font-semibold text-gray-01">Exception reason (only if below the bid minimum)<Textarea className="mt-2 min-h-20 bg-white font-mont text-sm" value={competitionExceptionReason} onChange={(event) => setCompetitionExceptionReason(event.target.value)} maxLength={1000} placeholder="Explain why award should proceed with limited competition" /><span className="mt-1 block font-normal leading-5 text-gray-05">The reason and submitted-bid count become part of the audit record.</span></label> : null}</ActionButton>}
        {q.awarded_po_id && <span className="inline-flex items-center gap-1.5 font-mont text-xs font-medium text-gray-05"><Lock className="size-3.5" /> Locked - awarded to {q.awarded_po_number}</span>}
      </>}
    >
      {isLoading ? <LoadingState rows={8} /> : isError || !q ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5"><StatusPill status={q.quotation_status} />{q.is_expired && <ExpiredPill />}</div>
          <p className="font-mont text-lg font-semibold tabular-nums">{formatMoney(q.total, currency)}</p>
        </div>
        <TabStrip
          items={DETAIL_TAB_ITEMS}
          value={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel="Quotation sections"
          className="w-full gap-5"
          buttonClassName="flex items-center gap-1.5 px-0"
        />

        {tab === "overview" && (
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
            <Field label="Quotation number" value={q.document_number} />
            <Field label="Status" value={<div className="flex items-center gap-1.5"><StatusPill status={q.quotation_status} />{q.is_expired && <ExpiredPill />}</div>} />
            <Field label="Vendor" value={q.vendor_name || q.vendor_code} />
            <Field label="RFQ reference" value={q.rfq_number || "-"} />
            <Field label="Quote date" value={shortDate(q.quote_date)} />
            <Field label="Valid until" value={shortDate(q.valid_until)} />
            <Field label="Lead time" value={q.lead_time_days == null ? "-" : `${q.lead_time_days} days`} />
            <Field label="Reference" value={q.reference} />
            <Field label="Subtotal" value={formatMoney(q.subtotal, currency)} />
            <Field label="Tax" value={formatMoney(q.tax_total, currency)} />
            <Field label="Total" value={formatMoney(q.total, currency)} />
            {q.awarded_po_number && <Field label="Awarded PO" value={q.awarded_po_number} />}
          </dl>
        )}

        {tab === "comparison" && <LineComparison quotation={q} entity={entity} currency={currency} />}
        {tab === "evidence" && <QuotationEvidence quotation={q} />}
        {tab === "activity" && <ActivityFeed activity={q.activity} />}
      </div>}
    </DetailDrawer>
    {q && editing && <QuotationForm entity={entity} currency={currency} initial={q} onClose={() => setEditing(false)} />}
  </>;
}

function QuotationEvidence({ quotation }: { quotation: QuotationDetail }) {
  return <div className="space-y-4">
    <section><h3 className="font-mont text-xs font-semibold">Submission history</h3><div className="mt-2 space-y-2">{quotation.submissions.length ? quotation.submissions.map((row) => <div key={row.id} className="rounded-md border border-white-02 p-3 font-mont text-xs"><span className="font-semibold">Revision {row.revision}</span><span className="text-gray-05"> · RFQ version {row.rfq_version} · {new Date(row.submitted_at).toLocaleString()}</span><p className="mt-1 text-gray-05">Submitted by {row.submitted_by_email}</p></div>) : <EmptyPanel>No vendor submission receipt has been recorded.</EmptyPanel>}</div></section>
    <section><h3 className="font-mont text-xs font-semibold">Attachments</h3><div className="mt-2 space-y-2">{quotation.attachments.length ? quotation.attachments.map((row) => <AttachmentRow key={row.id} attachment={row} />) : <EmptyPanel>No PDF or image evidence was attached.</EmptyPanel>}</div></section>
  </div>;
}

function AttachmentRow({ attachment }: { attachment: QuotationDetail["attachments"][number] }) {
  const { data: blobUrl, isLoading } = useFetchAuthMediaQuery(attachment.url);
  return <div className="flex flex-wrap items-center gap-3 rounded-md border border-white-02 p-3"><Paperclip className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate font-mont text-xs font-semibold">{attachment.name}</p><p className="mt-0.5 font-mont text-[11px] text-gray-05">{Math.ceil(attachment.size / 1024)}KB · Revision {attachment.revision}</p></div><Button asChild size="sm" variant="outline" disabled={isLoading || !blobUrl}><a href={blobUrl || "#"} target="_blank" rel="noreferrer">{attachment.content_type === "application/pdf" ? "Open PDF" : "View image"}</a></Button></div>;
}

// Loads a sibling quote's detail so the lowest unit price per RFQ line can be
// computed across the RFQ's competing bids (one hook per child, never in a loop).
function SiblingFetcher({ id, entity, onLoaded }: { id: number; entity: string; onLoaded: (d: QuotationDetail) => void }) {
  const { data } = useGetQuotationQuery({ id, entity });
  const detail = data?.data;
  useEffect(() => { if (detail) onLoaded(detail); }, [detail, onLoaded]);
  return null;
}

function LineComparison({ quotation, entity, currency }: { quotation: QuotationDetail; entity: string; currency?: string | null }) {
  // Sibling SUBMITTED/AWARDED quotes on the same RFQ supply the "Lowest" column.
  const { data: siblingList } = useGetQuotationsQuery(
    { entity, rfq: quotation.rfq_id ? String(quotation.rfq_id) : "" },
    { skip: !quotation.rfq_id },
  );
  const siblingIds = toArray(siblingList?.data)
    .filter((s) => s.id !== quotation.id && (s.quotation_status === "SUBMITTED" || s.quotation_status === "AWARDED"))
    .map((s) => s.id);
  const [siblings, setSiblings] = useState<Record<number, QuotationDetail>>({});
  const onLoaded = (d: QuotationDetail) => setSiblings((prev) => (prev[d.id] === d ? prev : { ...prev, [d.id]: d }));

  const money = (v: number) => formatMoney(v, currency);
  const lowestFor = (rfqLineId: number | null, own: number): number => {
    if (rfqLineId == null) return own;
    const prices = [own, ...Object.values(siblings).flatMap((s) => s.lines.filter((l) => l.rfq_line_id === rfqLineId).map((l) => l.unit_price))];
    return Math.min(...prices);
  };
  const hasLinked = quotation.lines.some((l) => l.rfq_line_id != null);

  if (!quotation.lines.length) return <EmptyPanel>This quotation has no priced lines.</EmptyPanel>;

  return <div className="space-y-2">
    {siblingIds.map((id) => <SiblingFetcher key={id} id={id} entity={entity} onLoaded={onLoaded} />)}
    <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[620px]">
      <thead><tr>{["Description", "Response", "Qty", "Unit price", "Net", "Tax", "Lowest"].map((h) => <th key={h} className={cn("bg-[#F1F1F1] px-3 py-2 font-mont text-[11px] font-semibold text-gray-01", h === "Description" || h === "Response" ? "text-left" : "text-right")}>{h}</th>)}</tr></thead>
      <tbody>{quotation.lines.map((line) => {
        const lowest = lowestFor(line.rfq_line_id, line.unit_price);
        const isLowest = line.rfq_line_id != null && line.unit_price === lowest;
        return (
          <tr key={line.id}>
            <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{line.description}</td>
            <td className="border-t border-white-02 px-3 py-2"><StatusPill status={line.response_type} /></td>
            <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{formatQuantity(line.quantity)}</td>
            <td className={cn("border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums", isLowest && "font-semibold text-emerald-700")}>{money(line.unit_price)}</td>
            <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{money(line.net_amount)}</td>
            <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{money(line.tax_amount)}</td>
            <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums text-gray-05">{line.rfq_line_id == null ? "-" : money(lowest)}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
    <p className="font-mont text-[11px] text-gray-05">{hasLinked ? "“Lowest” compares this bid against the other submitted quotations on the same RFQ line." : "These lines are not linked to RFQ lines, so there is nothing to compare against."}</p>
  </div>;
}

// A prefilled row carries its rfq_line link (the vendor is pricing that RFQ line
// even if it re-words the description); the backend rejects any rfq_line that is
// not on the referenced RFQ, so the link can never point across RFQs.
function QuotationForm({ entity, currency, initial, onClose }: { entity: string; currency?: string | null; initial?: QuotationDetail; onClose: () => void }) {
  const [rfq, setRfq] = useState(initial?.rfq_id ? String(initial.rfq_id) : "");
  const [vendor, setVendor] = useState(initial?.vendor_code || "");
  const [quoteDate, setQuoteDate] = useState(initial?.quote_date || new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(initial?.valid_until || "");
  const [leadTime, setLeadTime] = useState(initial?.lead_time_days != null ? String(initial.lead_time_days) : "");
  const [reference, setReference] = useState(initial?.reference || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  type Row = { key: string; rfq_line: number | null; description: string; quantity: number; unitPriceKobo: number; taxCode: string };
  const seed = (): Row[] => initial
    ? initial.lines.map((l) => ({ key: crypto.randomUUID(), rfq_line: l.rfq_line_id, description: l.description, quantity: Number(l.quantity), unitPriceKobo: l.unit_price, taxCode: l.tax_code_id ? String(l.tax_code_id) : "" }))
    : [{ key: crypto.randomUUID(), rfq_line: null, description: "", quantity: 1, unitPriceKobo: 0, taxCode: "" }];
  const [rows, setRows] = useState<Row[]>(seed);

  // On create, when an RFQ is picked, prefill one priced row per RFQ line and reset the
  // vendor (it must be re-chosen from THIS RFQ's invited, not-yet-quoted vendors).
  const { data: rfqDetail } = useGetRfqQuery({ id: Number(rfq), entity }, { skip: !rfq || !!initial });
  const [filledFrom, setFilledFrom] = useState<string>("");
  if (!initial && rfqDetail?.data && filledFrom !== rfq) {
    setFilledFrom(rfq);
    setVendor("");
    setRows(rfqDetail.data.lines.map((l) => ({ key: crypto.randomUUID(), rfq_line: l.id, description: l.description, quantity: Number(l.quantity), unitPriceKobo: 0, taxCode: l.tax_code_id ? String(l.tax_code_id) : "" })));
  }
  // Invited-only is enforced by the backend, so the picker only offers invited vendors
  // that have not already quoted on this RFQ (responded === false).
  const invitedAvailable = (rfqDetail?.data?.invitations ?? []).filter((i) => !i.responded);

  const [create, { isLoading: creating }] = useCreateQuotationMutation();
  const [update, { isLoading: updating }] = useUpdateQuotationMutation();
  const saving = creating || updating;

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = () => setRows((rs) => [...rs, { key: crypto.randomUUID(), rfq_line: null, description: "", quantity: 1, unitPriceKobo: 0, taxCode: "" }]);

  const apiLines = rows.filter((r) => r.description.trim()).map((r) => ({
    description: r.description.trim(),
    quantity: r.quantity || 1,
    unit_price: r.unitPriceKobo || 0,
    ...(r.rfq_line ? { rfq_line: r.rfq_line } : {}),
    ...(r.taxCode ? { tax_code: r.taxCode } : {}),
  }));
  const total = rows.reduce((sum, r) => sum + Math.round((r.quantity || 0) * (r.unitPriceKobo || 0)), 0);

  const valid = !!rfq && !!vendor && !!quoteDate && apiLines.length > 0 &&
    (!validUntil || validUntil >= quoteDate) && (!leadTime || (Number(leadTime) >= 0 && Number(leadTime) <= 3650));
  const dirty = !initial ||
    vendor !== (initial.vendor_code || "") || quoteDate !== (initial.quote_date || "") ||
    validUntil !== (initial.valid_until || "") || leadTime !== (initial.lead_time_days != null ? String(initial.lead_time_days) : "") ||
    reference !== (initial.reference || "") || notes !== (initial.notes || "") ||
    JSON.stringify(apiLines) !== JSON.stringify(initial.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: l.unit_price, ...(l.rfq_line_id ? { rfq_line: l.rfq_line_id } : {}), ...(l.tax_code_id ? { tax_code: String(l.tax_code_id) } : {}) })));

  const save = async () => {
    if (!valid) return;
    const shared = { quote_date: quoteDate, valid_until: validUntil || undefined, lead_time_days: leadTime ? Number(leadTime) : undefined, reference: reference.trim() || undefined, notes: notes.trim() || undefined, lines: apiLines };
    try {
      const res = initial
        ? await update({ id: initial.id, entity, ...shared }).unwrap()
        : await create({ entity, rfq: Number(rfq), vendor, ...shared }).unwrap();
      toast.success(res.message || (initial ? "Quotation updated." : "Quotation created."));
      onClose();
    } catch { /* central */ }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !saving && !o && onClose()}
      title={initial ? "Edit quotation" : "New quotation"}
      description={initial ? "Edit this draft; its priced lines are fully replaced on save." : "A vendor's bid against an issued RFQ. Award it later to raise a purchase order."}
      widthClass="sm:max-w-2xl" onSubmit={save} submitText={initial ? "Save changes" : "Create quotation"}
      loading={saving} canSubmit={valid && dirty}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="RFQ" required><RfqPicker entity={entity} value={rfq} onChange={setRfq} status="ISSUED" isRequired /></FormField>
        <FormField label="Vendor" required>
          {initial ? (
            <VendorPicker entity={entity} value={vendor} onChange={setVendor} purchaseEligible isRequired disabled />
          ) : !rfq ? (
            <p className="rounded border border-white-02 bg-gray-50 px-3 py-2 font-mont text-xs text-gray-05">Select an RFQ first to choose from its invited vendors.</p>
          ) : invitedAvailable.length ? (
            <SearchSelect
              options={invitedAvailable.map((i) => ({ value: i.vendor_code, label: `${i.vendor_code} - ${i.vendor_name}` }))}
              value={vendor} onChange={(e) => setVendor(e.target.value)}
              placeholder="Select an invited vendor" isRequired revealOnSearch
            />
          ) : (
            <p className="rounded border border-white-02 bg-gray-50 px-3 py-2 font-mont text-xs text-gray-05">
              {rfqDetail ? "Every invited vendor on this RFQ has already quoted." : "Loading invited vendors…"}
            </p>
          )}
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Quote date" required><Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="bg-white" /></FormField>
        <FormField label="Valid until"><Input type="date" min={quoteDate} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="bg-white" /></FormField>
        <FormField label="Lead time (days)"><Input type="number" min="0" max="3650" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} className="bg-white tabular-nums" /></FormField>
      </div>
      <FormField label="Reference"><Input value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} className="bg-white" /></FormField>
      <FormField label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-white" /></FormField>

      <div className="space-y-3 pt-1">
        <p className="font-mont text-xs font-semibold text-gray-05">Priced lines</p>
        {rows.map((row) => (
          <div key={row.key} className="space-y-2 rounded-md border border-white-02 p-3">
            <div className="flex items-center gap-2">
              <Input value={row.description} onChange={(e) => setRow(row.key, { description: e.target.value })} placeholder="Description" className="flex-1 bg-white" />
              <button type="button" onClick={() => removeRow(row.key)} disabled={rows.length <= 1} className="text-gray-05 hover:text-destructive disabled:opacity-30" aria-label="Remove line">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min="0" step="any" value={row.quantity} onChange={(e) => setRow(row.key, { quantity: Number(e.target.value) })} placeholder="Qty" className="bg-white tabular-nums" aria-label="Quantity" />
              <MoneyInput valueKobo={row.unitPriceKobo} onChangeKobo={(k) => setRow(row.key, { unitPriceKobo: k })} currency={currency} placeholder="Unit price" />
            </div>
            <TaxCodePicker entity={entity} value={row.taxCode} onChange={(v) => setRow(row.key, { taxCode: v })} usage="purchase" />
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5"><Plus className="size-4" /> Add line</Button>
          <p className="font-mont text-xs font-semibold tabular-nums">Total {formatMoney(total, currency)}</p>
        </div>
      </div>
    </FormDrawer>
  );
}
