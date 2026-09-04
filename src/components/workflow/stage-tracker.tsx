import { Check, X, CornerUpLeft, Clock, SkipForward, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/utils/relative-date";
import type {
  WorkflowStageInstance,
  WorkflowStageStatus,
} from "@/redux/services/dashboard/workflow-types";
import { InitialsAvatar, StageStatusBadge } from "./workflow-ui";

type Resolver = (id?: string | null) => string;

const NODE_STYLES: Record<WorkflowStageStatus, { ring: string; icon: React.ReactNode }> = {
  APPROVED: { ring: "bg-green-01 border-green-01 text-white", icon: <Check className="size-3.5" /> },
  REJECTED: { ring: "bg-destructive border-destructive text-white", icon: <X className="size-3.5" /> },
  ACTIVE: { ring: "bg-yellow-01 border-yellow-01 text-white", icon: <Clock className="size-3.5" /> },
  RETURNED: { ring: "bg-orange-500 border-orange-500 text-white", icon: <CornerUpLeft className="size-3" /> },
  SKIPPED: { ring: "bg-gray-200 border-gray-200 text-gray-500", icon: <SkipForward className="size-3" /> },
  PENDING: { ring: "bg-white border-gray-300 text-gray-300", icon: <Clock className="size-3" /> },
};

const VOTE_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  APPROVED: { label: "Approved", cls: "text-green-01", icon: <Check className="size-3" /> },
  REJECTED: { label: "Rejected", cls: "text-destructive", icon: <X className="size-3" /> },
  RETURNED: { label: "Returned", cls: "text-orange-500", icon: <CornerUpLeft className="size-3" /> },
};

/**
 * Vertical stage stepper for a workflow instance. Each stage shows its status,
 * eligible approvers (snapshot), and the live votes recorded against the
 * current attempt. Reversed votes are excluded from the live tally.
 */
export function StageTracker({
  stages,
  name,
  initials,
}: {
  stages: WorkflowStageInstance[];
  name: Resolver;
  initials: Resolver;
}) {
  // Skipped stages (branch nodes, unmet conditions, no-approver / retired
  // skips) are recorded for audit but never shown in the workflow tracker.
  const visible = stages.filter((s) => s.status !== "SKIPPED");

  if (!visible.length) {
    return <p className="text-sm text-gray-01">No stages have been reached yet.</p>;
  }

  return (
    <ol className="relative">
      {visible.map((s, i) => {
        const node = NODE_STYLES[s.status] ?? NODE_STYLES.PENDING;
        const isLast = i === visible.length - 1;
        // Live votes on the current attempt (exclude reversals + reversed rows).
        const liveActions = s.actions.filter(
          (a) => !a.is_reversal_of && !a.reversed_at && a.attempt === s.attempt,
        );
        return (
          <li key={s.id} className="relative flex gap-3 pb-6 last:pb-0">
            {/* connector line */}
            {!isLast && (
              <span className="absolute left-[13px] top-7 bottom-0 w-px bg-gray-200" aria-hidden />
            )}
            {/* node */}
            <span
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-content-center rounded-full border",
                node.ring,
              )}
            >
              {s.stage_kind === "BRANCH" ? <GitBranch className="size-3.5" /> : node.icon}
            </span>

            <div className="min-w-0 flex-1 -mt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-black-01">{s.stage_label}</span>
                {s.stage_kind === "BRANCH" && (
                  <span className="text-[11px] uppercase tracking-wide text-gray-01">Routing</span>
                )}
                <StageStatusBadge status={s.status} />
                {s.attempt > 1 && (
                  <span className="text-xs text-gray-01">attempt {s.attempt}</span>
                )}
              </div>

              {s.skip_reason && (
                <p className="mt-1 text-xs text-gray-01 italic">{s.skip_reason}</p>
              )}

              {/* Recorded votes only - deliberately does NOT list other
                  eligible approvers who still have this in their queue. */}
              {liveActions.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {liveActions.map((a) => {
                    const vm = VOTE_META[a.action];
                    return (
                      <li key={a.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <InitialsAvatar initials={initials(a.actor)} seed={a.actor} size={20} />
                          <span className="text-black-01">{name(a.actor)}</span>
                          {a.on_behalf_of && (
                            <span className="text-gray-01">(for {name(a.on_behalf_of)})</span>
                          )}
                          {vm && (
                            <span className={cn("inline-flex items-center gap-0.5 font-medium", vm.cls)}>
                              {vm.icon} {vm.label}
                              {a.acted_at && (
                                <span className="font-normal text-gray-01">
                                  · {formatRelativeDate(a.acted_at)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {a.comment && (
                          <p className="ml-7 mt-1 rounded-md border border-white-02 bg-gray-50 px-3 py-1.5 text-gray-01">
                            “{a.comment}”
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
