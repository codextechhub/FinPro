import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useSearchParams } from "react-router";
import {
  Check, ChevronRight, Clock3, FileText, History,
  RotateCcw, Search, ShieldCheck, SkipForward, X,
} from "lucide-react";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import {
  ConfirmActionModal, DataTable, DetailDrawer, EmptyState, ErrorState,
  InfoHint, LoadingState, StatusPill, useActiveEntity, type Column,
} from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useGetProcurementApprovalQuery,
  useGetProcurementApprovalsQuery,
  useRecordProcurementApprovalActionMutation,
} from "@/redux/services/procurement/procurement-ext-api";
import type {
  ProcurementApprovalAction,
  ProcurementApprovalDetail,
  ProcurementApprovalRow,
  ProcurementApprovalStage,
} from "@/redux/services/procurement/procurement-ext-types";
import { formatMoney } from "@/utils/money";
import { PageShell } from "@/components/layout/page-shell";

const DOCUMENT_TYPES = [
  ["", "All document types"],
  ["procurement.requisition", "Requisitions"],
  ["procurement.purchase_order", "Purchase Orders"],
  ["procurement.vendor_invoice", "Vendor Invoices"],
  ["procurement.vendor_payment", "Vendor Payments"],
] as const;

function dateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      }).format(parsed);
}

function age(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : formatDistanceToNowStrict(parsed, { addSuffix: false });
}

function isForbidden(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 403;
}

export default function ProcurementApprovalsPage() {
  const { code: entity, currency } = useActiveEntity();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [documentType, setDocumentType] = useState("");
  const selectedId = params.get("approval");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when the server-side filters change (render-phase, not an effect).
  const filterKey = `${debouncedSearch} ${documentType} ${entity}`;
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) { setPagedFor(filterKey); setPage(1); }

  const { data, isLoading, isFetching, isError, error, refetch } = useGetProcurementApprovalsQuery(
    {
      entity: entity!, page,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(documentType ? { document_type: documentType } : {}),
    },
    { skip: !entity, refetchOnMountOrArgChange: true },
  );

  const rows = Array.isArray(data?.data) ? data.data : [];
  const columns: Column<ProcurementApprovalRow>[] = [
    {
      header: "Document",
      cell: (row) => <div className="min-w-36"><p className="font-semibold text-primary">{row.reference}</p><p className="mt-0.5 max-w-48 truncate text-[11px] text-gray-05">{row.title}</p></div>,
    },
    { header: "Type", cell: (row) => row.document_type_label },
    { header: "Submitted By", cell: (row) => <div><p>{row.requester}</p>{row.on_behalf_of && <p className="mt-0.5 text-[11px] text-teal-600">On behalf of {row.on_behalf_of}</p>}</div> },
    { header: "Amount", align: "right", cell: (row) => <span className="font-semibold tabular-nums">{formatMoney(row.amount, currency ?? row.currency)}</span> },
    { header: "Submitted", cell: (row) => dateTime(row.submitted_at) },
    { header: "Age", cell: (row) => age(row.awaiting_since) },
    { header: "Status", cell: () => <StatusPill status="PENDING_APPROVAL" /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  const closeDrawer = () => {
    const next = new URLSearchParams(params);
    next.delete("approval");
    setParams(next, { replace: true });
  };
  const selectRow = (row: ProcurementApprovalRow) => {
    const next = new URLSearchParams(params);
    next.set("approval", row.id);
    setParams(next, { replace: true });
  };

  return <ProcurementShell>
    <PageShell className="space-y-5 text-black-01">
      <header>
        <div className="flex items-center gap-1.5">
          <h1 className="font-mont text-lg font-semibold text-gray-01">Approvals</h1>
          <InfoHint ariaLabel="About procurement approvals">This queue contains only Procurement documents in the selected entity for which your frozen workflow snapshot can act.</InfoHint>
        </div>
        <p className="mt-0.5 font-mont text-xs text-gray-05">Documents awaiting your decision, routed through the shared approval workflow.</p>
      </header>

      {!entity ? <EmptyState title="Select an entity" message="Choose an entity to view its Procurement approval queue." /> : <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-04" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search document or requester"
                className="h-9 w-full rounded-md border border-white-02 bg-white pl-9 pr-3 font-mont text-sm outline-none focus:border-primary" />
            </label>
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}
              className="h-9 max-w-full rounded-md border border-white-02 bg-white px-3 font-mont text-sm text-gray-01 outline-none focus:border-primary">
              {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <p className="shrink-0 font-mont text-xs text-gray-05">{data?.pagination?.totalItems ?? 0} awaiting action</p>
        </div>

        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id}
          loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch}
          onRowClick={selectRow} page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages}
          onPageChange={setPage} emptyTitle="You’re all caught up" emptyMessage={debouncedSearch || documentType
            ? "No pending approvals match these filters."
            : "No Procurement documents are awaiting your decision in this entity."} />
      </>}
    </PageShell>
    {entity && <ApprovalDrawer id={selectedId} entity={entity} currency={currency} onClose={closeDrawer} />}
  </ProcurementShell>;
}

function ApprovalDrawer({ id, entity, currency, onClose }: {
  id: string | null;
  entity: string;
  currency: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "activity">("overview");
  const [comment, setComment] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  const { data, isLoading, isError, refetch } = useGetProcurementApprovalQuery(
    { id: id!, entity }, { skip: !id, refetchOnMountOrArgChange: true },
  );
  const approval = data?.data;
  const [recordAction, { isLoading: deciding }] = useRecordProcurementApprovalActionMutation();

  // Reset the drawer's local UI when a different approval is opened (render-phase).
  const [uiFor, setUiFor] = useState(id);
  if (uiFor !== id) {
    setUiFor(id);
    setTab("overview");
    setComment("");
    setConfirmReject(false);
  }

  const activeStage = useMemo(() => {
    const active = (approval?.stages ?? []).filter((stage) => stage.status === "ACTIVE");
    return active.sort((left, right) => right.attempt - left.attempt)[0];
  }, [approval]);

  const decide = async (action: ProcurementApprovalAction) => {
    if (!id || ((action === "REJECTED" || action === "RETURNED") && !comment.trim())) return;
    try {
      const response = await recordAction({ id, entity, action, comment: comment.trim() }).unwrap();
      if (action === "RETURNED") toast.success(`Revision requested for ${approval?.reference ?? "document"}.`);
      else if (action === "REJECTED") toast.success(`Rejected ${approval?.reference ?? "document"}.`);
      else if (response.data.status === "APPROVED") toast.success(`${approval?.reference ?? "Document"} fully approved.`);
      else if (response.data.current_stage_label) toast.success(`Approved - moved to ${response.data.current_stage_label}.`);
      else toast.success("Approval recorded; this stage is still awaiting votes.");
      setConfirmReject(false);
      onClose();
    } catch {
      // The API interceptor presents server eligibility/stale-state errors.
    }
  };

  const rejectDescription = activeStage?.on_rejection === "TERMINAL"
    ? "This stage ends the workflow on rejection. The requester cannot revise this instance."
    : "This rejection returns the document to the requester for correction.";

  return <>
    <DetailDrawer open={!!id} onOpenChange={(open) => !open && onClose()}
      title={approval ? <span className="flex flex-wrap items-center gap-2"><span className="text-primary">{approval.reference}</span><StatusPill status="PENDING_APPROVAL" /></span> : "Approval"}
      description={approval?.title ?? "Loading approval details"} widthClass="sm:max-w-[720px]">
      {isLoading ? <LoadingState rows={8} /> : isError || !approval ? <ErrorState message="This approval is no longer available in your queue." onRetry={refetch} /> : <div className="space-y-5">
        <div className="max-w-full overflow-x-auto border-b border-white-02">
          <div className="flex min-w-max gap-5">
            {(["overview", "activity"] as const).map((value) => {
              const Icon = value === "overview" ? FileText : History;
              return <button key={value} onClick={() => setTab(value)} className={cn(
                "flex items-center gap-1.5 border-b-2 py-2.5 font-mont text-xs font-medium capitalize whitespace-nowrap",
                tab === value ? "border-primary text-primary" : "border-transparent text-gray-05",
              )}><Icon className="size-3.5" />{value}</button>;
            })}
          </div>
        </div>

        {tab === "overview" && <ApprovalOverview approval={approval} activeStage={activeStage} currency={currency}
          comment={comment} setComment={setComment} deciding={deciding}
          onApprove={() => decide("APPROVED")} onReturn={() => decide("RETURNED")}
          onReject={() => setConfirmReject(true)} />}
        {tab === "activity" && <ApprovalActivity approval={approval} />}
      </div>}
    </DetailDrawer>

    <ConfirmActionModal open={confirmReject} onOpenChange={setConfirmReject}
      title={`Reject ${approval?.reference ?? "this document"}?`} description={rejectDescription}
      confirmText="Reject Document" destructive loading={deciding} confirmDisabled={!comment.trim()}
      onConfirm={() => decide("REJECTED")}>
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 font-mont text-sm text-red-800">“{comment.trim()}”</div>
    </ConfirmActionModal>
  </>;
}

function ApprovalOverview({ approval, activeStage, currency, comment, setComment, deciding, onApprove, onReturn, onReject }: {
  approval: ProcurementApprovalDetail;
  activeStage?: ProcurementApprovalStage;
  currency: string | null;
  comment: string;
  setComment: (value: string) => void;
  deciding: boolean;
  onApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
}) {
  return <div className="space-y-5">
    <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2 text-amber-900"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><div><p className="font-mont text-sm font-semibold">This document is awaiting your approval</p><p className="mt-0.5 font-mont text-xs">{stageRule(activeStage, approval.next_stage)}</p></div></div>
      <Textarea value={comment} maxLength={500} onChange={(event) => setComment(event.target.value)}
        placeholder="Add a comment (required for revision or rejection)" className="mt-3 min-h-20 bg-white" />
      <p className="mt-1 text-right font-mont text-[11px] text-gray-05">{comment.length} / 500</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button disabled={deciding} onClick={onApprove}><Check className="size-4" /> Approve</Button>
        <Button variant="outline" disabled={deciding || !comment.trim()} onClick={onReturn}><RotateCcw className="size-4" /> Request Revision</Button>
        <Button variant="outline-dest" disabled={deciding || !comment.trim()} onClick={onReject}><X className="size-4" /> Reject</Button>
      </div>
    </section>

    <dl className="grid grid-cols-1 overflow-hidden rounded-md border border-white-02 sm:grid-cols-2">
      <Field label="Document" value={approval.reference} />
      <Field label="Title" value={approval.title} />
      <Field label="Type" value={approval.document_type_label} />
      <Field label="Submitted by" value={approval.requester} />
      <Field label="Amount" value={formatMoney(approval.amount, currency ?? approval.currency)} />
      <Field label="Submitted" value={dateTime(approval.submitted_at)} />
      <Field label="Current stage" value={approval.stage} />
      <Field label="Status" value={<StatusPill status="PENDING_APPROVAL" />} />
    </dl>

    <section>
      <h3 className="font-mont text-sm font-semibold text-gray-01">Approval Trail</h3>
      <div className="mt-3 space-y-3">{approval.stages.map((stage) => <StageCard key={stage.id} stage={stage} />)}</div>
    </section>
  </div>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="border-b border-white-02 px-4 py-3 last:border-b-0 sm:border-r sm:[&:nth-child(even)]:border-r-0">
    <dt className="font-mont text-[11px] text-gray-05">{label}</dt>
    <dd className="mt-1 font-mont text-sm font-semibold tabular-nums text-black-01">{value || "-"}</dd>
  </div>;
}

function stageRule(stage?: ProcurementApprovalStage, next?: ProcurementApprovalDetail["next_stage"]) {
  if (!stage) return "The active workflow stage is being refreshed.";
  const approved = stage.actions.filter((action) => action.action === "APPROVED" && !action.is_reversal && !action.reversed_at && action.attempt === stage.attempt).length;
  const needed = stage.advance_rule === "ANY" ? 1 : stage.advance_rule === "QUORUM" ? Math.max(stage.quorum_count ?? 1, 1) : Math.max(stage.eligible_count, 1);
  const progress = stage.advance_rule === "ANY" ? "One approval clears this stage." : `${approved} of ${needed} approvals recorded.`;
  const nextCopy = next?.is_final ? " Your approval may finalize the workflow." : next?.label ? ` The next stage is ${next.label}.` : "";
  return progress + nextCopy;
}

function StageCard({ stage }: { stage: ProcurementApprovalStage }) {
  const Icon = stage.status === "SKIPPED" ? SkipForward : stage.status === "ACTIVE" ? Clock3 : stage.status === "APPROVED" ? Check : stage.status === "REJECTED" ? X : RotateCcw;
  const liveActions = stage.actions.filter((action) => !action.is_reversal);
  return <div className="rounded-md border border-white-02 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><span className="grid size-7 place-content-center rounded-full bg-primary/10 text-primary"><Icon className="size-3.5" /></span><div><p className="font-mont text-sm font-semibold">{stage.label}</p>{stage.attempt > 1 && <p className="font-mont text-[11px] text-gray-05">Attempt {stage.attempt}</p>}</div></div>
      <StatusPill status={stage.status} />
    </div>
    <p className="mt-2 font-mont text-xs text-gray-05">{stage.advance_rule === "ANY" ? "Any eligible approver" : stage.advance_rule === "QUORUM" ? `Quorum of ${stage.quorum_count ?? 1}` : `All ${stage.eligible_count} eligible approvers`}</p>
    {stage.skip_reason && <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 font-mont text-xs text-gray-05">Skipped: {stage.skip_reason.replaceAll("_", " ")}</p>}
    {liveActions.length > 0 && <div className="mt-3 space-y-2 border-t border-white-02 pt-3">{liveActions.map((action) => <div key={action.id} className="font-mont text-xs"><p className="font-medium text-black-01">{action.actor} · {action.action.toLowerCase()}{action.on_behalf_of ? ` for ${action.on_behalf_of}` : ""}</p>{action.comment && <p className="mt-1 rounded-md bg-gray-50 px-3 py-2 text-gray-05">“{action.comment}”</p>}</div>)}</div>}
  </div>;
}

function ApprovalActivity({ approval }: { approval: ProcurementApprovalDetail }) {
  if (!approval.activity.length) return <EmptyState title="No activity yet" message="Workflow events will appear here as the approval advances." />;
  return <ol className="relative space-y-4">{approval.activity.map((event, index) => <li key={event.id} className="relative flex gap-3">
    {index !== approval.activity.length - 1 && <span className="absolute left-[5px] top-3.5 h-full w-px bg-gray-03" />}
    <span className="relative z-10 mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
    <div className="min-w-0 flex-1"><p className="font-mont text-sm font-medium text-black-01">{event.event_type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</p>{event.message && <p className="mt-0.5 font-mont text-xs text-gray-05">{event.message}</p>}<p className="mt-0.5 font-mont text-[11px] text-gray-05">{event.actor || "System"} · {dateTime(event.occurred_at)}</p></div>
  </li>)}</ol>;
}
