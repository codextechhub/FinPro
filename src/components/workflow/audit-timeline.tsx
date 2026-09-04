import { formatRelativeDate } from "@/utils/relative-date";
import type { AuditEventType, WorkflowAuditLog } from "@/redux/services/dashboard/workflow-types";
import { AUDIT_EVENT_LABEL } from "./workflow-format";

type Resolver = (id?: string | null) => string;

// Internal routing/skip events are recorded for audit but hidden from the
// user-facing activity feed.
const HIDDEN_EVENTS = new Set<AuditEventType>([
  "STAGE_SKIPPED_NO_APPROVER",
  "STAGE_SKIPPED_CONDITION",
  "ROUTE_EVALUATED",
]);

/** Append-only audit log rendered as a vertical timeline (newest first). */
export function AuditTimeline({
  logs,
  name,
}: {
  logs: WorkflowAuditLog[];
  name: Resolver;
}) {
  const visible = logs.filter((log) => !HIDDEN_EVENTS.has(log.event_type));

  if (!visible.length) {
    return <p className="text-sm text-gray-01">No audit events recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-4">
      {visible.map((log, i) => (
        <li key={log.id} className="relative flex gap-3">
          {i !== visible.length - 1 && (
            <span className="absolute left-[5px] top-3.5 h-full w-px bg-gray-200" aria-hidden />
          )}
          <span className="relative z-10 mt-1 size-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-black-01">
              {AUDIT_EVENT_LABEL[log.event_type] ?? log.event_type}
              {log.actor && (
                <span className="text-gray-01"> · {name(log.actor)}</span>
              )}
            </p>
            {log.message && <p className="text-xs text-gray-01 mt-0.5">{log.message}</p>}
            <p className="text-[11px] text-gray-05 mt-0.5">
              {formatRelativeDate(log.occurred_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
