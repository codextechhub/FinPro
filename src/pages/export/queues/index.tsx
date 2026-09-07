/**
 * Export → View Queues. One page over core.BackgroundJob: every async task the
 * user started (imports, exports, emails) - plus system/scheduled runs for
 * admins via the All Queues scope. Polls list + summary every 10 s while the
 * tab is visible; a row opens the task's detail in a drawer.
 *
 * This page answers "did the worker finish?". The Export Centre's Files view
 * answers "what came out?" - they are different questions over the same work
 * (ExportRun.background_job points here), NOT two job monitors. They must
 * therefore agree on words: status rendering is delegated to RunStatusPill,
 * which displays this API's SUCCEEDED as "Completed", the word the export run
 * vocabulary uses. See docs/EXPORT_BUILD_NOTES.md.
 *
 * The one place the job row is not the whole truth is an export. A job that
 * SUCCEEDED may have produced a file with columns or rows left out, and the
 * export task reports that back in `result` - so for kind=export this page
 * reads the RUN's status, not the job's. Otherwise a partly-complete export
 * would read here as a clean success, which is the exact confusion the Export
 * Centre exists to remove.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import KpiCard from "@/components/custom/kpi-card";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import { RunStatusPill, runStatusWord } from "@/components/custom/run-status-pill";
import { DataTable, type Column } from "@/components/finance-ui/data-table";
import { DetailDrawer } from "@/components/finance-ui/detail-drawer";
import { Segmented } from "@/components/finance-ui/segmented";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import type { BackgroundJob, JobStatus, QueueParams } from "@/redux/services/dashboard/queue-types";
import { useGetMyTasksQuery, useGetMyTasksSummaryQuery } from "@/redux/services/dashboard/queue-api";
import { errorStatus } from "@/utils/api-errors";
import { displayStatus, exportOutcome } from "./job-outcome";
import { PageShell } from "@/components/layout/page-shell";

const POLL_MS = 10_000;

// Numbers a person compares down a column - durations, percentages, row counts,
// run references, timestamps - are monospace with tabular figures so the digits
// line up. Everything read as language stays font-mont.
const NUM = "font-geist-mono tabular-nums";

/**
 * ── Display maps ──────────────────────────────────────────────────────────────
 * Labels come from runStatusWord so the filter, the cards and the rows cannot
 * drift apart; the values stay the API's own tokens.
 * CustomNativeSelect renders its own value="" option first, so the "all" state
 * is the placeholder - listing it again here would give the select two of them.
 */
const STATUS_OPTIONS = (["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const).map((value) => ({
  value,
  label: runStatusWord(value),
}));

const KIND_OPTIONS = [
  { value: "import", label: "Import" },
  { value: "export", label: "Export" },
  { value: "email", label: "Email" },
  { value: "system", label: "System" },
];

const KIND_CHIP: Record<string, string> = {
  import: "bg-sky-500/10 text-sky-600",
  export: "bg-violet-500/10 text-violet-600",
  email: "bg-yellow-01/10 text-yellow-01-text",
  system: "bg-gray-05/10 text-gray-06-text",
};

function KindChip({ kind }: { kind: string }) {
  const k = kind.toLowerCase();
  return (
    <Badge className={cn("font-mont capitalize", KIND_CHIP[k] ?? "bg-gray-05/10 text-gray-06-text")}>
      {k || "task"}
    </Badge>
  );
}

// ── Formatting ────────────────────────────────────────────────────────────────
function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-GB");
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function QueuesPage() {
  // Scope, filters and page live in the URL so a view is linkable - a failure
  // notification can point straight at the filtered queue that explains it.
  const [searchParams, setSearchParams] = useSearchParams();
  // Defensive: a 403 on scope=all drops the page back to "mine" and hides the
  // toggle, even if can_view_all lied. Derived rather than written back to the
  // URL - a navigation during render is not safe, and the query below only ever
  // reads this value.
  const [forceHideAll, setForceHideAll] = useState(false);
  const scope = !forceHideAll && searchParams.get("scope") === "all" ? "all" : "mine";
  const status = (searchParams.get("status") ?? "") as "" | JobStatus;
  const kind = searchParams.get("kind") ?? "";
  const since = searchParams.get("since") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [openJobId, setOpenJobId] = useState<number | null>(null);

  const now = useNow();

  // One writer for the URL, so every filter resets the page and closes the
  // drawer the same way and no caller can forget one of the three.
  const patchParams = (patch: Record<string, string>) => {
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
    setOpenJobId(null);
  };

  // Summary and list take identical params so the cards match the table scope.
  const params = useMemo(() => {
    const p: QueueParams = { page };
    if (scope === "all") p.scope = "all";
    if (status) p.status = status;
    if (kind) p.kind = kind;
    if (since) p.since = since;
    return p;
  }, [scope, status, kind, since, page]);

  const pollOpts = { pollingInterval: POLL_MS, skipPollingIfUnfocused: true, refetchOnFocus: true } as const;
  const {
    data: listRes,
    isLoading: listLoading,
    isError: listError,
    error: listErr,
    refetch,
  } = useGetMyTasksQuery(params, pollOpts);
  const { data: summaryRes } = useGetMyTasksSummaryQuery(params, pollOpts);

  const rows = useMemo(() => listRes?.data ?? [], [listRes]);
  const pagination = listRes?.pagination;
  const summary = summaryRes?.data;
  const canViewAll = !!summary?.can_view_all && !forceHideAll;

  // Render-time state adjustment (guarded: `scope` derives from forceHideAll,
  // so flipping it makes this condition false and it cannot loop).
  if (scope === "all" && listError && errorStatus(listErr) === 403) {
    setForceHideAll(true);
  }

  // Completion toasts: a row that was QUEUED/RUNNING on the previous poll and
  // is now terminal gets announced. First load seeds the map without toasting.
  // The word is the row's - a partly-complete export must not toast "finished
  // successfully".
  const prevStatusRef = useRef<Map<number, JobStatus>>(new Map());
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev.size) {
      for (const job of rows) {
        const was = prev.get(job.id);
        if (was !== "QUEUED" && was !== "RUNNING") continue;
        const name = job.label || job.task_name;
        const outcome = exportOutcome(job);
        if (job.status === "FAILED") toast.error(`${name} failed`);
        else if (job.status === "SUCCEEDED" && outcome?.omissions) {
          toast.warning(`${name} finished, but something was left out`);
        } else if (job.status === "SUCCEEDED") toast.success(`${name} finished successfully`);
      }
    }
    const next = new Map<number, JobStatus>();
    rows.forEach((j) => next.set(j.id, j.status));
    prevStatusRef.current = next;
  }, [rows]);

  const openJob = rows.find((j) => j.id === openJobId) ?? null;
  const counts = summary?.by_status ?? {};
  const hasFilters = !!(status || kind || since);

  const columns: Column<BackgroundJob>[] = useMemo(() => {
    const base: Column<BackgroundJob>[] = [
      {
        header: "Task",
        cell: (job) => <span className="font-semibold">{job.label || job.task_name}</span>,
      },
      { header: "Type", cell: (job) => <KindChip kind={job.kind} /> },
      { header: "Status", cell: (job) => <RunStatusPill status={displayStatus(job)} /> },
      // Returns null, not a component that renders null: DataTable's phone card
      // drops columns with no value, and it can only see an absent cell.
      {
        header: "Progress",
        cell: (job) =>
          job.status === "RUNNING" && job.progress != null ? <ProgressBar value={job.progress} /> : null,
      },
      { header: "Started", cell: (job) => <span className={NUM}>{timeAgo(job.started_at, now)}</span> },
      {
        header: "Duration",
        align: "right",
        cell: (job) => (
          <span className={NUM}>{job.status === "RUNNING" ? "-" : fmtDuration(job.runtime_seconds)}</span>
        ),
      },
    ];
    if (scope === "all") base.push({ header: "Owner", cell: (job) => job.owner_name ?? "System" });
    return base;
  }, [now, scope]);

  return (
    <PageShell className="space-y-5 text-black-01">
      {/* Header row: title + (permission-gated) scope toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3" data-guide="data-export-queues.heading">
        <div>
          <p className="font-semibold font-mont text-gray-01">Queues</p>
          <p className="text-xs text-gray-01 mt-0.5">
            Background tasks - imports, exports and emails you started, live as they run.
          </p>
        </div>
        {canViewAll && (
          <Segmented
            value={scope}
            onChange={(v) => patchParams({ scope: v === "all" ? "all" : "" })}
            options={[
              ["mine", "My Queues"],
              ["all", "All Queues"],
            ] as const}
          />
        )}
      </div>

      {/* Status summary cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4" data-guide="data-export-queues.summary">
        <KpiCard label={runStatusWord("QUEUED")} value={counts.QUEUED ?? 0} />
        <KpiCard
          label={runStatusWord("RUNNING")}
          value={counts.RUNNING ?? 0}
          tone={(counts.RUNNING ?? 0) > 0 ? "live" : "default"}
        />
        <KpiCard label={runStatusWord("SUCCEEDED")} value={counts.SUCCEEDED ?? 0} />
        <KpiCard
          label={runStatusWord("FAILED")}
          value={counts.FAILED ?? 0}
          tone={(counts.FAILED ?? 0) > 0 ? "alert" : "default"}
        />
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-3">
        <CustomNativeSelect
          id="queue-status"
          aria-label="Filter by status"
          placeholder="All statuses"
          containerClass="w-full sm:w-44"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => patchParams({ status: e.target.value })}
        />
        <CustomNativeSelect
          id="queue-kind"
          aria-label="Filter by type"
          placeholder="All types"
          containerClass="w-full sm:w-44"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(e) => patchParams({ kind: e.target.value })}
        />
        <Input
          type="date"
          value={since}
          onChange={(e) => patchParams({ since: e.target.value })}
          aria-label="From date"
          className="h-10 w-full bg-white sm:w-44"
        />
        {hasFilters && (
          <button
            onClick={() => patchParams({ status: "", kind: "", since: "" })}
            className="h-10 font-mont text-xs font-semibold text-gray-05 hover:text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(job) => job.id}
        loading={listLoading}
        error={!!listError}
        onRetry={refetch}
        onRowClick={(job) => setOpenJobId(job.id)}
        emptyTitle={hasFilters ? "No tasks match these filters" : "No background tasks yet"}
        emptyMessage={
          hasFilters
            ? "Try a wider date range, or clear the filters to see everything."
            : "Imports and exports you start will appear here while they run."
        }
        page={pagination?.currentPage}
        totalPages={pagination?.totalPages}
        onPageChange={(p) => patchParams({ page: String(p) })}
      />

      <JobDrawer job={openJob} onClose={() => setOpenJobId(null)} />
    </PageShell>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────
// Only ever determinate: the API reports a percentage or it reports nothing,
// and a bar that creeps to 90% and parks is worse than no bar at all.
function ProgressBar({ value }: { value: number }) {
  return (
    <span className="inline-flex w-28 items-center gap-2">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-gray-03">
        <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </span>
      <span className={cn(NUM, "text-xs text-gray-06-text")}>{value}%</span>
    </span>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────────
function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className={cn("mt-0.5 font-mont text-sm font-semibold text-black-01", mono && NUM)}>{value}</p>
    </div>
  );
}

// One scalar out of a task's result payload, rendered as a field rather than as
// JSON. Nested values are summarised, never dumped: the spec is explicit that a
// person reads what happened, not a serialised object.
function resultFields(result: unknown): { label: string; value: string }[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  return Object.entries(result as Record<string, unknown>).map(([key, value]) => {
    const label = key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    if (value == null) return { label, value: "-" };
    if (Array.isArray(value)) return { label, value: `${value.length} items` };
    if (typeof value === "object") return { label, value: `${Object.keys(value).length} entries` };
    return { label, value: String(value) };
  });
}

function JobDrawer({ job, onClose }: { job: BackgroundJob | null; onClose: () => void }) {
  const outcome = job ? exportOutcome(job) : null;
  return (
    <DetailDrawer
      open={!!job}
      onOpenChange={(open) => !open && onClose()}
      // The rest of the app is Montserrat; only the Finance and Procurement
      // consoles are Geist, and the Sheet cannot inherit either.
      typeface="app"
      widthClass="sm:max-w-3xl"
      title={job ? job.label || job.task_name : ""}
      description={job?.task_name}
    >
      {job && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusPill status={displayStatus(job)} />
            <KindChip kind={job.kind} />
            {outcome?.reference && (
              <span className={cn(NUM, "text-xs text-gray-06-text")}>{outcome.reference}</span>
            )}
          </div>

          {/* An export that left something out says so here, in words, before
              anything else - it is the reason this drawer is worth opening. */}
          {!!outcome?.omissions && (
            <div className="rounded-md border-l-[3px] border-yellow-01 bg-yellow-01/10 px-4 py-3">
              <p className="font-mont text-sm font-semibold text-yellow-01-text">
                This export finished with {outcome.omissions} omission
                {outcome.omissions === 1 ? "" : "s"}
              </p>
              <p className="mt-1 font-mont text-xs text-gray-01">
                A file was produced, but some columns or rows were left out. Open the export in the
                Export Centre to see exactly what, and why.
              </p>
            </div>
          )}

          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
            <Field label="Created" value={fmtTimestamp(job.created_at)} mono />
            <Field label="Started" value={fmtTimestamp(job.started_at)} mono />
            <Field label="Finished" value={fmtTimestamp(job.finished_at)} mono />
            <Field
              label="Duration"
              value={job.status === "RUNNING" ? "Still running" : fmtDuration(job.runtime_seconds)}
              mono={job.status !== "RUNNING"}
            />
            <Field label="Owner" value={job.owner_name ?? "System"} />
            {outcome?.rows != null && (
              <Field label="Rows written" value={outcome.rows.toLocaleString("en-GB")} mono />
            )}
          </div>

          {job.status === "FAILED" && job.error && (
            <div className="rounded-md border-l-[3px] border-destructive bg-destructive/10 px-4 py-3">
              <p className="font-mont text-sm font-semibold text-error-text">This task failed</p>
              {/* The message the worker recorded, as prose. `traceback` is not
                  serialised by the API, and nothing here re-creates one.

                  The backend redacts this text before storing it, so personal
                  data a failure quoted - a duplicate guardian's address inside
                  a Postgres key error, say - arrives as `[redacted]`. Saying so
                  matters: without the note the placeholder reads as a truncated
                  or corrupted message, and somebody raises a ticket about the
                  error message rather than about the error. */}
              <p className="mt-1 font-mont text-xs leading-relaxed text-gray-01">{job.error}</p>
              {job.error.includes("[redacted]") && (
                <p className="mt-2 font-mont text-[11px] leading-relaxed text-gray-05">
                  Personal data in this message has been removed. The full text is kept for
                  engineering and audit, and is not shown here.
                </p>
              )}
            </div>
          )}

          {!!resultFields(job.result).length && (
            <div>
              <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">Result</p>
              <div className="grid gap-x-8 gap-y-4 rounded-md bg-gray-04 px-4 py-3.5 sm:grid-cols-3">
                {resultFields(job.result).map((f) => (
                  <Field key={f.label} label={f.label} value={f.value} mono />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}
