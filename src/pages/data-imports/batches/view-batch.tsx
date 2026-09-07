import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Check, AlertTriangle, Download, Play, RefreshCw, Trash2, Inbox, ChevronRight, ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PermissionGate from "@/components/custom/permission-gate";
import PageAccessDenied from "@/components/custom/page-access-denied";
import PromptModal from "@/components/modal/prompt-modal";
import { P } from "@/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { routesPath } from "@/routes/routes-path";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { toast } from "sonner";
import { formatRelativeDate } from "@/utils/helpers";
import {
  useGetImportBatchQuery,
  useDeleteImportBatchMutation,
  useValidateImportBatchMutation,
  useStartImportBatchMutation,
  useGetImportJobsQuery,
  importDownloadUrls,
} from "@/redux/services/dashboard/import-api";
import type { ImportBatch } from "@/redux/services/dashboard/import-types";
import { IN_FLIGHT, STATUS_BADGE, STATUS_LABEL } from "./components/batch-status";
import { formatBytes } from "@/utils/format-bytes";
import { unwrap, triggerBlobDownload } from "./components/batch-utils";
import { PipelineTimeline } from "./components/pipeline-timeline";
import { IssuesTab } from "./components/issues-tab";
import { JobsTab } from "./components/jobs-tab";
import { RowResultsTab } from "./components/row-results-tab";
import { AuditLogsTab } from "./components/audit-logs-tab";
import { NotificationsTab } from "./components/notifications-tab";
import { PageShell } from "@/components/layout/page-shell";

// ── Main page ────────────────────────────────────────────────────────────────

type TabKey = "issues" | "jobs" | "rows" | "audit" | "notifications";

export default function ViewBatch() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const batchId = Number(id);
  const { hasPermission } = usePermissions();

  const canViewBatch = hasPermission(P.VIEW_IMPORT_BATCHES);
  const canViewIssues = hasPermission(P.VIEW_IMPORT_ISSUES);
  const canViewJobs = hasPermission(P.VIEW_IMPORT_JOBS);
  const canViewAudit = hasPermission(P.VIEW_IMPORT_AUDIT);
  const canViewNotifications = hasPermission(P.VIEW_IMPORT_NOTIFICATIONS);

  const visibleTabKeys = useMemo<TabKey[]>(() => {
    const keys: TabKey[] = [];
    if (canViewIssues) keys.push("issues");
    if (canViewJobs) keys.push("jobs", "rows");
    if (canViewAudit) keys.push("audit");
    if (canViewNotifications) keys.push("notifications");
    return keys;
  }, [canViewIssues, canViewJobs, canViewAudit, canViewNotifications]);

  const [tab, setTab] = useState<TabKey>(() => {
    if (canViewIssues) return "issues";
    if (canViewJobs) return "jobs";
    if (canViewAudit) return "audit";
    if (canViewNotifications) return "notifications";
    return "issues";
  });
  const [confirm, setConfirm] = useState<"validate" | "start" | "delete" | null>(null);
  const [isDeleted, setIsDeleted] = useState(false);

  const { data, isLoading, isError, refetch } = useGetImportBatchQuery(batchId, {
    refetchOnMountOrArgChange: true,
    skip: !batchId || isNaN(batchId) || !canViewBatch || isDeleted,
  });

  const batch = unwrap<ImportBatch>(data);

  // Reset tab to first visible if current tab is no longer accessible
  // (guarded render-phase adjustment - no effect needed).
  if (visibleTabKeys.length > 0 && !visibleTabKeys.includes(tab)) {
    setTab(visibleTabKeys[0]);
  }

  // Auto-poll while batch is in flight.
  useEffect(() => {
    if (!batch) return;
    if (!IN_FLIGHT.has(batch.status)) return;
    const interval = setInterval(() => refetch(), 5000);
    return () => clearInterval(interval);
  }, [batch, refetch]);

  const [validate, { isLoading: validating }] = useValidateImportBatchMutation();
  const [startImport, { isLoading: starting }] = useStartImportBatchMutation();
  const [deleteBatch, { isLoading: deleting }] = useDeleteImportBatchMutation();

  // Latest job lookup for Row Results tab (only when user can view jobs).
  const { data: jobsData } = useGetImportJobsQuery({ batchId }, { skip: !batch || !canViewJobs });
  const latestJob = jobsData?.data?.[0] ?? null;

  if (!canViewBatch) {
    return (
      <PageAccessDenied
        onBack={() => navigate(routesPath.PROTECTED.DATA_IMPORTS.BATCHES.INDEX)}
      />
    );
  }

  if (!batchId || isNaN(batchId)) {
    return (
      <>
        <div className="flex h-96 items-center justify-center">
          <p className="text-sm text-destructive">Invalid batch id.</p>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <div className="flex h-96 items-center justify-center"><div className="loader" /></div>
      </>
    );
  }

  if (isError || !batch) {
    return (
      <>
        <div className="flex h-96 flex-col items-center justify-center gap-3">
          <p className="text-sm text-destructive">Batch not found or you don't have access.</p>
          <Button variant="white" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      </>
    );
  }

  const isInFlight = IN_FLIGHT.has(batch.status);
  const canValidate = !isInFlight && ["uploaded", "validation_failed", "mapping_required"].includes(batch.status);
  const canStart = batch.is_ready_for_import && !isInFlight && batch.status === "ready_to_import";

  const handleValidate = async () => {
    try {
      await validate({ id: batchId }).unwrap();
      toast.success("Validation completed.");
      refetch();
    } catch { /* interceptor shows the toast */ }
    setConfirm(null);
  };

  const handleStart = async () => {
    try {
      await startImport({ id: batchId, body: { run_async: true } }).unwrap();
      // The mutation's onQueryStarted announces the queued job - toasting here
      // too would double it.
      refetch();
    } catch { /* interceptor shows the toast */ }
    setConfirm(null);
  };

  const handleDelete = async () => {
    setIsDeleted(true);
    try {
      await deleteBatch(batchId).unwrap();
      toast.success("Batch deleted.");
      navigate(routesPath.PROTECTED.DATA_IMPORTS.BATCHES.INDEX);
    } catch {
      setIsDeleted(false);
    }
  };

  const allTabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "issues", label: "Issues", count: batch.error_count + batch.warning_count },
    { key: "jobs", label: "Jobs" },
    { key: "rows", label: "Row Results" },
    { key: "audit", label: "Audit" },
    { key: "notifications", label: "Notifications" },
  ];
  const tabs = allTabs.filter((t) => visibleTabKeys.includes(t.key));

  return (
    <>
      <PageShell className="text-black-01 space-y-5 max-w-6xl">
        {/* Header card */}
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-5")} data-guide="data-import-batch.detail">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-gray-01 mb-1">
                <span>Batches</span>
                <ChevronRight className="size-3" />
                <span className="font-mono">#{batch.id}</span>
              </div>
              <h1 className="text-lg font-semibold font-mont text-black-01 truncate">
                {batch.original_filename}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-01">
                <span className="capitalize">{batch.dataset_type}</span>
                <span>·</span>
                <span className="font-mono uppercase">{batch.file_format}</span>
                <span>·</span>
                <span>{formatBytes(batch.file_size_bytes)}</span>
                {batch.school?.name && (
                  <>
                    <span>·</span>
                    <span>{batch.school.name}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {isInFlight && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded-md">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Auto-refreshing
                </div>
              )}
              <Badge variant={STATUS_BADGE[batch.status]} className="capitalize">
                {STATUS_LABEL[batch.status]}
              </Badge>
            </div>
          </div>

          {/* Pipeline */}
          <PipelineTimeline status={batch.status} />

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap border-t border-white-02 pt-4">
            <Button variant="white" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <PermissionGate permission={P.RUN_IMPORT_VALIDATION}>
              <Button
                size="sm"
                onClick={() => setConfirm("validate")}
                disabled={!canValidate || validating}
                title={canValidate ? "" : "Cannot validate from current state"}
              >
                <ShieldAlert className="size-3.5" /> {validating ? "Validating…" : "Validate"}
              </Button>
            </PermissionGate>
            <PermissionGate permission={P.EXECUTE_IMPORT_BATCH}>
              <Button
                size="sm"
                onClick={() => setConfirm("start")}
                disabled={!canStart || starting}
                title={canStart ? "" : batch.has_critical_errors ? "Resolve critical errors first" : "Batch not ready"}
              >
                <Play className="size-3.5" /> {starting ? "Starting…" : "Start Import"}
              </Button>
            </PermissionGate>
            {batch.file && (
              <button
                type="button"
                onClick={() => triggerBlobDownload(importDownloadUrls.batchFileDownload(batch.id), batch.original_filename)}
                className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md border border-gray-200 bg-white hover:bg-gray-50"
              >
                <Download className="size-3.5" /> Download original
              </button>
            )}
            <div className="flex-1" />
            <PermissionGate permission={P.DELETE_IMPORT_BATCH}>
              <Button
                variant="white"
                size="sm"
                className="text-destructive hover:bg-destructive/5"
                disabled={isInFlight}
                onClick={() => setConfirm("delete")}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Import failure banner */}
        {(batch.status === "import_failed" || batch.status === "import_partial") && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-destructive">
                {batch.status === "import_failed" ? "Import failed" : "Import partially completed"}
              </p>
              <p className="text-[11px] text-destructive/80 mt-0.5">
                Validation passed with no issues. The failure occurred during the import execution - check the <strong>Jobs</strong> tab for the error details.
              </p>
            </div>
          </div>
        )}

        {/* Two-column meta + summary */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
          {/* Validation summary */}
          <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")} data-guide="data-import-batch.validation-summary">
            <p className="text-sm font-semibold font-mont text-black-01 border-b border-white-02 pb-3">
              Validation Summary
            </p>
            {batch.validation_summary == null ? (
              <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                <ShieldAlert className="size-8 text-gray-300" />
                <p className="text-xs text-gray--01 font-medium">Not yet validated</p>
                <p className="text-[11px] text-gray-01">Run validation to see the results here.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <StatBlock label="Total Rows" value={batch.total_rows.toLocaleString()} />
                  <StatBlock label="Columns" value={batch.total_columns.toLocaleString()} />
                  <StatBlock
                    label="Errors"
                    value={String((batch.validation_summary as Record<string, number>).error_count ?? batch.error_count)}
                    accent={(batch.validation_summary as Record<string, number>).error_count > 0 ? "destructive" : undefined}
                  />
                  <StatBlock
                    label="Warnings"
                    value={String((batch.validation_summary as Record<string, number>).warning_count ?? batch.warning_count)}
                    accent={(batch.validation_summary as Record<string, number>).warning_count > 0 ? "warning" : undefined}
                  />
                  <StatBlock
                    label="Info"
                    value={String((batch.validation_summary as Record<string, number>).info_count ?? 0)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
                  <ReadyChip label="Structure matches template" ok={batch.structure_matches_template} />
                  <ReadyChip label="No critical errors" ok={!batch.has_critical_errors} />
                  <ReadyChip label="Ready for import" ok={batch.is_ready_for_import} />
                </div>

                {(batch.validation_started_at || batch.validation_completed_at) && (
                  <div className="text-[10px] text-gray-400 flex gap-4 pt-2">
                    {batch.validation_started_at && (
                      <span>Started: {new Date(batch.validation_started_at).toLocaleString()}</span>
                    )}
                    {batch.validation_completed_at && (
                      <span>Completed: {new Date(batch.validation_completed_at).toLocaleString()}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Side meta */}
          <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
            <p className="text-sm font-semibold font-mont text-black-01 border-b border-white-02 pb-3">
              Metadata
            </p>
            <MetaRow label="Template">
              {batch.template ? (
                <div>
                  <p className="font-mono text-xs font-medium">{batch.template.code}</p>
                  <p className="text-[10px] text-gray-01">{batch.template.name}</p>
                </div>
              ) : <span className="text-xs text-gray-01">-</span>}
            </MetaRow>
            <MetaRow label="Uploaded by">
              <div>
                <p className="text-xs font-medium">{batch.uploaded_by.full_name || batch.uploaded_by.email}</p>
                {batch.uploaded_by.email && (
                  <p className="text-[10px] text-gray-01 truncate">{batch.uploaded_by.email}</p>
                )}
              </div>
            </MetaRow>
            <MetaRow label="Uploaded">
              <span className="text-xs">{formatRelativeDate(batch.created_at)}</span>
            </MetaRow>
            {batch.imported_at && (
              <MetaRow label="Imported">
                <span className="text-xs">{new Date(batch.imported_at).toLocaleString()}</span>
              </MetaRow>
            )}
            {batch.sheet_name && (
              <MetaRow label="Sheet">
                <span className="text-xs font-mono">{batch.sheet_name}</span>
              </MetaRow>
            )}
            <MetaRow label="Header row">
              <span className="text-xs font-mono">{batch.header_row_index}</span>
            </MetaRow>
            {batch.notes && (
              <div className="pt-3 border-t border-white-02">
                <p className="text-[10px] uppercase tracking-wide text-gray-01 font-mont mb-1">Notes</p>
                <p className="text-xs whitespace-pre-wrap">{batch.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5")} data-guide="data-import-batch.evidence-tabs">
          <div className="flex gap-1 border-b border-white-02 mb-4 -mx-5 px-5 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 -mb-px",
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-01 hover:text-black-01",
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={cn(
                    "text-[10px] rounded-full px-1.5 py-0.5 font-medium",
                    tab === t.key ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500",
                  )}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "issues" && <IssuesTab batchId={batchId} />}
          {tab === "jobs" && <JobsTab batchId={batchId} batchStatus={batch.status} />}
          {tab === "rows" && <RowResultsTab batchId={batchId} latestJobId={latestJob?.id ?? null} />}
          {tab === "audit" && <AuditLogsTab batchId={batchId} />}
          {tab === "notifications" && <NotificationsTab batchId={batchId} />}
        </div>
      </PageShell>

      {/* Confirms */}
      <PromptModal
        isOpen={confirm === "validate"}
        onClose={() => !validating && setConfirm(null)}
        onConfirm={handleValidate}
        canCancel
        onCancel={() => setConfirm(null)}
        title="Run Validation?"
        description="This will re-parse the file and check every row against the template. Any previous issues will be replaced."
        onConfirmText="Run Validation"
        src="/image/caution.png"
        srcClass="size-20"
        loading={validating}
      />
      <PromptModal
        isOpen={confirm === "start"}
        onClose={() => !starting && setConfirm(null)}
        onConfirm={handleStart}
        canCancel
        onCancel={() => setConfirm(null)}
        title="Start Import?"
        description="This will queue the batch for execution in the background. Watch the Jobs tab for progress."
        onConfirmText="Start Import"
        src="/image/caution.png"
        srcClass="size-20"
        loading={starting}
      />
      <PromptModal
        isOpen={confirm === "delete"}
        onClose={() => !deleting && setConfirm(null)}
        onConfirm={handleDelete}
        canCancel
        onCancel={() => setConfirm(null)}
        title="Delete Batch?"
        description={`Permanently delete "${batch.original_filename}"? This removes the file, validation issues, and job history. This cannot be undone.`}
        onConfirmText="Delete"
        onConfirmClass="bg-destructive text-white hover:bg-destructive/90"
        src="/image/caution.png"
        srcClass="size-20"
        loading={deleting}
      />
    </>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "destructive" | "warning";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-01 font-mont">{label}</p>
      <p className={cn(
        "text-2xl font-bold mt-1",
        accent === "destructive" && "text-destructive",
        accent === "warning" && "text-amber-500",
      )}>
        {value}
      </p>
    </div>
  );
}

function ReadyChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
      ok ? "border-green-100 bg-green-50 text-green-700" : "border-white-02 bg-gray-50 text-gray-500",
    )}>
      {ok ? <Check className="size-3.5 shrink-0" /> : <Inbox className="size-3.5 shrink-0" />}
      <span>{label}</span>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-01 font-mont mb-0.5">{label}</p>
      {children}
    </div>
  );
}
