import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  WorkflowInstanceStatus,
  WorkflowStageStatus,
} from "@/redux/services/dashboard/workflow-types";
import {
  avatarColor,
  humanizeDocumentType,
  INSTANCE_STATUS_META,
  STAGE_STATUS_META,
} from "./workflow-format";

export function InstanceStatusBadge({ status }: { status: WorkflowInstanceStatus }) {
  const meta = INSTANCE_STATUS_META[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function StageStatusBadge({ status }: { status: WorkflowStageStatus }) {
  const meta = STAGE_STATUS_META[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/**
 * Compact reference for a business document. The workflow engine does not own
 * document content, so we render the humanized type + a short object id.
 */
export function DocumentRef({
  documentType,
  objectId,
  className,
}: {
  documentType: string;
  objectId: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-medium text-black-01">{humanizeDocumentType(documentType)}</span>
      <span className="font-mono text-xs text-gray-01">#{String(objectId).slice(0, 8)}</span>
    </span>
  );
}

/** Small initials avatar; deterministic color from the seed (user id/name). */
export function InitialsAvatar({
  initials,
  seed,
  size = 26,
  className,
}: {
  initials: string;
  seed: string | number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid place-content-center rounded-full text-white font-semibold shrink-0",
        avatarColor(String(seed)),
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

/** Name + avatar + optional role line, fed from the user directory. */
export function UserChip({
  id,
  name,
  initials,
  role,
  size = 26,
}: {
  id: string;
  name: string;
  initials: string;
  role?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 min-w-0">
      <InitialsAvatar initials={initials} seed={id} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-black-01">{name}</span>
        {role ? <span className="block truncate text-xs text-gray-01">{role}</span> : null}
      </span>
    </span>
  );
}
