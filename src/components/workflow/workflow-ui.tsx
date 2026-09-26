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
 * Compact reference for a business document in a queue row.
 *
 * The engine does not own document content, but it keeps the title the
 * document's handler gave it at submission ("JV-0042", "Finance Admin for
 * Emeka Obi"). Where there is one it leads, with the type beside it; where
 * there is none the type leads, with a short object id so two rows of the
 * same type can be told apart.
 */
export function DocumentRef({
  documentType,
  objectId,
  label,
  title,
  className,
}: {
  documentType: string;
  objectId: string;
  /** The server's `document_type_label`. */
  label?: string | null;
  /** The server's `document_title`. */
  title?: string | null;
  className?: string;
}) {
  const type = humanizeDocumentType(documentType, label);
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5", className)}>
      <span className="break-words font-medium text-black-01">{title || type}</span>
      <span className="shrink-0 text-xs text-gray-01">
        {title ? type : <span className="font-mono">#{String(objectId).slice(0, 8)}</span>}
      </span>
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
