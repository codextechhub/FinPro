import { useEffect, useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Check, ChevronRight, Clock3, FilePenLine, FileText, Plus,
  RotateCcw, Search, Send, Trash2, TrendingDown, TrendingUp, X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { ProcurementShell } from "./procurement-shell";
import { useUserDirectory } from "../../components/workflow/use-user-directory";
import { sameId } from "../../components/workflow/workflow-format";
import { SearchSelect } from "@/components/custom/search-select";
import {
  DataTable, DetailDrawer, EmptyState, ErrorState, FormField, InfoHint, LoadingState,
  MoneyInput, StatCard, StatusPill, toArray, useActiveEntity, type Column,
} from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { QuickExportButton } from "../../host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "@/permissions";
import { useAppSelector } from "@/redux/store";
import {
  useCreateRequisitionMutation, useGetCatalogItemsQuery,
  useGetRequisitionBudgetAvailabilityQuery, useGetRequisitionQuery,
  useGetRequisitionSummaryQuery, useGetRequisitionsQuery,
  useSubmitRequisitionMutation, useUpdateRequisitionMutation,
} from "@/redux/services/procurement/procurement-api";
import type { Requisition } from "@/redux/services/procurement/procurement-types";
import {
  useGetWorkflowInstanceQuery, useRecordWorkflowActionMutation,
} from "@/redux/services/dashboard/workflow-api";
import type { VoteAction } from "@/redux/services/dashboard/workflow-types";
import { useGetCostCentersQuery } from "@/redux/services/finance/setup-api";
import { routesPath } from "@/routes/routes-path";
import { formatMoney } from "@/utils/money";
import { formatQuantity } from "@/utils/quantity";
import { sourceDocumentIdFromParams } from "@/lib/source-document-route";
import { PageShell } from "@/components/layout/page-shell";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Rejected", value: "REJECTED" },
];

function displayStatus(row: Requisition) {
  return row.approval_state === "REJECTED" ? "REJECTED" : row.status;
}

function shortDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function age(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : `${formatDistanceToNowStrict(date)} ago`;
}

export default function RequisitionsPage() {
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
    const normalizedSearch = search.trim();
    if (!normalizedSearch) return;
    const timer = window.setTimeout(() => setDebouncedSearch(normalizedSearch), 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  // Clearing the field must immediately restore the unfiltered query instead of
  // waiting on the typing delay - adjust during render.
  if (!search.trim() && debouncedSearch !== "") setDebouncedSearch("");

  const params = useMemo(() => ({
    entity: entity!, page, ...(status ? { status } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [entity, page, status, debouncedSearch]);
  const { currentData: data, isLoading, isFetching, isError, refetch } = useGetRequisitionsQuery(
    params, { skip: !entity },
  );
  const { data: summaryData, isLoading: summaryLoading } = useGetRequisitionSummaryQuery(
    { entity: entity! }, { skip: !entity },
  );
  const rows = toArray(data?.data);
  const pg = data?.pagination;
  const summary = summaryData?.data;
  const money = (value: number) => formatMoney(value, currency);

  const columns: Column<Requisition>[] = [
    {
      header: "Req #",
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-mont text-xs font-semibold text-primary">{r.document_number}</p>
          <p className="mt-1 max-w-64 truncate font-mont text-sm font-semibold text-black-01">
            {r.title || "Untitled requisition"}
          </p>
          <p className="mt-0.5 font-mont text-[11px] text-gray-05">{r.cost_center_name || "No cost centre"}</p>
        </div>
      ),
    },
    { header: "Requested by", cell: (r) => r.requested_by_name },
    {
      header: "Date",
      cell: (r) => <div><p>{shortDate(r.request_date)}</p><p className="mt-0.5 text-[11px] text-gray-05">{age(r.created_at)}</p></div>,
    },
    { header: "Amount", align: "right", cell: (r) => <span className="tabular-nums">{money(r.estimated_total)}</span> },
    { header: "Status", cell: (r) => <StatusPill status={displayStatus(r)} /> },
    { header: "", align: "right", cell: () => <ChevronRight className="ml-auto size-4 text-gray-04" /> },
  ];

  // Money KPI: percentage swing against the comparable prior period (null when
  // there is no prior spend to divide by).
  const change = (value: number | null | undefined) => value == null ? (
    <span>No prior MTD comparison</span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 font-semibold", value >= 0 ? "text-green-01" : "text-destructive")}>
      {value >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {value > 0 ? "+" : ""}{value}% <span className="font-normal text-gray-05">vs prior MTD</span>
    </span>
  );

  // Count KPI: an absolute integer delta - a percentage on a small count reads as
  // noise, and a zero prior month is a real comparison, not a missing one.
  const countChange = (value: number) => value === 0 ? (
    <span className="text-gray-05">No change vs prior month</span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 font-semibold", value > 0 ? "text-green-01" : "text-destructive")}>
      {value > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {value > 0 ? "+" : ""}{value} <span className="font-normal text-gray-05">vs prior month</span>
    </span>
  );

  if (!entity) return <ProcurementShell><PageShell><EmptyState title="Select an entity" message="Choose an entity to view its requisitions." /></PageShell></ProcurementShell>;

  return (
    <ProcurementShell>
      <PageShell className="space-y-5 text-black-01">
        <header data-guide="procurement-requisitions.heading" className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-mont text-lg font-semibold text-gray-01">Purchase Requisitions</h1>
              <InfoHint ariaLabel="About requisitions">A requisition is an internal request to buy to goods and services. It becomes a purchase order only after approval.</InfoHint>
            </div>
            <p className="mt-0.5 font-mont text-xs text-gray-05">Create, track, and approve internal purchase requests.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickExportButton
              screen="procurement.requisitions"
              params={{ status, search: debouncedSearch }}
              entity={entity}
              typeface="geist"
              defaultName="Purchase requisitions"
            />
            <Can permission={P.PROC_CREATE_REQUISITION}>
              <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New Requisition</Button>
            </Can>
          </div>
        </header>

        <div data-guide="procurement-requisitions.summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryLoading || !summary ? <div className={cn(INFORMATION_CARD_SURFACE, "col-span-full rounded-md")}><LoadingState rows={2} /></div> : <>
            <StatCard label="Pending Approval" value={summary.pending_approval.count} icon={Clock3} tone="amber" sub={money(summary.pending_approval.amount)} />
            <StatCard label="Approved (MTD)" value={summary.approved_mtd.count} icon={Check} tone="green" sub={countChange(summary.approved_mtd.change)} />
            <StatCard label="Draft" value={summary.draft.count} icon={FilePenLine} tone="gray" sub={money(summary.draft.amount)} />
            <StatCard label="Total Value (MTD)" value={money(summary.total_value_mtd.amount)} icon={FileText} sub={change(summary.total_value_mtd.change_pct)} />
          </>}
        </div>

        <section data-guide="procurement-requisitions.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white-02 px-4">
            <div className="max-w-full overflow-x-auto">
              <div className="flex min-w-max gap-5">
                {STATUS_TABS.map((tab) => (
                  <button key={tab.value || "all"} type="button" onClick={() => { setStatus(tab.value); setPage(1); }}
                    className={cn("border-b-2 px-0.5 py-3 font-mont text-xs font-medium whitespace-nowrap", status === tab.value ? "border-primary text-primary" : "border-transparent text-gray-05 hover:text-black-01")}
                  >{tab.label}</button>
                ))}
              </div>
            </div>
            <div className="flex w-full items-center py-2 sm:ml-auto sm:w-auto">
              <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-05" />
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search requisitions" className="h-9 bg-white pl-9" />
              </label>
            </div>
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id}
            loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={(r) => setSelectedId(r.id)}
            page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
            emptyTitle={status ? `No ${STATUS_TABS.find((t) => t.value === status)?.label.toLowerCase()} requisitions` : "No requisitions yet"}
            emptyMessage={debouncedSearch ? "Try a different search term or status." : "New requisitions will appear here."}
          />
        </section>
      </PageShell>

      <RequisitionDrawer key={selectedId ?? "closed"} id={selectedId} entity={entity} currency={currency} onClose={() => setSelectedId(null)} />
      {creating && <RequisitionForm open onClose={() => setCreating(false)} entity={entity} currency={currency} />}
    </ProcurementShell>
  );
}

function RequisitionDrawer({ id, entity, currency, onClose }: {
  id: number | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const uid = user?.id == null ? "" : String(user.id);
  const { name } = useUserDirectory();
  const [tab, setTab] = useState<"overview" | "lines" | "approval" | "activity">("overview");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const { data, isLoading, isError, refetch } = useGetRequisitionQuery(
    { id: id!, entity }, { skip: id == null },
  );
  const req = data?.data;
  const workflowId = req?.workflow_instance_id ?? "";
  const { data: workflow } = useGetWorkflowInstanceQuery(workflowId, { skip: !workflowId });
  const [recordAction, { isLoading: voting }] = useRecordWorkflowActionMutation();
  const [submitRequisition, { isLoading: submitting }] = useSubmitRequisitionMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "requisition" });

  const activeStage = useMemo(() => {
    const stages = (workflow?.stage_instances ?? []).filter((stage) => stage.status === "ACTIVE");
    return stages.length ? stages.reduce((latest, stage) => stage.attempt > latest.attempt ? stage : latest) : undefined;
  }, [workflow]);
  const canVote = !!activeStage && workflow?.status === "IN_PROGRESS"
    && activeStage.eligible_approvers.some((approver) => sameId(approver.user, uid) && approver.attempt === activeStage.attempt)
    && !activeStage.actions.some((action) => sameId(action.actor, uid) && !action.reversed_at && !action.is_reversal_of && action.attempt === activeStage.attempt);

  const vote = async (action: VoteAction) => {
    if (!workflowId || ((action === "REJECTED" || action === "RETURNED") && !comment.trim())) return;
    try {
      await recordAction({ id: workflowId, action, comment: comment.trim() }).unwrap();
      toast.success(action === "APPROVED" ? "Approval recorded." : action === "RETURNED" ? "Revision requested." : "Requisition rejected.");
      setComment("");
      // The mutation invalidates WorkflowInstances + ProcRequisitions, so the
      // workflow panel, this drawer, the list and the KPI summary all refetch.
    } catch { /* Central API handling shows the server message. */ }
  };

  const submit = async () => {
    if (!req) return;
    try {
      const r = await submitRequisition({ id: req.id, entity }).unwrap();
      toast.success("Requisition submitted for approval.");
      // Nobody may hold the approving permission, leaving it submitted but stuck.
      promptIfParked(r.data?.approval);
      // submitRequisition invalidates ProcRequisitions; this drawer's detail query
      // (and the list/summary) refetch from that tag rather than a manual call.
    } catch { /* Central API handling shows the server message. */ }
  };

  return (
    <>
      <DetailDrawer open={id != null} onOpenChange={(open) => !open && onClose()} widthClass="sm:max-w-[638px]"
        title={req?.title || req?.document_number || "Requisition"}
        description={req ? `${req.document_number} · ${req.requested_by_name} · ${req.cost_center_name || "No cost centre"}` : "Loading requisition"}
        footer={req && <>
          {req.status === "DRAFT" && <Can permission={P.PROC_UPDATE_REQUISITION}><Button variant="outline" onClick={() => setEditing(true)}><FilePenLine className="size-4" /> Edit</Button></Can>}
          {req.status === "DRAFT" && <Can permission={P.PROC_SUBMIT_REQUISITION}><Button loading={submitting} onClick={submit}><Send className="size-4" /> Submit for Approval</Button></Can>}
        </>}
      >
        {isLoading ? <LoadingState rows={7} /> : isError || !req ? <ErrorState onRetry={refetch} /> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusPill status={displayStatus(req)} />
              <p className="font-mont text-lg font-semibold tabular-nums text-black-01">{formatMoney(req.estimated_total, currency)}</p>
            </div>
            <div className="max-w-full overflow-x-auto border-b border-white-02">
              <div className="flex min-w-max gap-5">
                {(["overview", "lines", "approval", "activity"] as const).map((value) => (
                  <button key={value} onClick={() => setTab(value)} className={cn("border-b-2 py-2.5 font-mont text-xs font-medium capitalize", tab === value ? "border-primary text-primary" : "border-transparent text-gray-05")}>{value === "lines" ? "Line Items" : value === "approval" ? "Approval Trail" : value}</button>
                ))}
              </div>
            </div>

            {tab === "overview" && <div className="space-y-5">
              {req.status === "PENDING_APPROVAL" && (
                <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="font-mont text-sm font-semibold text-amber-900">{canVote ? "Your approval is required" : activeStage ? `Awaiting ${activeStage.stage_label}` : "Approval in progress"}</p>
                  <p className="mt-1 font-mont text-xs text-amber-800">{canVote ? "Review the request and record your decision below." : "Open the approval workflow to see who owns the current step."}</p>
                  {canVote ? <>
                    <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment (required for revision or rejection)" className="mt-3 min-h-20 bg-white" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" loading={voting} onClick={() => vote("APPROVED")}><Check className="size-4" /> Approve</Button>
                      <Button size="sm" variant="outline" disabled={!comment.trim() || voting} onClick={() => vote("RETURNED")}><RotateCcw className="size-4" /> Request Revision</Button>
                      <Button size="sm" variant="outline-dest" disabled={!comment.trim() || voting} onClick={() => vote("REJECTED")}><X className="size-4" /> Reject</Button>
                    </div>
                  </> : workflowId && <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate(routesPath.PROTECTED.WORKFLOW.INSTANCE_DETAIL(workflowId))}>Open approval workflow <ChevronRight className="size-4" /></Button>}
                </section>
              )}
              <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
                <Info label="Requested by" value={req.requested_by_name} />
                <Info label="Cost Centre" value={req.cost_center_name || "Not assigned"} />
                <Info label="Request date" value={shortDate(req.request_date)} />
                <Info label="Needed by" value={shortDate(req.needed_by)} />
              </dl>
              <div><p className="font-mont text-xs font-semibold text-gray-05">Business case</p><p className="mt-2 font-mont text-sm leading-6 text-black-01">{req.justification || "No business case was provided."}</p></div>
            </div>}

            {tab === "lines" && (req.lines.length ? <div className="space-y-2">
              {req.lines.map((line) => <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-md border border-white-02 p-3">
                <div className="min-w-0"><p className="truncate font-mont text-sm font-semibold text-black-01">{line.description}</p><p className="mt-1 font-mont text-xs text-gray-05">{formatQuantity(line.quantity)} {line.unit} × {formatMoney(line.estimated_unit_price, currency)}</p></div>
                <p className="font-mont text-sm font-semibold tabular-nums">{formatMoney(line.estimated_line_total, currency)}</p>
              </div>)}
            </div> : <EmptyBlock text="No line items were added." />)}

            {tab === "approval" && (workflow?.stage_instances.length ? <div className="space-y-3">
              {workflow.stage_instances.map((stage) => <div key={stage.id} className="rounded-md border border-white-02 p-3">
                <div className="flex items-center justify-between gap-3"><p className="font-mont text-sm font-semibold">{stage.stage_label}</p><StatusPill status={stage.status} /></div>
                {stage.actions.length ? <div className="mt-3 space-y-2">{stage.actions.filter((action) => !action.is_reversal_of).map((action) => <div key={action.id} className="border-t border-white-02 pt-2 font-mont text-xs"><p><span className="font-semibold">{name(action.actor)}</span> · {action.action.toLowerCase()}</p><p className="mt-0.5 text-gray-05">{action.comment || "No comment"} · {age(action.acted_at)}</p></div>)}</div> : <p className="mt-2 font-mont text-xs text-gray-05">No decision recorded for this step.</p>}
              </div>)}
            </div> : <EmptyBlock text={req.status === "DRAFT" ? "Submit this draft to start its approval trail." : "No approval trail is available."} />)}

            {tab === "activity" && (workflow?.audit_logs.length ? <div className="divide-y divide-white-02">
              {workflow.audit_logs.map((log) => <div key={log.id} className="py-3 first:pt-0"><p className="font-mont text-sm font-medium">{log.message || log.event_type.replaceAll("_", " ").toLowerCase()}</p><p className="mt-1 font-mont text-xs text-gray-05">{log.actor ? name(log.actor) : "System"} · {age(log.occurred_at)}</p></div>)}
            </div> : <EmptyBlock text="No workflow activity has been recorded yet." />)}
          </div>
        )}
        {noApproverDialog}
      </DetailDrawer>
      {req && editing && <RequisitionForm open onClose={() => setEditing(false)} entity={entity} currency={currency} initial={req} onSaved={refetch} />}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-mont text-xs text-gray-05">{label}</dt><dd className="mt-1 font-mont text-sm font-semibold text-black-01">{value}</dd></div>;
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-white-02 px-4 text-center font-mont text-xs text-gray-05">{text}</div>;
}

type FormLine = { catalogItem: string; description: string; quantity: number; unit: string; unitPriceKobo: number };
const blankLine = (): FormLine => ({ catalogItem: "", description: "", quantity: 1, unit: "Unit", unitPriceKobo: 0 });

function RequisitionForm({ open, onClose, entity, currency, initial, onSaved }: {
  open: boolean; onClose: () => void; entity: string; currency?: string | null;
  initial?: Requisition; onSaved?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [costCenter, setCostCenter] = useState(initial?.cost_center_code ?? "");
  const [requestDate, setRequestDate] = useState(initial?.request_date ?? new Date().toISOString().slice(0, 10));
  const [neededBy, setNeededBy] = useState(initial?.needed_by ?? "");
  const [justification, setJustification] = useState(initial?.justification ?? "");
  const [lines, setLines] = useState<FormLine[]>(initial?.lines.length ? initial.lines.map((line) => ({
    catalogItem: line.catalog_item_id ? String(line.catalog_item_id) : "",
    description: line.description, quantity: Number(line.quantity), unit: line.unit,
    unitPriceKobo: line.estimated_unit_price,
  })) : [blankLine()]);
  const [create, { isLoading: creating }] = useCreateRequisitionMutation();
  const [update, { isLoading: updating }] = useUpdateRequisitionMutation();
  const [submitReq, { isLoading: submitting }] = useSubmitRequisitionMutation();
  const { data: costCenterData } = useGetCostCentersQuery({ entity, is_active: true });
  const { data: catalogData, isLoading: catalogLoading } = useGetCatalogItemsQuery({ entity, page_size: 100 });
  const { data: budgetData, isFetching: budgetLoading } = useGetRequisitionBudgetAvailabilityQuery(
    { entity, cost_center: costCenter, date: requestDate }, { skip: !costCenter },
  );
  const saving = creating || updating || submitting;

  const catalog = toArray(catalogData?.data);
  const costCenters = toArray(costCenterData?.data).map((center) => ({ value: center.code, label: `${center.code} - ${center.name}` }));
  const catalogOptions = catalog.map((item) => ({ value: String(item.id), label: `${item.code} - ${item.name}` }));
  const apiLines = lines.filter((line) => line.description.trim() && line.quantity > 0).map((line, index) => ({
    line_no: index + 1, ...(line.catalogItem ? { catalog_item: line.catalogItem } : {}),
    description: line.description.trim(), quantity: line.quantity, unit: line.unit.trim() || "Unit",
    estimated_unit_price: line.unitPriceKobo,
  }));
  const estimate = apiLines.reduce((total, line) => total + Math.round(line.quantity * line.estimated_unit_price), 0);
  const canSave = !!title.trim() && !!requestDate && apiLines.length > 0;

  const setLine = (index: number, patch: Partial<FormLine>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const chooseCatalog = (index: number, id: string) => {
    const item = catalog.find((candidate) => String(candidate.id) === id);
    setLine(index, item ? {
      catalogItem: id, description: item.description || item.name,
      unit: item.unit_of_measure || "Unit", unitPriceKobo: item.standard_unit_price,
    } : { catalogItem: "" });
  };

  const save = async (submitAfter: boolean) => {
    if (!canSave) return;
    try {
      let id = initial?.id;
      if (initial) {
        await update({ id: initial.id, entity, title: title.trim(), cost_center: costCenter || undefined, request_date: requestDate, needed_by: neededBy || undefined, justification: justification.trim(), lines: apiLines }).unwrap();
      } else {
        const response = await create({ entity, title: title.trim(), cost_center: costCenter || undefined, request_date: requestDate, needed_by: neededBy || undefined, justification: justification.trim(), lines: apiLines }).unwrap();
        id = response.data.id;
      }
      if (submitAfter && id) await submitReq({ id, entity }).unwrap();
      toast.success(submitAfter ? "Requisition created and submitted." : initial ? "Draft updated." : "Draft saved.");
      onSaved?.();
      onClose();
    } catch { /* Central API handling shows the server message. */ }
  };

  const budget = budgetData?.data;
  return (
    <DetailDrawer
      open={open}
      onOpenChange={(value) => !saving && !value && onClose()}
      widthClass="sm:max-w-[760px]"
      title={initial ? "Edit Requisition" : "New Requisition"}
      description="Capture the request details and estimated line costs."
      footer={<>
        <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button variant="outline" disabled={!canSave} loading={creating || updating} onClick={() => save(false)}>Save Draft</Button>
        {!initial && <Button disabled={!canSave} loading={saving} onClick={() => save(true)}>Create Requisition</Button>}
      </>}
    >
      <div className="space-y-5">
        <section className="rounded-md border border-white-02 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mont text-sm font-semibold">Budget Availability</p><span className="font-mont text-xs text-gray-05">{budget?.period || "Select a cost centre"}</span></div>
          {!costCenter ? <p className="mt-2 font-mont text-xs text-gray-05">Choose a cost centre to check its approved budget and current commitments.</p>
            : budgetLoading ? <p className="mt-2 font-mont text-xs text-gray-05">Checking budget…</p>
            : !budget?.has_budget ? <p className="mt-2 font-mont text-xs text-gray-05">No approved budget is configured for this cost centre and period.</p>
            : <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <BudgetStat label="Approved budget" value={formatMoney(budget.budget, currency)} />
              <BudgetStat label="PO commitments" value={formatMoney(budget.committed, currency)} />
              <BudgetStat label="Available" value={formatMoney(budget.available, currency)} tone={budget.available < estimate ? "danger" : "good"} />
            </div>}
        </section>

        <section className="space-y-3">
          <p className="font-mont text-sm font-semibold">Request Details</p>
          <FormField label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is being requested?" /></FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Cost Centre"><SearchSelect options={costCenters} value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="Select cost centre" /></FormField>
            <FormField label="Request date" required><Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} /></FormField>
            <FormField label="Needed by"><Input type="date" min={requestDate} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></FormField>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3"><p className="font-mont text-sm font-semibold">Line Items</p><p className="font-mont text-sm font-semibold tabular-nums">Est. {formatMoney(estimate, currency)}</p></div>
          <div className="space-y-3">
            {lines.map((line, index) => <div key={index} className="rounded-md border border-white-02 p-3">
              <div className="mb-2 flex items-center justify-between"><p className="font-mont text-xs font-semibold text-gray-05">Item {index + 1}</p><button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="text-gray-05 hover:text-destructive disabled:opacity-30"><Trash2 className="size-4" /></button></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.5fr)_80px_100px_minmax(130px,0.7fr)]">
                <div className="space-y-2"><SearchSelect options={catalogOptions} loading={catalogLoading} value={line.catalogItem} onChange={(e) => chooseCatalog(index, e.target.value)} placeholder="Catalog item (optional)" /><Input value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} placeholder="Item description" /></div>
                <Input type="number" min={0.0001} step="any" value={line.quantity} onChange={(e) => setLine(index, { quantity: Number(e.target.value) })} aria-label="Quantity" />
                <Input value={line.unit} onChange={(e) => setLine(index, { unit: e.target.value })} placeholder="Unit" aria-label="Unit" />
                <MoneyInput valueKobo={line.unitPriceKobo} onChangeKobo={(value) => setLine(index, { unitPriceKobo: value })} currency={currency} />
              </div>
            </div>)}
          </div>
          <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, blankLine()])}><Plus className="size-4" /> Add line</Button>
        </section>

        <FormField label="Business case"><Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Explain why this purchase is needed" className="min-h-24" /></FormField>
      </div>
    </DetailDrawer>
  );
}

function BudgetStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "danger" }) {
  return <div><p className="font-mont text-[11px] text-gray-05">{label}</p><p className={cn("mt-1 font-mont text-sm font-semibold tabular-nums", tone === "good" && "text-green-01", tone === "danger" && "text-destructive")}>{value}</p></div>;
}
