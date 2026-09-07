import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PermissionGate from "@/components/custom/permission-gate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { P } from "@/permissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatRelativeDate } from "@/utils/helpers";
import {
  useGetImportJobsQuery,
  useRollbackImportJobMutation,
} from "@/redux/services/dashboard/import-api";
import type { BatchStatus, ImportJobListItem } from "@/redux/services/dashboard/import-types";
import { IN_FLIGHT, JOB_STATUS_BADGE } from "./batch-status";

export function JobsTab({ batchId, batchStatus }: { batchId: number; batchStatus: BatchStatus }) {
  const [rollbackJob, setRollbackJob] = useState<ImportJobListItem | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollback, { isLoading: rollingBack }] = useRollbackImportJobMutation();

  const isLive = IN_FLIGHT.has(batchStatus);

  const { data, isLoading, isError, refetch } = useGetImportJobsQuery(
    { batchId },
    {
      refetchOnMountOrArgChange: true,
      pollingInterval: isLive ? 5000 : 0,
    },
  );

  const jobs = data?.data ?? [];

  const handleRollback = async () => {
    if (!rollbackJob) return;
    try {
      await rollback({ batchId, jobId: rollbackJob.id, reason: rollbackReason }).unwrap();
      toast.success("Rollback completed.");
      setRollbackJob(null);
      setRollbackReason("");
    } catch { /* interceptor shows the toast */ }
  };

  if (isLoading) return <div className="flex h-32 items-center justify-center"><div className="loader" /></div>;
  if (isError) return (
    <div className="flex h-32 flex-col items-center justify-center gap-2">
      <p className="text-sm text-destructive">Failed to load jobs.</p>
      <Button size="sm" variant="white" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  if (jobs.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-01">
        No import jobs recorded yet. Start the import to create one.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-white-02 divide-y divide-white-02 overflow-hidden">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            onRollback={() => setRollbackJob(job)}
          />
        ))}
      </div>

      <Dialog open={!!rollbackJob} onOpenChange={(o) => { if (!o) { setRollbackJob(null); setRollbackReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rollback Import Job?</DialogTitle>
            <DialogDescription>
              This will reverse the changes made by job #{rollbackJob?.id}.
              {rollbackJob && rollbackJob.succeeded_rows > 0 && (
                <> {rollbackJob.succeeded_rows.toLocaleString()} row{rollbackJob.succeeded_rows === 1 ? "" : "s"} will be reverted.</>
              )} A rollback record will be created for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs font-medium text-black-01 font-mont">Reason (required)</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              placeholder="Why this rollback is needed…"
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="white" onClick={() => { setRollbackJob(null); setRollbackReason(""); }} disabled={rollingBack}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleRollback}
              disabled={rollingBack || !rollbackReason.trim()}
            >
              {rollingBack ? "Rolling back…" : "Confirm Rollback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function JobRow({ job, onRollback }: { job: ImportJobListItem; onRollback: () => void }) {
  const isLive = job.status === "running" || job.status === "queued";
  const canRollback = ["succeeded", "failed", "cancelled"].includes(job.status);

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={JOB_STATUS_BADGE[job.status] ?? "inactive"} className="text-[10px] capitalize">
            {isLive && <span className="size-1 rounded-full bg-current animate-pulse mr-1" />}
            {job.status}
          </Badge>
          <span className="text-xs font-mono text-gray-01">#{job.id}</span>
          {job.retry_count > 0 && (
            <span className="text-[10px] text-amber-600">Retry x{job.retry_count}</span>
          )}
        </div>
        <PermissionGate permission={P.RUN_IMPORT_ROLLBACK}>
          {canRollback && (
            <Button variant="white" size="sm" onClick={onRollback}>
              <Undo2 className="size-3.5" /> Rollback
            </Button>
          )}
        </PermissionGate>
      </div>

      {/* Progress bar */}
      {(isLive || job.progress_percent > 0) && (
        <div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                job.status === "succeeded" ? "bg-green-500" :
                job.status === "failed" || job.status === "cancelled" ? "bg-red-400" :
                "bg-primary",
              )}
              style={{ width: `${job.progress_percent}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-01 mt-1">
            {job.progress_percent}% · {job.processed_rows.toLocaleString()} / {job.total_rows.toLocaleString()} rows
          </p>
        </div>
      )}

      {/* Row counters */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        <span className="text-green-600">✓ {job.succeeded_rows.toLocaleString()} succeeded</span>
        {job.failed_rows > 0 && <span className="text-red-500">✗ {job.failed_rows.toLocaleString()} failed</span>}
        {job.skipped_rows > 0 && <span className="text-gray-01">- {job.skipped_rows.toLocaleString()} skipped</span>}
      </div>

      {/* Timestamps */}
      <div className="text-[10px] text-gray-400 flex flex-wrap gap-x-3">
        {job.started_at && <span>Started: {formatRelativeDate(job.started_at)}</span>}
        {job.completed_at && <span>Completed: {formatRelativeDate(job.completed_at)}</span>}
        <span>Created: {formatRelativeDate(job.created_at)}</span>
      </div>
    </div>
  );
}
