import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { Ban, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import PermissionGate from "@/components/custom/permission-gate";
import { P } from "@/permissions";
import { toast } from "sonner";
import { formatRelativeDate } from "@/utils/helpers";
import {
  useGetWorkflowInstanceQuery,
  useCancelWorkflowInstanceMutation,
  useReverseWorkflowActionMutation,
} from "@/redux/services/dashboard/workflow-api";
import type { WorkflowInstanceDetail } from "@/redux/services/dashboard/workflow-types";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { DocumentPanel } from "@/pages/protected/workflow/components/document-panel";
import { StageTracker } from "@/pages/protected/workflow/components/stage-tracker";
import { AuditTimeline } from "@/pages/protected/workflow/components/audit-timeline";
import { PageShell } from "@/components/layout/page-shell";

const TERMINAL = ["APPROVED", "REJECTED", "WITHDRAWN", "CANCELLED"];

type FlatAction = {
  id: string;
  stageLabel: string;
  actor: string;
  action: string;
  comment: string;
  acted_at: string;
  reversed_at: string | null;
  is_reversal_of: string | null;
};

function flattenActions(instance: WorkflowInstanceDetail): FlatAction[] {
  const rows: FlatAction[] = [];
  for (const si of instance.stage_instances) {
    for (const a of si.actions) {
      rows.push({
        id: a.id,
        stageLabel: si.stage_label,
        actor: a.actor,
        action: a.action,
        comment: a.comment,
        acted_at: a.acted_at,
        reversed_at: a.reversed_at,
        is_reversal_of: a.is_reversal_of,
      });
    }
  }
  return rows.sort((x, y) => (x.acted_at < y.acted_at ? 1 : -1));
}

export default function InstanceDetail() {
  const { id = "" } = useParams();
  const { name, initials, role } = useUserDirectory();

  const { data: instance, isLoading, isError, refetch } = useGetWorkflowInstanceQuery(id, {
    refetchOnMountOrArgChange: true,
  });
  const [cancelInstance, { isLoading: isCancelling }] = useCancelWorkflowInstanceMutation();
  const [reverseAction, { isLoading: isReversing }] = useReverseWorkflowActionMutation();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [reverseTarget, setReverseTarget] = useState<FlatAction | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const isTerminal = !!instance && TERMINAL.includes(instance.status);
  const actions = useMemo(() => (instance ? flattenActions(instance) : []), [instance]);

  const doCancel = () => {
    cancelInstance({ id, reason: cancelReason.trim() })
      .unwrap()
      .then(() => {
        toast.success("Workflow cancelled.");
        setCancelOpen(false);
        setCancelReason("");
      })
      .catch(() => {});
  };

  const doReverse = () => {
    if (!reverseTarget) return;
    reverseAction({ action_id: reverseTarget.id, reason: reverseReason.trim() })
      .unwrap()
      .then(() => {
        toast.success("Vote reversed - stage re-opened.");
        setReverseTarget(null);
        setReverseReason("");
      })
      .catch(() => {});
  };

  return (
    <>
      <PageShell className="text-black-01">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : isError || !instance ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">Failed to load this instance.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {!isTerminal && (
              <PermissionGate permission={P.CANCEL_WORKFLOW}>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => setCancelOpen(true)}
                  >
                    <Ban className="size-4" /> Cancel workflow
                  </Button>
                </div>
              </PermissionGate>
            )}

            <DocumentPanel instance={instance} name={name} initials={initials} role={role} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Workflow progress">
                <StageTracker stages={instance.stage_instances} name={name} initials={initials} />
              </Section>
              <Section title="Activity">
                <AuditTimeline logs={instance.audit_logs} name={name} />
              </Section>
            </div>

            {/* Recorded votes - admin reversal */}
            <Section title="Recorded votes">
              {actions.length === 0 ? (
                <p className="text-sm text-gray-01">No votes recorded yet.</p>
              ) : (
                <div className="divide-y divide-white-02">
                  {actions.map((a) => {
                    const reversed = !!a.reversed_at;
                    const isReversalRow = !!a.is_reversal_of;
                    const reversible = !reversed && !isReversalRow && !isTerminal;
                    return (
                      <div key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium text-black-01">{name(a.actor)}</span>{" "}
                            <span className="text-gray-01">
                              {a.action.toLowerCase()} · {a.stageLabel}
                            </span>
                          </p>
                          {a.comment && <p className="text-xs text-gray-01">“{a.comment}”</p>}
                          <p className="text-[11px] text-gray-05">{formatRelativeDate(a.acted_at)}</p>
                        </div>
                        {reversed && <Badge variant="inactive">Reversed</Badge>}
                        {isReversalRow && <Badge variant="outline">Reversal entry</Badge>}
                        {reversible && (
                          <PermissionGate permission={P.REVERSE_WORKFLOW_ACTION}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setReverseTarget(a)}
                            >
                              <Undo2 className="size-3.5" /> Reverse
                            </Button>
                          </PermissionGate>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        )}
      </PageShell>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={(v) => !v && setCancelOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Cancel this workflow?</DialogTitle>
            <DialogDescription>
              This terminates the instance immediately. The requester is notified and it cannot be
              resumed. A reason is required and recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Why is this being cancelled?"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={isCancelling}>
              Keep workflow
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={isCancelling || cancelReason.trim().length < 3}>
              {isCancelling ? "Cancelling…" : "Cancel workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse dialog */}
      <Dialog open={!!reverseTarget} onOpenChange={(v) => !v && setReverseTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse this vote?</DialogTitle>
            <DialogDescription>
              {reverseTarget && (
                <>
                  Reverses {name(reverseTarget.actor)}'s {reverseTarget.action.toLowerCase()} on{" "}
                  {reverseTarget.stageLabel}. The original vote is preserved and the stage re-opens
                  for a fresh decision.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Reason for the reversal (recorded in the audit log)"
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReverseTarget(null)} disabled={isReversing}>
              Cancel
            </Button>
            <Button onClick={doReverse} disabled={isReversing || reverseReason.trim().length < 3}>
              {isReversing ? "Reversing…" : "Reverse vote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white-02 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
