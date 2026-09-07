/**
 * The one place the job vocabulary and the export-run vocabulary meet.
 *
 * A BackgroundJob says whether the WORKER finished. For an export that is not
 * the whole truth: a job can SUCCEED while the file it produced left columns or
 * rows out. vs_exports.tasks.run_export_task reports that back in
 * `BackgroundJob.result` as {run, status, rows, omissions}, so the queue row can
 * show the RUN's status instead of the job's - otherwise a partly-complete
 * export reads here as a clean success, which is exactly the confusion the
 * Export Centre exists to remove. See docs/EXPORT_BUILD_NOTES.md.
 *
 * Kept free of React so it can be tested directly.
 */

import type { BackgroundJob } from "@/redux/services/dashboard/queue-types";

export interface ExportOutcome {
  /** Human-quotable run reference, e.g. RUN-7F31C2. Empty when absent. */
  reference: string;
  /** A vs_exports RunStatus - COMPLETED, COMPLETED_WITH_OMISSIONS, … */
  status: string;
  /** Rows actually written, or null when the task did not report it. */
  rows: number | null;
  /** How many things were left out. 0 for a clean run. */
  omissions: number;
}

/**
 * The export run behind an export job, or null when there isn't one.
 *
 * `result` is typed `unknown` because every task puts something different
 * there, so this narrows defensively rather than casting: a malformed or
 * unexpected payload yields null and the caller falls back to the job's own
 * status, which is always present.
 */
export function exportOutcome(job: Pick<BackgroundJob, "kind" | "result">): ExportOutcome | null {
  if (job.kind?.toLowerCase() !== "export") return null;
  const result = job.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;

  const bag = result as Record<string, unknown>;
  const status = typeof bag.status === "string" ? bag.status : "";
  // MISSING is the task's own word for "the run row was gone by the time I
  // looked". There is no export outcome to report, so defer to the job.
  if (!status || status === "MISSING") return null;

  return {
    reference: typeof bag.run === "string" || typeof bag.run === "number" ? String(bag.run) : "",
    status,
    rows: typeof bag.rows === "number" ? bag.rows : null,
    omissions: typeof bag.omissions === "number" ? bag.omissions : 0,
  };
}

/** The status a queue row should show: the export run's, else the job's. */
export function displayStatus(job: Pick<BackgroundJob, "kind" | "result" | "status">): string {
  return exportOutcome(job)?.status ?? job.status;
}
