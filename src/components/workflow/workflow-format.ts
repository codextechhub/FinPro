// Pure (non-component) formatting helpers + metadata for the workflow UI.
// Kept JSX-free so it isn't a react-refresh boundary.
import type {
  ApproverScope,
  AuditEventType,
  StageAdvanceRule,
  WorkflowInstanceStatus,
  WorkflowStage,
  WorkflowStageStatus,
} from "@/redux/services/dashboard/workflow-types";

export type BadgeVariant =
  | "default" | "success" | "active" | "inactive" | "pending" | "secondary"
  | "destructive" | "rejected" | "suspended" | "locked" | "deactivated"
  | "outline" | "ghost" | "link";

export const INSTANCE_STATUS_META: Record<
  WorkflowInstanceStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: "Draft", variant: "inactive" },
  SUBMITTED: { label: "Submitted", variant: "pending" },
  IN_PROGRESS: { label: "In Progress", variant: "pending" },
  RETURNED: { label: "Returned", variant: "suspended" },
  APPROVED: { label: "Approved", variant: "active" },
  REJECTED: { label: "Rejected", variant: "rejected" },
  WITHDRAWN: { label: "Withdrawn", variant: "inactive" },
  CANCELLED: { label: "Cancelled", variant: "rejected" },
};

export const STAGE_STATUS_META: Record<
  WorkflowStageStatus,
  { label: string; variant: BadgeVariant }
> = {
  PENDING: { label: "Pending", variant: "inactive" },
  ACTIVE: { label: "Active", variant: "pending" },
  APPROVED: { label: "Approved", variant: "active" },
  REJECTED: { label: "Rejected", variant: "rejected" },
  RETURNED: { label: "Returned", variant: "suspended" },
  SKIPPED: { label: "Skipped", variant: "deactivated" },
};

export function advanceRuleLabel(rule: StageAdvanceRule, quorum?: number): string {
  if (rule === "ANY") return "Any one approver";
  if (rule === "QUORUM") return `Quorum - ${quorum ?? 0} required`;
  return "Unanimous - all must approve";
}

const ORGANOGRAM_LABEL: Record<string, string> = {
  DIRECT_MANAGER: "the requester's direct manager",
  N_LEVELS_UP: "up the reporting chain",
  DEPARTMENT_HEAD: "the head of the requester's department",
  SPECIFIC_POSITION: "the holder of a specific seat",
};

/**
 * One line naming who approves a stage, whichever way it resolves.
 *
 * Every screen that shows a stage needs this sentence, and each source hides
 * its answer in a different field - so it is computed once here rather than
 * re-derived per screen, where one of them would inevitably keep showing the
 * old strategy's field after the next change.
 */
export function approverSummary(stage: WorkflowStage): string {
  switch (stage.approver_source) {
    case "WORKFLOW_GROUP":
      return `${stage.approver_group_name || stage.approver_group_code || "?"} (group)`;
    case "DYNAMIC_ROLE": {
      const n = stage.dynamic_role_rules?.length ?? 0;
      return `Chosen by the document - ${n} ${n === 1 ? "rule" : "rules"}`;
    }
    case "ORGANOGRAM": {
      if (stage.organogram_target === "N_LEVELS_UP") {
        const levels = stage.organogram_levels ?? 1;
        return `Organogram - ${levels} ${levels === 1 ? "level" : "levels"} up`;
      }
      if (stage.organogram_target === "SPECIFIC_POSITION") {
        return `Organogram - ${stage.organogram_position_code || "a seat"}`;
      }
      return `Organogram - ${ORGANOGRAM_LABEL[stage.organogram_target] ?? "relative to the requester"}`;
    }
    default:
      return stage.approver_role_name || stage.approver_role_key || "-";
  }
}

/**
 * Where a stage looks for its approvers, in words that fit the reader.
 *
 * The stored `SCHOOL` means "the tenant that raised the request", not a school
 * specifically - it is the same value for Codex's own documents. Showing a
 * platform operator that their approval step is "scoped to school" describes
 * their own organisation as a customer, so the label follows the viewer while
 * the value stays exactly what the engine stores.
 */
export function approverScopeLabel(
  scope: ApproverScope | string,
  isPlatformTenant = false,
): string {
  if (scope === "BRANCH") return "This branch only";
  if (scope === "PLATFORM") return "Everyone, platform-wide";
  if (scope === "SCHOOL") return isPlatformTenant ? "Whole organisation" : "Whole school";
  return String(scope);
}

/** Turn a dotted document_type (e.g. "leave.request") into "Leave Request". */
export function humanizeDocumentType(docType: string): string {
  if (!docType) return "Document";
  return docType
    .split(/[._]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export const AUDIT_EVENT_LABEL: Record<AuditEventType, string> = {
  INSTANCE_SUBMITTED: "Submitted for approval",
  INSTANCE_WITHDRAWN: "Withdrawn by requester",
  INSTANCE_CANCELLED: "Cancelled by admin",
  INSTANCE_APPROVED: "Fully approved",
  INSTANCE_REJECTED: "Rejected",
  INSTANCE_RETURNED: "Returned to requester",
  INSTANCE_RESUBMITTED: "Resubmitted after return",
  STAGE_ACTIVATED: "Stage activated",
  STAGE_APPROVED: "Stage approved",
  STAGE_REJECTED: "Stage rejected",
  STAGE_SKIPPED_NO_APPROVER: "Stage skipped - no eligible approvers",
  STAGE_SKIPPED_CONDITION: "Stage skipped - condition not met",
  APPROVER_ACTED: "Approver recorded a vote",
  ACTION_REVERSED: "Admin reversed a vote",
  ROUTE_EVALUATED: "Route recomputed",
};

const AVATAR_PALETTE = [
  "bg-purple-500", "bg-blue-500", "bg-teal-600", "bg-amber-500",
  "bg-rose-500", "bg-indigo-500", "bg-emerald-600", "bg-pink-500",
];

/**
 * Compare two IDs that may arrive as either string or number across the
 * workflow + auth payloads (user FKs serialize as numbers). Null/undefined
 * never match.
 */
export function sameId(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Deterministic avatar color from a seed (user id/name). */
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
