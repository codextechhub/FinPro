/**
 * Export Centre → Files. One row per RUN, not per file.
 *
 * That is deliberate: a run that produced no file is still something a person
 * has to see and act on, and hiding failures behind "Files" is how an export
 * silently stops working. The row therefore leads with the run, and the file is
 * what it did or did not produce.
 *
 * Not the same page as Export → View Queues, which answers "did the worker
 * finish?" over every background task. This answers "what came out?" - rows,
 * size, omissions, expiry, downloads. They read the same work (a run wraps a
 * job) and share one status vocabulary; see docs/EXPORT_BUILD_NOTES.md.
 */

import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import KpiCard from "@/components/custom/kpi-card";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { RunStatusPill, runStatusWord } from "@/components/custom/run-status-pill";
import { DataTable, type Column } from "@/components/finance-ui/data-table";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { cn } from "@/lib/utils";
import { routesPath } from "@/routes/routes-path";
import {
  useGetExportCapabilitiesQuery,
  useGetExportRunsQuery,
} from "@/redux/services/dashboard/exports-api";
import type { ExportRun, ExportRunStatus, RunListParams } from "@/redux/services/dashboard/exports-types";
import { formatBytes } from "@/utils/format-bytes";
import { daysUntil, formatDay } from "./format";
import { errorStatus } from "@/utils/api-errors";
import { useFileDownload } from "./use-file-download";
import { PageShell } from "@/components/layout/page-shell";

const POLL_MS = 10_000;
const NUM = "font-geist-mono tabular-nums";

// CustomNativeSelect renders its own value="" option, so the "all" state is the
// placeholder and must not be listed again here.
const STATUS_OPTIONS = (
  ["QUEUED", "RUNNING", "COMPLETED", "COMPLETED_WITH_OMISSIONS", "FAILED", "CANCELLED"] as const
).map((value) => ({ value, label: runStatusWord(value) }));

const TRIGGER_OPTIONS = [
  { value: "MANUAL", label: "Manual" },
  { value: "QUICK", label: "Quick export" },
  { value: "RETRY", label: "Retry" },
  { value: "API", label: "API" },
];

const TRIGGER_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  QUICK: "Quick export",
  RETRY: "Retry",
  API: "API",
};

function fmtStarted(run: ExportRun): string {
  const iso = run.started_at ?? run.queued_at;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// The second line under the file name: what this run left behind. Reads
// differently for each outcome because "no file produced" is information, not
// an empty cell.
function subtitle(run: ExportRun): string {
  const parts = [run.reference];
  if (run.file) {
    parts.push(formatBytes(run.file.size_bytes));
    if (run.file.is_purged) parts.push("deleted from storage");
    else if (run.file.is_expired) parts.push(`expired ${formatDay(run.file.available_until)}`);
    else parts.push(`expires ${formatDay(run.file.available_until)}`);
  } else if (run.status === "FAILED") {
    parts.push("no file produced");
  } else if (run.status === "CANCELLED") {
    parts.push("cancelled - no partial file kept");
  } else {
    parts.push(run.export_name);
  }
  return parts.join(" · ");
}

export default function ExportFilesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.VIEW_EXPORT_RUNS);
  const canDownload = hasPermission(P.DOWNLOAD_EXPORT_FILE);

  // Filters in the URL so a view is linkable - a failure notification points
  // straight at the run that explains itself.
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get("status") ?? "") as ExportRunStatus | "";
  const trigger = searchParams.get("trigger") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const patchParams = (patch: Record<string, string>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true },
    );

  const params = useMemo(() => {
    const p: RunListParams = { page };
    if (status) p.status = status;
    if (trigger) p.trigger = trigger as RunListParams["trigger"];
    return p;
  }, [status, trigger, page]);

  const { data, isLoading, isError, error, refetch } = useGetExportRunsQuery(params, {
    pollingInterval: POLL_MS,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    skip: !canView,
  });
  const { data: capsRes } = useGetExportCapabilitiesQuery(undefined, { skip: !canView });

  const { save, busyId } = useFileDownload();

  const runs = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;
  const retention = capsRes?.data.retention_days ?? 30;
  const hasFilters = !!(status || trigger);

  // Counted from the page in view, and labelled as such - the runs endpoint has
  // no summary, and a figure that silently means "this page only" is worse than
  // one that says so.
  const readyNow = runs.filter((r) => r.file?.is_downloadable).length;
  const expiringSoon = runs.filter(
    (r) => r.file?.is_downloadable && daysUntil(r.file.available_until) <= 7,
  ).length;
  const needsAttention = runs.filter(
    (r) => r.status === "FAILED" || r.status === "COMPLETED_WITH_OMISSIONS",
  ).length;

  const forbidden = errorStatus(error) === 403;
  if (!canView) return <PageAccessDenied />;

  const columns: Column<ExportRun>[] = [
    {
      header: "Run · file",
      cell: (run) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-black-01">{run.file?.name ?? run.export_name}</p>
          <p className={cn(NUM, "mt-0.5 truncate text-xs font-normal text-gray-06-text")}>{subtitle(run)}</p>
        </div>
      ),
    },
    { header: "Requested by", cell: (run) => run.requested_by_name || "-" },
    { header: "Trigger", cell: (run) => TRIGGER_LABEL[run.trigger] ?? run.trigger },
    { header: "Started", cell: (run) => <span className={NUM}>{fmtStarted(run)}</span> },
    {
      header: "Rows",
      align: "right",
      cell: (run) => (
        <span className={NUM}>{run.row_count == null ? "-" : run.row_count.toLocaleString("en-GB")}</span>
      ),
    },
    { header: "Status", cell: (run) => <RunStatusPill status={run.status} /> },
    {
      header: "",
      align: "right",
      // One action per row, and only when it is genuinely available. A row whose
      // file has expired offers nothing here - the run detail explains why.
      cell: (run) =>
        run.file?.is_downloadable && canDownload ? (
          <Button
            variant="ghost"
            size="sm"
            loading={busyId === run.file.id}
            onClick={(e) => {
              e.stopPropagation();
              if (run.file) save(run.file, run.id);
            }}
            className="font-mont"
          >
            Download
          </Button>
        ) : null,
    },
  ];

  return (
    <PageShell className="space-y-5 text-black-01">
      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="data-export-files.heading">
        <div>
          <p className="font-semibold font-mont text-gray-01">Files</p>
          <p className="mt-0.5 text-xs text-gray-01">
            Every export run and what it produced. Files are kept for {retention} days after the run, then
            expire automatically - the run and its history stay.
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3" data-guide="data-export-files.summary">
        <KpiCard label="Ready to download" value={readyNow} foot="On this page" />
        <KpiCard
          label="Expiring within 7 days"
          value={expiringSoon}
          tone={expiringSoon > 0 ? "warn" : "default"}
          foot="On this page"
        />
        <KpiCard
          label="Needs attention"
          value={needsAttention}
          tone={needsAttention > 0 ? "alert" : "default"}
          foot="Failed or partly complete"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <CustomNativeSelect
          id="run-status"
          aria-label="Filter by status"
          placeholder="All statuses"
          containerClass="w-full sm:w-56"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => patchParams({ status: e.target.value })}
        />
        <CustomNativeSelect
          id="run-trigger"
          aria-label="Filter by trigger"
          placeholder="All triggers"
          containerClass="w-full sm:w-44"
          options={TRIGGER_OPTIONS}
          value={trigger}
          onChange={(e) => patchParams({ trigger: e.target.value })}
        />
        {hasFilters && (
          <button
            onClick={() => patchParams({ status: "", trigger: "" })}
            className="h-10 font-mont text-xs font-semibold text-gray-05 hover:text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={runs}
        rowKey={(run) => run.id}
        loading={isLoading}
        error={isError && !forbidden}
        forbidden={forbidden}
        forbiddenMessage="You do not have access to export runs in this entity."
        onRetry={refetch}
        onRowClick={(run) => navigate(routesPath.PROTECTED.EXPORT.RUN(run.id))}
        emptyTitle={hasFilters ? "No runs match these filters" : "No exports have been run yet"}
        emptyMessage={
          hasFilters
            ? "Clear the filters to see every run."
            : "When an export runs, it appears here with the file it produced."
        }
        page={pagination?.currentPage}
        totalPages={pagination?.totalPages}
        onPageChange={(p) => patchParams({ page: String(p) })}
      />
    </PageShell>
  );
}
