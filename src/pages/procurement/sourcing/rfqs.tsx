// Sourcing → RFQs. Issue a request for quotation, watch responses arrive, then
// close/cancel or (via the Quotations screen) award. No GL effect.
import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import {
  AlertTriangle, CalendarPlus, ChevronRight, ClipboardList, Clock, FilePenLine, FileText, History,
  Inbox, List, MailPlus, Plus, Search, Users,
} from "lucide-react";
import { toast } from "sonner";

import { ProcurementShell } from "../procurement-shell";
import { RequisitionPicker } from "../pickers";
import { SearchSelect } from "@/components/custom/search-select";
import {
  DataTable, DetailDrawer, EmptyState, ErrorState, FormField, LineEditor,
  LoadingState, Money, MoneyInput, StatCard, StatusPill, ActionButton, emptyLine, toArray,
  useActiveEntity, type Column, type DocLine,
} from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "../../../permissions";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useGetRfqsQuery, useGetRfqQuery, useGetRfqSummaryQuery,
  useCreateRfqMutation, useUpdateRfqMutation,
  useIssueRfqMutation, useCloseRfqMutation, useCancelRfqMutation,
  useResendRfqInvitationMutation, useExtendRfqInvitationMutation, useCreateRfqAmendmentMutation,
} from "@/redux/services/procurement/procurement-ext-api";
import { useGetRequisitionQuery, useGetVendorsQuery } from "@/redux/services/procurement/procurement-api";
import type { Rfq, RfqDetail, RfqInvitation } from "@/redux/services/procurement/procurement-types";
import { formatQuantity } from "@/utils/quantity";
import { ActivityFeed, EmptyPanel, Field, ExpiredPill } from "./shared";
import { RFQ_TABS, isForbidden, shortDate } from "./helpers";
import { PageShell } from "@/components/layout/page-shell";

const DETAIL_TABS = [
  ["overview", "Overview", FileText], ["lines", "Lines", List],
  ["invited", "Vendors invited", Users],
  ["quotations", "Quotations", ClipboardList], ["activity", "Activity", History],
] as const;

// A vendor row inside the invite editor. `responded` disables removal (unforgeable
// history) and is prefilled from the RFQ's invitations on edit.
type InviteRow = { code: string; name: string; responded: boolean };

// ISSUED reads as "Open" to buyers; keep the persisted value everywhere else.
function RfqStatusPill({ status }: { status: string }) {
  return <StatusPill status={status === "ISSUED" ? "OPEN" : status} />;
}

export default function RfqsPage() {
  const { code: entity, currency } = useActiveEntity();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useActionParam("new", () => setCreating(true));
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(
    () => ({ entity: entity!, page, ...(status ? { status } : {}), ...(debounced ? { q: debounced } : {}) }),
    [entity, page, status, debounced],
  );
  const { currentData: data, isLoading, isFetching, isError, error, refetch } = useGetRfqsQuery(params, { skip: !entity });
  const { data: summaryData, isLoading: summaryLoading } = useGetRfqSummaryQuery({ entity: entity! }, { skip: !entity });
  const rows = toArray(data?.data);
  const summary = summaryData?.data;

  const columns: Column<Rfq>[] = [
    { header: "RFQ #", cell: (r) => <span className="font-mont text-sm font-semibold text-primary">{r.document_number}</span> },
    {
      header: "Title", cell: (r) => (
        <div className="min-w-40">
          <p className="font-semibold">{r.title || "Untitled RFQ"}</p>
          {r.requisition_number && <p className="mt-0.5 text-xs text-gray-05">From {r.requisition_number}</p>}
        </div>
      ),
    },
    { header: "Lines", align: "right", cell: (r) => <span className="tabular-nums">{r.line_count}</span> },
    { header: "Invited", align: "right", cell: (r) => <span className="tabular-nums">{r.invited_count}</span> },
    { header: "Responses", align: "right", cell: (r) => <span className="tabular-nums">{r.response_count}</span> },
    { header: "Issued", cell: (r) => shortDate(r.issue_date) },
    { header: "Deadline", cell: (r) => shortDate(r.response_due_date) },
    { header: "Status", cell: (r) => <RfqStatusPill status={r.rfq_status} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  if (!entity) return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view its RFQs." /></PageShell></ProcurementShell>;

  return <ProcurementShell>
    <PageShell className="space-y-5 text-black-01">
      <header data-guide="procurement-rfqs.heading" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mont text-lg font-semibold text-gray-01">RFQs</h1>
          <p className="mt-0.5 font-mont text-xs text-gray-05">Invite vendors to quote, track responses, and award the winning bid.</p>
        </div>
        <Can permission={P.PROC_CREATE_RFQ}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> New RFQ</Button></Can>
      </header>

      <div data-guide="procurement-rfqs.summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryLoading || !summary ? <div className={cn(INFORMATION_CARD_SURFACE, "col-span-full rounded-md")}><LoadingState rows={2} /></div> : <>
          <StatCard label="Draft" value={summary.draft} icon={FileText} />
          <StatCard label="Open" value={summary.open} icon={Clock} tone="green" />
          <StatCard label="Responses in" value={summary.responses_in} icon={Inbox} tone="amber" />
          <StatCard label="Closing ≤ 7 days" value={summary.closing_soon} icon={AlertTriangle} tone="amber" />
        </>}
      </div>

      <section data-guide="procurement-rfqs.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
          <div className="max-w-full overflow-x-auto"><div className="flex min-w-max gap-5">{RFQ_TABS.map(([label, value]) => (
            <button key={label} onClick={() => { setStatus(value); setPage(1); }} className={cn("border-b-2 py-3 font-mont text-xs font-medium whitespace-nowrap", status === value ? "border-primary text-primary" : "border-transparent text-gray-05")}>{label}</button>
          ))}</div></div>
          <label className="relative my-2 min-w-0 flex-1 sm:max-w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search RFQ # or title" className="h-9 bg-white pl-9" /></label>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch} onRowClick={(r) => setSelectedId(r.id)} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage} emptyTitle="No RFQs" emptyMessage={debounced ? "Try a different search term or status." : "Create an RFQ to invite vendor quotations."} />
      </section>
    </PageShell>
    <RfqDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
    {creating && <RfqForm entity={entity} currency={currency} onClose={() => setCreating(false)} />}
  </ProcurementShell>;
}

function RfqDrawer({ id, entity, currency, onClose }: { id: number | null; entity: string; currency?: string | null; onClose: () => void }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [amending, setAmending] = useState(false);
  const [extending, setExtending] = useState<RfqInvitation | null>(null);
  const [competitionExceptionReason, setCompetitionExceptionReason] = useState("");
  const { hasPermission } = usePermissions();
  const canOverrideCompetition = hasPermission(P.PROC_OVERRIDE_COMPETITION);
  const { data, isLoading, isError, refetch } = useGetRfqQuery({ id: id!, entity }, { skip: id == null });
  const rfq = data?.data;
  const [issue] = useIssueRfqMutation();
  const [close] = useCloseRfqMutation();
  const [cancel] = useCancelRfqMutation();
  const [resend] = useResendRfqInvitationMutation();

  const run = (fn: () => Promise<{ message?: string }>, ok: string) => async () => {
    const res = await fn();
    toast.success(res.message || ok);
  };

  const isDraft = rfq?.rfq_status === "DRAFT";
  const isIssued = rfq?.rfq_status === "ISSUED";

  return <>
    <DetailDrawer
      open={id != null} onOpenChange={(open) => !open && onClose()}
      title={rfq?.document_number || "RFQ"}
      description={rfq ? `${rfq.title || "Untitled"} · issued ${shortDate(rfq.issue_date)}` : "Loading RFQ"}
      widthClass="sm:max-w-2xl"
      footer={rfq && <>
        {isDraft && <Can permission={P.PROC_UPDATE_RFQ}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
        {isIssued && <Can permission={P.PROC_ISSUE_RFQ}><Button variant="outline" onClick={() => setAmending(true)}><FilePenLine className="size-4" /> Amend</Button></Can>}
        {isDraft && <ActionButton label="Issue" permission={P.PROC_ISSUE_RFQ} title="Issue this RFQ?" description={`Sends ${rfq.document_number} to vendors so they can submit quotations. Competitive minimums are checked when you confirm.`} onConfirm={async () => { const response = await issue({ id: rfq.id, entity, competition_exception_reason: competitionExceptionReason.trim() || undefined }).unwrap(); toast.success(response.message || "RFQ issued."); setCompetitionExceptionReason(""); }}>{canOverrideCompetition ? <label className="block font-mont text-xs font-semibold text-gray-01">Exception reason (only if below the vendor minimum)<Textarea className="mt-2 min-h-20 bg-white font-mont text-sm" value={competitionExceptionReason} onChange={(event) => setCompetitionExceptionReason(event.target.value)} maxLength={1000} placeholder="Explain the sole-source or limited-market exception" /><span className="mt-1 block font-normal leading-5 text-gray-05">The reason and actual vendor count become part of the audit record.</span></label> : null}</ActionButton>}
        {isIssued && <ActionButton label="Close" permission={P.PROC_ISSUE_RFQ} title="Close this RFQ without awarding?" description="Finishes sourcing without an award; the remaining quotations will be rejected." onConfirm={run(() => close({ id: rfq.id, entity }).unwrap(), "RFQ closed.")} />}
        {(isDraft || isIssued) && <ActionButton label="Cancel RFQ" permission={P.PROC_ISSUE_RFQ} destructive title="Cancel this RFQ?" description="Abandons the RFQ; any live quotations on it will be rejected. This cannot be undone." confirmText="Cancel RFQ" onConfirm={run(() => cancel({ id: rfq.id, entity }).unwrap(), "RFQ cancelled.")} />}
      </>}
    >
      {isLoading ? <LoadingState rows={8} /> : isError || !rfq ? <ErrorState onRetry={refetch} /> : <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RfqStatusPill status={rfq.rfq_status} />
          <p className="font-mont text-xs text-gray-05">{rfq.response_count} response{rfq.response_count === 1 ? "" : "s"} · {rfq.line_count} line{rfq.line_count === 1 ? "" : "s"}</p>
        </div>
        <div className="max-w-full overflow-x-auto border-b border-white-02"><div className="flex min-w-max gap-5">{DETAIL_TABS.map(([value, label, Icon]) => (
          <button key={value} onClick={() => setTab(value)} className={cn("flex items-center gap-1.5 border-b-2 py-2.5 font-mont text-xs font-medium whitespace-nowrap", tab === value ? "border-primary text-primary" : "border-transparent text-gray-05")}><Icon className="size-3.5" />{label}</button>
        ))}</div></div>

        {tab === "overview" && (
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
            <Field label="RFQ number" value={rfq.document_number} />
            <Field label="Status" value={<RfqStatusPill status={rfq.rfq_status} />} />
            <Field label="Title" value={rfq.title} />
            <Field label="Requisition" value={rfq.requisition_number || "-"} />
            <Field label="Issued" value={shortDate(rfq.issue_date)} />
            <Field label="Response deadline" value={shortDate(rfq.response_due_date)} />
            <Field label="Published version" value={`Version ${rfq.version}`} />
            <Field label="Budget estimate" value={rfq.budget_estimate != null ? <Money kobo={rfq.budget_estimate} currency={currency} /> : "-"} />
            <Field label="Vendors invited" value={rfq.invited_count} />
            <Field label="Responses received" value={rfq.response_count} />
            <div className="sm:col-span-2"><dt className="font-mont text-[11px] text-gray-05">Notes</dt><dd className="mt-1 font-mont text-sm text-black-01">{rfq.notes || "-"}</dd></div>
            {rfq.amendments.length > 0 && <div className="sm:col-span-2"><dt className="font-mont text-[11px] text-gray-05">Amendments</dt><dd className="mt-2 space-y-2">{rfq.amendments.map((row) => <div key={row.id} className="rounded border border-white-02 bg-gray-50 p-2.5 font-mont text-xs"><span className="font-semibold">Version {row.version}</span> · {row.summary}<span className="ml-1 text-gray-05">({row.response_required ? "new response required" : "information only"})</span></div>)}</dd></div>}
          </dl>
        )}

        {tab === "lines" && (rfq.lines.length ? (
          <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[520px]">
            <thead><tr>{["#", "Description", "Qty", "Expense account", "Tax"].map((h) => <th key={h} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{h}</th>)}</tr></thead>
            <tbody>{rfq.lines.map((line) => (
              <tr key={line.id}>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums text-gray-05">{line.line_no}</td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{line.description}</td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{formatQuantity(line.quantity)}</td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{line.expense_code || "-"}</td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{line.tax_code_id ? "Taxed" : "-"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyPanel>This RFQ has no specification lines.</EmptyPanel>)}

        {tab === "invited" && (rfq.invitations.length ? (
          <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[820px]">
            <thead><tr>{["Vendor", "Invitation", "Contacts", "Quotation", "Total", "Actions"].map((h) => <th key={h} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{h}</th>)}</tr></thead>
            <tbody>{rfq.invitations.map((inv) => (
              <tr key={inv.vendor_id}>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs"><p className="font-semibold">{inv.vendor_name}</p><p className="mt-0.5 text-gray-05">{inv.vendor_code}</p></td>
                <td className="border-t border-white-02 px-3 py-2"><StatusPill status={inv.status || (inv.responded ? "RESPONDED" : "AWAITED")} /><p className="mt-1 font-mont text-[10px] text-gray-05">{inv.deadline ? new Date(inv.deadline).toLocaleString() : "No deadline"}</p></td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs"><p>{inv.recipients.map((row) => row.name || row.email).join(", ") || "No RFQ contact"}</p><p className="mt-0.5 text-[10px] text-gray-05">{inv.recipients.map((row) => row.email).join(", ")}</p></td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{inv.quotation_id ? <span className="flex flex-wrap items-center gap-1.5"><StatusPill status={inv.quotation_status || ""} /></span> : "-"}</td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{inv.quotation_total != null ? <Money kobo={inv.quotation_total} currency={currency} /> : "-"}</td>
                <td className="border-t border-white-02 px-3 py-2"><div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={async () => { try { await resend({ id: rfq.id, invitationId: inv.id, entity }).unwrap(); toast.success("Invitation resent."); } catch { /* central */ } }}><MailPlus className="size-3.5" /> Resend</Button><Button size="sm" variant="outline" onClick={() => setExtending(inv)}><CalendarPlus className="size-3.5" /> Extend</Button></div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyPanel>No vendors have been invited yet.</EmptyPanel>)}

        {tab === "quotations" && (rfq.quotations.length ? (
          <div className="overflow-x-auto rounded-md border border-white-02"><table className="w-full min-w-[560px]">
            <thead><tr>{["Quotation", "Vendor", "Total", "Lead time", "Status"].map((h) => <th key={h} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{h}</th>)}</tr></thead>
            <tbody>{rfq.quotations.map((q) => (
              <tr key={q.id}>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{q.document_number}</td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs">{q.vendor_name || q.vendor_code}</td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums"><Money kobo={q.total} currency={currency} /></td>
                <td className="border-t border-white-02 px-3 py-2 font-mont text-xs tabular-nums">{q.lead_time_days == null ? "-" : `${q.lead_time_days} days`}</td>
                <td className="border-t border-white-02 px-3 py-2"><div className="flex flex-wrap items-center gap-1.5"><StatusPill status={q.quotation_status} />{q.is_expired && <ExpiredPill />}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyPanel>No quotations have been received.</EmptyPanel>)}

        {tab === "activity" && <ActivityFeed activity={rfq.activity} />}
      </div>}
    </DetailDrawer>
    {rfq && editing && <RfqForm entity={entity} currency={currency} initial={rfq} onClose={() => setEditing(false)} />}
    {rfq && amending && <RfqAmendmentForm rfq={rfq} entity={entity} onClose={() => setAmending(false)} />}
    {rfq && extending && <RfqExtensionForm rfq={rfq} invitation={extending} entity={entity} onClose={() => setExtending(null)} />}
  </>;
}

function RfqAmendmentForm({ rfq, entity, onClose }: { rfq: RfqDetail; entity: string; onClose: () => void }) {
  const [summary, setSummary] = useState("");
  const [responseRequired, setResponseRequired] = useState(true);
  const [deadline, setDeadline] = useState("");
  const [changeLines, setChangeLines] = useState(false);
  const [lines, setLines] = useState<DocLine[]>(rfq.lines.map((line) => ({ ...emptyLine(), description: line.description, quantity: Number(line.quantity), account: line.expense_code || "", taxCode: line.tax_code_id ? String(line.tax_code_id) : "" })));
  const [create, { isLoading }] = useCreateRfqAmendmentMutation();
  const apiLines = lines.filter((line) => line.description.trim()).map((line) => ({ description: line.description.trim(), quantity: line.quantity || 1, ...(line.account ? { expense_account: line.account } : {}), ...(line.taxCode ? { tax_code: line.taxCode } : {}) }));
  const publish = async () => {
    try {
      await create({ id: rfq.id, entity, summary: summary.trim(), response_required: responseRequired, ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}), ...(changeLines ? { lines: apiLines } : {}) }).unwrap();
      toast.success(`RFQ version ${rfq.version + 1} published.`);
      onClose();
    } catch { /* central */ }
  };
  return <DetailDrawer open onOpenChange={(open) => !open && !isLoading && onClose()} title="Publish RFQ amendment" description="Preserves earlier submissions and emails every invited vendor." widthClass="sm:max-w-2xl" footer={<><Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button><Button onClick={publish} disabled={!summary.trim() || (changeLines && apiLines.length === 0)} loading={isLoading}>Publish amendment</Button></>}>
    <div className="space-y-4">
      <FormField label="Change summary" required><Textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} placeholder="Explain what changed and what vendors should review." /></FormField>
      <FormField label="New deadline (optional)"><Input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></FormField>
      <label className="flex items-start gap-2 rounded-md border border-white-02 p-3 font-mont text-xs"><input type="checkbox" className="mt-0.5" checked={responseRequired} onChange={(event) => setResponseRequired(event.target.checked)} /><span><strong className="block text-gray-01">Require a new response</strong><span className="mt-1 block leading-5 text-gray-05">Submitted quotations reopen as drafts. Their earlier receipts remain unchanged.</span></span></label>
      <label className="flex items-start gap-2 rounded-md border border-white-02 p-3 font-mont text-xs"><input type="checkbox" className="mt-0.5" checked={changeLines} onChange={(event) => setChangeLines(event.target.checked)} /><span><strong className="block text-gray-01">Change requested items or quantities</strong><span className="mt-1 block leading-5 text-gray-05">The current specification remains preserved in earlier quotation receipts.</span></span></label>
      {changeLines && <div><p className="mb-2 font-mont text-xs font-semibold text-gray-05">Replacement specification</p><LineEditor entity={entity} lines={lines} onChange={setLines} accountLabel="Expense account (optional)" accountType="EXPENSE" showTax showCostCenter={false} taxUsage="purchase" /></div>}
    </div>
  </DetailDrawer>;
}

function RfqExtensionForm({ rfq, invitation, entity, onClose }: { rfq: RfqDetail; invitation: RfqInvitation; entity: string; onClose: () => void }) {
  const [deadline, setDeadline] = useState("");
  const [extend, { isLoading }] = useExtendRfqInvitationMutation();
  const save = async () => {
    try {
      await extend({ id: rfq.id, invitationId: invitation.id, entity, deadline: new Date(deadline).toISOString() }).unwrap();
      toast.success(`Deadline extended for ${invitation.vendor_name}.`);
      onClose();
    } catch { /* central */ }
  };
  return <DetailDrawer open onOpenChange={(open) => !open && !isLoading && onClose()} title="Extend vendor deadline" description={`Only ${invitation.vendor_name} receives this extension.`} widthClass="sm:max-w-md" footer={<><Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button><Button onClick={save} disabled={!deadline} loading={isLoading}>Extend and notify</Button></>}>
    <FormField label="New deadline" required><Input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></FormField>
  </DetailDrawer>;
}

// requisition_line linkage is carried only when the prefilled line is unchanged
// (same description + quantity at the same index) - never mis-linked after edits.
type ReqSnapshot = { requisition_line: number; description: string; quantity: number }[];

// An RFQ is a request sent to invited vendors. This editor adds purchase-eligible
// vendors (active, not on-hold, KYC ≠ REJECTED) as removable chips. A vendor that has
// already responded cannot be removed (removing it would strand its quotation), so its
// ✕ is disabled - matching the backend's responded-vendor protection.
function InviteVendorsEditor({ entity, invited, onChange }: { entity: string; invited: InviteRow[]; onChange: (rows: InviteRow[]) => void }) {
  const { data, isLoading } = useGetVendorsQuery({ entity, page_size: 100 });
  const vendors = toArray(data?.data);
  const invitedCodes = new Set(invited.map((v) => v.code));
  const options = vendors
    .filter((v) => v.is_active && !v.on_hold && v.kyc_status !== "REJECTED" && !invitedCodes.has(v.code))
    .map((v) => ({ value: v.code, label: `${v.code} - ${v.name}` }));
  const add = (code: string) => {
    if (!code || invitedCodes.has(code)) return;
    const vendor = vendors.find((v) => v.code === code);
    if (vendor) onChange([...invited, { code: vendor.code, name: vendor.name, responded: false }]);
  };
  return (
    <div className="space-y-2">
      <SearchSelect options={options} value="" onChange={(e) => add(e.target.value)} loading={isLoading} placeholder="Add a vendor to invite" revealOnSearch />
      {invited.length === 0 ? (
        <p className="font-mont text-xs text-gray-05">No vendors invited yet. Add at least one before issuing.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {invited.map((v) => (
            <span key={v.code} className="inline-flex max-w-full items-center gap-1.5 rounded border border-white-02 bg-gray-50 px-2 py-1 font-mont text-xs">
              <span className="min-w-0 truncate">{v.code} - {v.name}</span>
              <button
                type="button" onClick={() => onChange(invited.filter((row) => row.code !== v.code))}
                disabled={v.responded} title={v.responded ? "Already responded - cannot be removed" : "Remove"}
                className="text-gray-05 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Remove ${v.code}`}
              >✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RfqForm({ entity, currency, initial, onClose }: { entity: string; currency?: string | null; initial?: RfqDetail; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [issueDate, setIssueDate] = useState(initial?.issue_date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initial?.response_due_date || "");
  const [budgetKobo, setBudgetKobo] = useState(initial?.budget_estimate ?? 0);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [requisition, setRequisition] = useState("");
  const [reqSnapshot, setReqSnapshot] = useState<ReqSnapshot>([]);
  const [invited, setInvited] = useState<InviteRow[]>(
    initial?.invitations.map((i) => ({ code: i.vendor_code, name: i.vendor_name, responded: i.responded })) ?? [],
  );
  const [lines, setLines] = useState<DocLine[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({ ...emptyLine(), description: l.description, quantity: Number(l.quantity), account: l.expense_code || "", taxCode: l.tax_code_id ? String(l.tax_code_id) : "" }))
      : [emptyLine()],
  );
  const [create, { isLoading: creating }] = useCreateRfqMutation();
  const [update, { isLoading: updating }] = useUpdateRfqMutation();
  const [issue, { isLoading: issuing }] = useIssueRfqMutation();

  // When a requisition is picked, prefill lines from its own lines (create only).
  const { data: reqData } = useGetRequisitionQuery({ id: Number(requisition), entity }, { skip: !requisition || !!initial });
  const [filledFrom, setFilledFrom] = useState<string>("");
  if (!initial && reqData?.data && filledFrom !== requisition) {
    setFilledFrom(requisition);
    const reqLines = reqData.data.lines;
    setReqSnapshot(reqLines.map((l) => ({ requisition_line: l.id, description: l.description, quantity: Number(l.quantity) })));
    setLines(reqLines.map((l) => ({ ...emptyLine(), description: l.description, quantity: Number(l.quantity), account: l.expense_code || "" })));
  }

  // RFQ lines are unpriced: description required, expense account/tax optional; never send unit_price.
  const apiLines = lines
    .map((l, i) => ({ line: l, index: i }))
    .filter(({ line }) => line.description.trim())
    .map(({ line, index }) => {
      const snap = reqSnapshot[index];
      const linked = snap && snap.description === line.description && snap.quantity === line.quantity;
      return {
        description: line.description.trim(),
        quantity: line.quantity || 1,
        ...(line.account ? { expense_account: line.account } : {}),
        ...(line.taxCode ? { tax_code: line.taxCode } : {}),
        ...(linked ? { requisition_line: snap.requisition_line } : {}),
      };
    });

  const saving = creating || updating || issuing;
  const valid = !!title.trim() && !!issueDate && apiLines.length > 0 && (!dueDate || dueDate >= issueDate);
  // Backend issue rule: an RFQ needs ≥1 line AND ≥1 invited vendor before it opens.
  const canIssue = valid && invited.length > 0;
  // Edit is gated on dirty too; create just needs validity.
  const initialInvited = (initial?.invitations ?? []).map((i) => i.vendor_code).sort().join(",");
  const currentInvited = invited.map((v) => v.code).sort().join(",");
  const dirty = !initial || title !== (initial.title || "") || issueDate !== (initial.issue_date || "") ||
    dueDate !== (initial.response_due_date || "") || notes !== (initial.notes || "") ||
    budgetKobo !== (initial.budget_estimate ?? 0) || currentInvited !== initialInvited ||
    JSON.stringify(apiLines) !== JSON.stringify(initial.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), ...(l.expense_code ? { expense_account: l.expense_code } : {}), ...(l.tax_code_id ? { tax_code: String(l.tax_code_id) } : {}) })));

  const save = async (issueAfter: boolean) => {
    if (!valid || (issueAfter && !canIssue)) return;
    const body = {
      title: title.trim(), issue_date: issueDate, response_due_date: dueDate || undefined,
      // 0 means "no budget": omit on create, clear (null) on edit.
      budget_estimate: budgetKobo > 0 ? budgetKobo : (initial ? null : undefined),
      invited_vendors: invited.map((v) => v.code),
      notes: notes.trim() || undefined, lines: apiLines,
    };
    try {
      const res = initial
        ? await update({ id: initial.id, entity, ...body }).unwrap()
        : await create({ entity, ...body }).unwrap();
      if (issueAfter && !initial) await issue({ id: res.data.id, entity }).unwrap();
      toast.success(
        issueAfter ? "RFQ created and issued." : res.message || (initial ? "RFQ updated." : "RFQ created."),
      );
      onClose();
    } catch { /* central */ }
  };

  const footer = initial ? (
    <>
      <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
      <Button disabled={!valid || !dirty} loading={saving} onClick={() => save(false)}>Save changes</Button>
    </>
  ) : (
    <>
      <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
      <Button variant="outline" disabled={!valid} loading={creating} onClick={() => save(false)}>Save Draft</Button>
      <Can permission={P.PROC_ISSUE_RFQ}>
        <Button disabled={!canIssue} loading={saving} onClick={() => save(true)}>Create &amp; Issue</Button>
      </Can>
    </>
  );

  return (
    <DetailDrawer
      open onOpenChange={(o) => { if (!saving && !o) onClose(); }}
      title={initial ? "Edit RFQ" : "New RFQ"}
      description={initial ? "Edit this draft; its lines and invited vendors are fully replaced on save." : "Invite vendors to quote. Issue it to open it for responses."}
      widthClass="sm:max-w-2xl" footer={footer}
    >
      <div className="space-y-4">
        <FormField label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-white" /></FormField>
        {!initial && <FormField label="From requisition"><RequisitionPicker entity={entity} value={requisition} onChange={setRequisition} status="APPROVED" placeholder="Optional - prefill from an approved requisition" /></FormField>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Issue date" required><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="bg-white" /></FormField>
          <FormField label="Response due"><Input type="date" min={issueDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white" /></FormField>
        </div>
        <FormField label="Budget estimate (optional)"><MoneyInput valueKobo={budgetKobo} onChangeKobo={setBudgetKobo} currency={currency} placeholder="No budget ceiling" /></FormField>
        <div>
          <p className="mb-2 font-mont text-xs text-gray-05">Invite vendors *</p>
          <InviteVendorsEditor entity={entity} invited={invited} onChange={setInvited} />
        </div>
        <FormField label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-white" /></FormField>
        <div className="pt-1">
          <p className="mb-2 font-mont text-xs font-semibold text-gray-05">Lines (specification only - no price)</p>
          <LineEditor entity={entity} lines={lines} onChange={setLines} accountLabel="Expense account (optional)" accountType="EXPENSE" showTax showCostCenter={false} taxUsage="purchase" />
        </div>
      </div>
    </DetailDrawer>
  );
}
