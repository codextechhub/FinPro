// Status maps and pipeline configuration shared by the batch-detail page and
// its tab components. Extracted from view-batch.tsx so the page file stays a
// composition root rather than a 1.2k-line module.
import type { BatchStatus, ValidationSeverity } from "@/redux/services/dashboard/import-types";

export const STATUS_BADGE: Record<BatchStatus, "active" | "pending" | "suspended" | "locked" | "inactive"> = {
  draft: "inactive",
  uploaded: "inactive",
  detecting: "pending",
  mapping_required: "pending",
  validating: "locked",
  validation_failed: "suspended",
  ready_to_import: "pending",
  import_queued: "pending",
  import_running: "locked",
  import_partial: "suspended",
  import_succeeded: "active",
  import_failed: "suspended",
  rolled_back: "suspended",
  cancelled: "inactive",
};

export const STATUS_LABEL: Record<BatchStatus, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  detecting: "Detecting Dataset",
  mapping_required: "Mapping Required",
  validating: "Validating",
  validation_failed: "Validation Failed",
  ready_to_import: "Ready to Import",
  import_queued: "Import Queued",
  import_running: "Importing",
  import_partial: "Partially Imported",
  import_succeeded: "Imported",
  import_failed: "Import Failed",
  rolled_back: "Rolled Back",
  cancelled: "Cancelled",
};

export const IN_FLIGHT: Set<BatchStatus> = new Set([
  "validating", "import_queued", "import_running", "detecting",
]);

// Visual pipeline (happy path only). Terminal failure states render separately.
export const PIPELINE: BatchStatus[] = [
  "uploaded",
  "validating",
  "ready_to_import",
  "import_running",
  "import_succeeded",
];

export const PIPELINE_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  validating: "Validate",
  ready_to_import: "Ready",
  import_running: "Import",
  import_succeeded: "Done",
};

export const FAILURE_STATUSES: Set<BatchStatus> = new Set([
  "validation_failed", "import_failed", "import_partial", "rolled_back", "cancelled",
]);

export const SEVERITY_BADGE: Record<ValidationSeverity, "suspended" | "locked" | "inactive"> = {
  error: "suspended",
  warning: "locked",
  info: "inactive",
};

export const JOB_STATUS_BADGE: Record<string, "active" | "pending" | "suspended" | "locked" | "inactive"> = {
  queued: "pending",
  running: "locked",
  succeeded: "active",
  failed: "suspended",
  cancelled: "inactive",
  rolled_back: "suspended",
};

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * The line under the banner on a batch whose import failed or only partly
 * completed.
 *
 * Validation runs before the import, so the banner says what it found, from the
 * batch's own counts: an import that fails after a validation that flagged
 * errors is a different story from one that fails on clean data, and telling
 * both readers validation "passed with no issues" sends the first one looking
 * in the wrong place. The import's own failure is always in the Jobs tab.
 */
export function importFailureNote(batch: {
  error_count: number;
  warning_count: number;
  validation_summary: Record<string, unknown> | null;
}): string {
  const jobs = "The Jobs tab has the details of what went wrong during the import.";
  if (batch.validation_summary == null) return jobs;
  const summary = batch.validation_summary as Record<string, number | undefined>;
  const errors = summary.error_count ?? batch.error_count;
  const warnings = summary.warning_count ?? batch.warning_count;
  if (errors > 0) {
    const also = warnings > 0 ? ` and ${count(warnings, "warning")}` : "";
    return `Validation found ${count(errors, "error")}${also}. ${jobs}`;
  }
  if (warnings > 0) return `Validation passed with ${count(warnings, "warning")}. ${jobs}`;
  return `Validation passed with no issues, so the failure happened during the import itself. ${jobs}`;
}
