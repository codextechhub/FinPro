/**
 * Export Centre → one run.
 *
 * The screen answers, in this order: what happened, what you can do about it,
 * and what produced it. Each outcome gets its own body - a progress bar while
 * it runs, the file when there is one, the omissions when something was left
 * out, the cause and the fix when it failed - because "an export finished" and
 * "an export finished, minus two columns you are no longer allowed to see" are
 * different events and must not share a screen.
 *
 * Everything shown is on the run record. The frozen configuration is what
 * produced THIS file, not what the export has since become, which is the only
 * honest answer to "why does last month differ?".
 */

import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Pencil, RotateCcw, XCircle } from "lucide-react";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { RunStatusPill } from "@/components/custom/run-status-pill";
import { ConfirmActionModal } from "@/components/finance-ui/confirm-action-modal";
import { DataTable, type Column } from "@/components/finance-ui/data-table";
import { ErrorState, LoadingState } from "@/components/finance-ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { routesPath } from "@/routes/routes-path";
import { apiErrorMessage, errorStatus } from "@/utils/api-errors";
import {
  useCancelExportRunMutation,
  useGetExportDownloadLogQuery,
  useGetExportRunQuery,
  useRetryExportRunMutation,
} from "@/redux/services/dashboard/exports-api";
import type {
  ExportDownloadEntry,
  ExportRunDetail,
} from "@/redux/services/dashboard/exports-types";
import { FileCard } from "./file-card";
import { OMISSION_HEADING, omissionIsFixableInBuilder, remedyFor } from "./failure-actions";
import { formatBytes } from "@/utils/format-bytes";
import { formatDay, formatDuration, formatStamp } from "./format";
import { useFileDownload } from "./use-file-download";
import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";

// An open run detail polls harder than a list: this is the screen someone sits
// on while they wait. Terminal runs never change, so polling stops entirely.
const LIVE_POLL_MS = 2_000;
const NUM = "font-geist-mono tabular-nums";

const TRIGGER_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  QUICK: "Quick export",
  RETRY: "Retry",
  API: "API",
};

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="font-mont text-[11px] text-gray-05">{label}</p>
      <p className={cn("mt-0.5 font-mont text-sm font-semibold text-black-01", mono && NUM)}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-4")}>
      <h2 className="mb-3.5 font-mont text-[11px] uppercase tracking-widest text-gray-05">{title}</h2>
      {children}
    </section>
  );
}

/** A persistent, resolvable state - never a transient confirmation. */
function Banner({
  tone,
  title,
  children,
}: {
  tone: "caution" | "error";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-[3px] px-4 py-3.5",
        tone === "caution" ? "border-yellow-01 bg-yellow-01/10" : "border-destructive bg-destructive/10",
      )}
    >
      <p
        className={cn(
          "font-mont text-sm font-semibold",
          tone === "caution" ? "text-yellow-01-text" : "text-error-text",
        )}
      >
        {title}
      </p>
      <div className="mt-1.5 space-y-2 font-mont text-xs leading-relaxed text-gray-01">{children}</div>
    </div>
  );
}

export default function ExportRunDetailPage() {
  const { id } = useParams();
  const runId = Number(id);
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canView = hasPermission(P.VIEW_EXPORT_RUNS);
  const canDownload = hasPermission(P.DOWNLOAD_EXPORT_FILE);
  const canCancel = hasPermission(P.CANCEL_EXPORT_RUN);
  const canRun = hasPermission(P.RUN_EXPORT);
  const canEdit = hasPermission(P.UPDATE_EXPORT);

  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data, isLoading, isError, error, refetch } = useGetExportRunQuery(runId, {
    skip: !canView || !Number.isFinite(runId),
    // `progress` is non-null only while the run is live, which is exactly when
    // this screen should be refetching. A finished run is immutable.
    pollingInterval: LIVE_POLL_MS,
    skipPollingIfUnfocused: true,
  });
  const run = data?.data;
  const live = !!run?.progress;

  const [cancelRun, { isLoading: cancelling }] = useCancelExportRunMutation();
  const [retryRun, { isLoading: retrying }] = useRetryExportRunMutation();
  const { save, busyId } = useFileDownload();

  const status = errorStatus(error);
  if (!canView || status === 403) return <PageAccessDenied />;

  const onCancel = async () => {
    try {
      await cancelRun(runId).unwrap();
      toast.success("Cancellation requested. No partial file is kept.");
      setConfirmCancel(false);
    } catch (e) {
      toast.error(apiErrorMessage(e, "That run could not be cancelled."));
    }
  };

  const remedy = remedyFor(run?.failure?.code);

  const onRetry = async () => {
    try {
      const res = await retryRun(runId).unwrap();
      toast.success("Retry queued.");
      navigate(routesPath.PROTECTED.EXPORT.RUN(res.data.id));
    } catch (e) {
      toast.error(apiErrorMessage(e, "That run could not be retried."));
    }
  };

  return (
    <PageShell className="space-y-5 text-black-01">
      <Link
        to={routesPath.PROTECTED.EXPORT.FILES}
        className="inline-flex items-center gap-1.5 font-mont text-xs font-medium text-gray-05 hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> Files
      </Link>

      {isLoading ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
          <LoadingState rows={5} columns={3} label="Loading run…" />
        </div>
      ) : isError || !run ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
          <ErrorState onRetry={refetch} />
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-mont text-lg font-semibold text-black-01">{run.export_name}</h1>
                <RunStatusPill status={run.status} />
              </div>
              <p className={cn(NUM, "mt-1 text-xs text-gray-06-text")}>
                {run.reference} · {TRIGGER_LABEL[run.trigger] ?? run.trigger} ·{" "}
                {formatStamp(run.started_at ?? run.queued_at)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {live && canCancel && (
                <Button variant="white" onClick={() => setConfirmCancel(true)} className="gap-1.5">
                  <XCircle className="size-4" /> Cancel run
                </Button>
              )}
              {/* One action, and only the one that can change the outcome. The
                  API decides retryability from the failure CODE, so a filter or
                  permission failure never offers a button that would fail
                  identically - it offers the edit that actually fixes it. */}
              {run.failure && remedy.kind === "retry" && run.failure.retryable && canRun && (
                <Button onClick={onRetry} loading={retrying} loadingText="Queueing…" className="gap-1.5">
                  <RotateCcw className="size-4" /> {remedy.label}
                </Button>
              )}
              {run.failure && remedy.kind === "edit" && run.definition_id && canEdit && (
                <Button
                  onClick={() => navigate(routesPath.PROTECTED.EXPORT.EDIT(run.definition_id as number))}
                  className="gap-1.5"
                >
                  <Pencil className="size-4" /> {remedy.label}
                </Button>
              )}
            </div>
          </header>

          <RunBody
            run={run}
            canDownload={canDownload}
            canEdit={canEdit}
            downloadingId={busyId}
            onDownload={() => run.file && save(run.file, run.id)}
            onEditExport={() =>
              run.definition_id && navigate(routesPath.PROTECTED.EXPORT.EDIT(run.definition_id))
            }
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Run record">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Field label="Run" value={run.reference} mono />
                <Field label="Trigger" value={TRIGGER_LABEL[run.trigger] ?? run.trigger} />
                <Field label="Requested by" value={run.requested_by_name || "-"} />
                <Field label="Queued" value={formatStamp(run.queued_at)} mono />
                <Field label="Started" value={formatStamp(run.started_at)} mono />
                <Field label="Ended" value={formatStamp(run.ended_at)} mono />
                <Field label="Duration" value={formatDuration(run.started_at, run.ended_at)} mono />
                <Field
                  label="Rows"
                  value={run.row_count == null ? "-" : run.row_count.toLocaleString("en-GB")}
                  mono
                />
                {run.file && <Field label="File size" value={formatBytes(run.file.size_bytes)} mono />}
                {run.file && <Field label="Expires" value={formatDay(run.file.available_until)} mono />}
                {run.attempt > 1 && <Field label="Attempt" value={String(run.attempt)} mono />}
              </div>
            </Section>

            <Section title="Configuration used at run time">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Field label="Dataset" value={run.configuration.dataset || "-"} />
                <Field label="Scope" value={run.configuration.scope || "-"} />
                <Field
                  label="Columns"
                  value={
                    run.file && run.file.columns_produced.length !== run.configuration.columns.length
                      ? `${run.configuration.columns.length} requested, ${run.file.columns_produced.length} produced`
                      : String(run.configuration.columns.length)
                  }
                  mono
                />
                <Field
                  label="Format"
                  value={`${(run.configuration.format ?? "").toUpperCase()}, ${
                    run.configuration.values_mode === "system" ? "values for systems" : "values for people"
                  }`}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Filters"
                    value={run.configuration.filters.length ? run.configuration.filters.join("; ") : "None"}
                  />
                </div>
              </div>

              {/* Drift is the point of freezing the config: the export has moved
                  on, and this file did not. Stated, never silently reconciled. */}
              {run.drift.count > 0 && (
                <div className="mt-4 border-t border-white-02 pt-3">
                  <p className="font-mont text-xs leading-relaxed text-gray-01">
                    This differs from the export's current setup in {run.drift.count}{" "}
                    {run.drift.count === 1 ? "place" : "places"}. Editing an export changes future
                    files only - this one is exactly what ran.
                  </p>
                  <dl className="mt-2.5 space-y-2">
                    {run.drift.changes.map((c) => (
                      <div key={c.field} className="rounded-md bg-gray-04 px-3 py-2">
                        <dt className="font-mont text-[11px] font-semibold text-gray-05">{c.label}</dt>
                        <dd className="mt-1 space-y-0.5 font-mont text-xs text-gray-01">
                          <p>
                            <span className="text-gray-05">This run: </span>
                            {c.then}
                          </p>
                          <p>
                            <span className="text-gray-05">Now: </span>
                            {c.now}
                          </p>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </Section>
          </div>

          {!!run.deliveries?.length && (
            <Section title="Deliveries">
              <div className="space-y-2.5">
                {run.deliveries.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mont text-sm text-black-01">{d.recipient}</span>
                    <div className="flex items-center gap-2">
                      {d.failure_reason && (
                        <span className="font-mont text-xs text-gray-05">{d.failure_reason}</span>
                      )}
                      <Badge variant={d.state === "SENT" ? "success" : d.state === "FAILED" ? "rejected" : "inactive"} className="font-mont">
                        {d.state.charAt(0) + d.state.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {run.file && <DownloadLog fileId={run.file.id} />}
        </>
      )}

      <ConfirmActionModal
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this run?"
        description="The export stops where it is and no partial file is kept. The run stays on record as cancelled, and you can run the export again at any time."
        confirmText="Cancel run"
        cancelText="Keep running"
        destructive
        loading={cancelling}
        onConfirm={onCancel}
      />
    </PageShell>
  );
}

// ── Per-outcome body ─────────────────────────────────────────────────────────
function RunBody({
  run,
  canDownload,
  canEdit,
  downloadingId,
  onDownload,
  onEditExport,
}: {
  run: ExportRunDetail;
  canDownload: boolean;
  canEdit: boolean;
  downloadingId: number | null;
  onDownload: () => void;
  onEditExport: () => void;
}) {
  // Still going: a determinate bar when the total is known, the phase name when
  // it is not. Never a bar that creeps to 90% and parks.
  if (run.progress) {
    const { rows_done, rows_total, phase_label, queue_position } = run.progress;
    const pct = rows_total ? Math.min(100, Math.round((rows_done / rows_total) * 100)) : null;
    return (
      <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5")}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mont text-sm font-medium text-black-01">{phase_label}</p>
          {pct !== null && <p className={cn(NUM, "text-sm font-semibold text-black-01")}>{pct}%</p>}
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-03">
          <div
            className={cn(
              "h-full rounded-full bg-primary",
              pct === null
                ? "w-1/3 animate-pulse motion-reduce:animate-none"
                : "transition-all duration-300",
            )}
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        </div>
        <p className={cn(NUM, "mt-2.5 text-xs text-gray-06-text")}>
          {rows_total
            ? `${rows_done.toLocaleString("en-GB")} of ~${rows_total.toLocaleString("en-GB")} rows`
            : `${rows_done.toLocaleString("en-GB")} rows so far`}
        </p>
        {/* Silence is what makes people run an export twice. */}
        {queue_position != null && queue_position > 0 && (
          <p className="mt-2 font-mont text-xs text-gray-01">
            Waiting for a worker - position {queue_position} in the queue.
          </p>
        )}
        <p className="mt-4 border-t border-white-02 pt-3.5 font-mont text-xs leading-relaxed text-gray-01">
          You can leave this page. The export keeps running and you will be notified when the file is ready.
        </p>
      </section>
    );
  }

  if (run.status === "FAILED" && run.failure) {
    const remedy = remedyFor(run.failure.code);
    return (
      <Banner tone="error" title={run.failure.message || "This export failed"}>
        {run.failure.recommended_action && (
          <>
            <p className="font-semibold text-error-text">What to do</p>
            <p>{run.failure.recommended_action}</p>
          </>
        )}
        {/* Retrying a filter or permission failure fails identically, so the
            only button offered here is the one that can change the outcome. */}
        {remedy.kind === "edit" && run.definition_id && canEdit && (
          <button
            type="button"
            onClick={onEditExport}
            className="font-mont text-xs font-medium text-primary underline underline-offset-2"
          >
            {remedy.label}
          </button>
        )}
        {remedy.kind === "none" && (
          <p className="text-gray-05">
            There is nothing to change on the export itself - this needs an administrator.
          </p>
        )}
        {/* An orphaned run still has to explain itself: the recipe it came from
            is gone, so neither editing nor retrying is on offer. */}
        {remedy.kind !== "none" && !run.definition_id && (
          <p className="text-gray-05">
            The export this run came from no longer exists, so there is nothing left to edit. Build
            it again from Exports.
          </p>
        )}
        <p className={cn(NUM, "border-t border-destructive/20 pt-2.5 text-[11px] text-gray-05")}>
          Reference {run.failure.reference} · quote this if you contact support
          {run.attempt > 1 ? ` · attempt ${run.attempt} of 3` : ""}
        </p>
      </Banner>
    );
  }

  if (run.status === "CANCELLED") {
    return (
      <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5")}>
        <p className="font-mont text-sm font-medium text-black-01">This run was cancelled</p>
        <p className="mt-1.5 font-mont text-xs leading-relaxed text-gray-01">
          It was stopped by a person before it finished, so no file was produced and no partial file was
          kept. Run the export again whenever you need it.
        </p>
      </section>
    );
  }

  const partial = run.status === "COMPLETED_WITH_OMISSIONS";

  return (
    <div className="space-y-4">
      {/* The omission is always named. This is the state that stops VS Export
          truncating silently, so it leads - before the file itself. */}
      {partial && (
        <Banner tone="caution" title="The file was produced, but something was left out">
          {run.omissions.length ? (
            <div className="space-y-3">
              {run.omissions.map((o, i) => (
                <div key={i}>
                  <p className="font-semibold text-yellow-01-text">
                    {OMISSION_HEADING[o.code] ?? "Something was left out"}
                  </p>
                  <p className="mt-0.5">{o.detail}</p>
                  {/* The structured item list, so the omission is renderable
                      rather than something the reader has to parse out of the
                      sentence. The API supplies it; nothing here infers it. */}
                  {!!o.items?.length && (
                    <p className={cn(NUM, "mt-1 text-[11px] text-gray-05")}>
                      {o.items.join(" · ")}
                    </p>
                  )}
                  {omissionIsFixableInBuilder(o.code) && run.definition_id && canEdit && (
                    <button
                      type="button"
                      onClick={onEditExport}
                      className="mt-1.5 font-mont text-xs font-medium text-primary underline underline-offset-2"
                    >
                      Edit the export
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p>Part of this export could not be included. The run record has the detail.</p>
          )}
          <p className="border-t border-yellow-01/25 pt-2">
            Nothing was silently truncated - what you have is complete for the columns and rows
            listed.
          </p>
        </Banner>
      )}

      {run.file ? (
        <>
          <FileCard
            file={run.file}
            columnsRequested={run.configuration.columns.length}
            downloading={downloadingId === run.file.id}
            canDownload={canDownload}
            onDownload={onDownload}
            tone={partial ? "partial" : "ready"}
          />
          <p className="font-mont text-xs leading-relaxed text-gray-01">
            {run.file.is_purged
              ? "The bytes have been deleted from storage. The run record and its audit trail stay."
              : run.file.is_expired
                ? `This file passed its availability date on ${formatDay(run.file.available_until)}. Running the export again produces a new one.`
                : `This file is a snapshot taken at ${formatStamp(run.started_at)}. Running the export again produces a new file; this one is not updated.`}
          </p>
        </>
      ) : (
        <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5")}>
          <p className="font-mont text-sm font-medium text-black-01">No file is attached to this run</p>
          <p className="mt-1.5 font-mont text-xs leading-relaxed text-gray-01">
            The run finished, but its file is no longer on record.
          </p>
        </section>
      )}
    </div>
  );
}

// ── Download log ─────────────────────────────────────────────────────────────
// Allowed AND refused. "Who tried and was told no" is the question a compliance
// review actually asks, and a refusal that leaves no trace cannot be answered.
function DownloadLog({ fileId }: { fileId: number }) {
  const { data, isLoading, isError, refetch } = useGetExportDownloadLogQuery({ fileId });
  const rows = useMemo(() => data?.data ?? [], [data]);

  const columns: Column<ExportDownloadEntry>[] = [
    { header: "Who", cell: (d) => d.user_name || "-" },
    { header: "When", cell: (d) => <span className={NUM}>{formatStamp(d.at)}</span> },
    { header: "IP", cell: (d) => <span className={NUM}>{d.ip_address || "-"}</span> },
    {
      header: "Outcome",
      cell: (d) => (
        <Badge variant={d.outcome === "ALLOWED" ? "success" : "rejected"} className="font-mont">
          {d.outcome === "ALLOWED" ? "Allowed" : "Refused"}
        </Badge>
      ),
    },
    {
      header: "Reason",
      cell: (d) =>
        d.refusal_reason ? d.refusal_reason.replace(/_/g, " ").toLowerCase() : null,
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="font-mont text-[11px] uppercase tracking-widest text-gray-05">Download log</h2>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={isLoading}
        error={isError}
        onRetry={refetch}
        emptyTitle="Nobody has downloaded this file yet"
        emptyMessage="Every download and every refused attempt is recorded here."
      />
    </section>
  );
}
