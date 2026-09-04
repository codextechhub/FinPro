import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { Check, X, CornerUpLeft, ShieldAlert, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/redux/store";
import {
  useGetWorkflowInstanceQuery,
  useRecordWorkflowActionMutation,
} from "@/redux/services/dashboard/workflow-api";
import type { VoteAction, WorkflowInstanceDetail } from "@/redux/services/dashboard/workflow-types";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { routesPath } from "../paths";
import { useLogRecentOpen } from "@xvs/finance/host";
import { sameId, INSTANCE_STATUS_META, humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import { DocumentPanel } from "@/pages/protected/workflow/components/document-panel";
import { StageTracker } from "@/pages/protected/workflow/components/stage-tracker";
import { AuditTimeline } from "@/pages/protected/workflow/components/audit-timeline";
import { PageShell } from "@/components/layout/page-shell";

const VOTE_COPY: Record<VoteAction, { title: string; confirm: string; note: string }> = {
  APPROVED: {
    title: "Approve this stage?",
    confirm: "Confirm approval",
    note: "Your approval counts toward this stage's advance rule and may finalize it.",
  },
  REJECTED: {
    title: "Reject this submission?",
    confirm: "Confirm rejection",
    note: "Depending on this stage's configuration, rejection either ends the workflow or returns it to the requester.",
  },
  RETURNED: {
    title: "Return to requester?",
    confirm: "Confirm return",
    note: "The requester can correct the document based on your comment and resubmit at this stage.",
  },
};

export default function ApprovalDetail() {
  const { id = "" } = useParams();
  const user = useAppSelector((s) => s.auth.user);
  const uid = user?.id != null ? String(user.id) : "";
  const { name, initials, role } = useUserDirectory();

  const { data: instance, isLoading, isError, refetch } = useGetWorkflowInstanceQuery(id, {
    refetchOnMountOrArgChange: true,
  });
  const [recordAction, { isLoading: isVoting }] = useRecordWorkflowActionMutation();
  useLogRecentOpen(
    instance
      ? {
          kind: "approval",
          id,
          label: `${humanizeDocumentType(instance.document_type)} #${String(instance.document_object_id).slice(0, 8)}`,
          to: routesPath.PROTECTED.WORKFLOW.APPROVAL_DETAIL(id),
        }
      : null,
  );

  const [mode, setMode] = useState<Exclude<VoteAction, "APPROVED"> | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<{ action: VoteAction; comment: string } | null>(null);

  // Use the highest-attempt ACTIVE stage. After a return → resubmit there can
  // briefly be more than one ACTIVE row for a stage; the latest attempt is the
  // one actually awaiting a decision (and carries the fresh approver snapshot).
  const activeStage = useMemo(() => {
    const actives = (instance?.stage_instances ?? []).filter((s) => s.status === "ACTIVE");
    return actives.length
      ? actives.reduce((latest, s) => (s.attempt > latest.attempt ? s : latest))
      : undefined;
  }, [instance]);

  // The active stage instance now carries its own on_rejection (denormalised
  // by the serializer), so the reject-confirmation copy reflects real
  // behaviour without re-fetching the template.
  const onRejection = activeStage?.on_rejection;

  const rejectNote =
    onRejection === "TERMINAL"
      ? "This stage is terminal on rejection - the workflow ends and the requester cannot resubmit this instance."
      : onRejection === "RETURN_TO_REQUESTER"
        ? "On rejection this returns to the requester, who can correct the document and resubmit at this stage."
        : VOTE_COPY.REJECTED.note;

  // Can the current user vote on the active stage right now?
  const { canVote, blockedReason } = useMemo(() => {
    if (!instance) return { canVote: false, blockedReason: "" };
    if (instance.status !== "IN_PROGRESS")
      return { canVote: false, blockedReason: "This workflow is not awaiting votes." };
    if (!activeStage) return { canVote: false, blockedReason: "No stage is currently active." };
    const eligible = activeStage.eligible_approvers.some(
      (a) => sameId(a.user, uid) && a.attempt === activeStage.attempt,
    );
    if (!eligible)
      return { canVote: false, blockedReason: "You are not an eligible approver for this stage." };
    const acted = activeStage.actions.some(
      (a) => sameId(a.actor, uid) && !a.is_reversal_of && !a.reversed_at && a.attempt === activeStage.attempt,
    );
    if (acted) return { canVote: false, blockedReason: "You have already voted on this stage." };
    return { canVote: true, blockedReason: "" };
  }, [instance, activeStage, uid]);

  // Plain-language helper for the decision panel + the Approve confirm note,
  // derived from the active stage's rule + votes so far (no jargon, no other
  // approver names). "Next step" comes from the backend preview.
  const voteOutcome = useMemo(() => {
    if (!activeStage) return null;
    const attempt = activeStage.attempt;
    const eligibleCount = activeStage.eligible_approvers.filter((a) => a.attempt === attempt).length;
    const approvedCount = activeStage.actions.filter(
      (a) => a.action === "APPROVED" && !a.is_reversal_of && !a.reversed_at && a.attempt === attempt,
    ).length;

    const needed =
      activeStage.advance_rule === "ANY"
        ? 1
        : activeStage.advance_rule === "QUORUM"
          ? Math.max(activeStage.quorum_count || 1, 1)
          : Math.max(eligibleCount, 1); // UNANIMOUS

    const helper =
      activeStage.advance_rule === "ANY"
        ? "A single approval clears this step."
        : activeStage.advance_rule === "QUORUM"
          ? `${approvedCount} of ${needed} approvals so far - ${needed} clear this step.`
          : `${approvedCount} of ${needed} approvals so far - everyone must approve to clear this step.`;

    const finalizes = approvedCount + 1 >= needed;
    const remaining = Math.max(needed - (approvedCount + 1), 0);
    const next = instance?.next_stage;

    const approveNote = finalizes
      ? next?.is_final
        ? "This is the final approval - the request will be fully approved."
        : next?.label
          ? `This completes “${activeStage.stage_label}” and sends the request to ${next.label}.`
          : `This completes “${activeStage.stage_label}” and moves the request forward.`
      : `Your approval is recorded. “${activeStage.stage_label}” still needs ${remaining} more ${
          remaining === 1 ? "approval" : "approvals"
        } before it moves on.`;

    return { helper, approveNote };
  }, [activeStage, instance]);

  // Progress line for the workflow panel header (e.g. "Stage 2 of 4 · …").
  // Skipped stages are hidden in the tracker, so they're excluded from the
  // count and index here too - otherwise the numbers wouldn't match.
  const stages = (instance?.stage_instances ?? []).filter((s) => s.status !== "SKIPPED");
  const activeIndex = stages.findIndex((s) => s.status === "ACTIVE");
  const progressText = !instance
    ? ""
    : instance.status !== "IN_PROGRESS"
      ? INSTANCE_STATUS_META[instance.status]?.label ?? instance.status
      : activeIndex >= 0
        ? `Stage ${activeIndex + 1} of ${stages.length} · ${canVote ? "Awaiting your vote" : activeStage?.stage_label ?? "In review"}`
        : "In progress";

  const submit = () => {
    if (!confirm) return;
    const action = confirm.action;
    const votedStageId = activeStage?.id;
    recordAction({ id, action, comment: confirm.comment })
      .unwrap()
      .then((updated) => {
        toast.success(outcomeMessage(action, updated, votedStageId));
        setConfirm(null);
        setMode(null);
        setReason("");
      })
      .catch(() => {});
  };

  return (
    <>
      <PageShell className="text-black-01">
        {isLoading ? (
          <CenterState>
            <Loader2 className="size-6 animate-spin text-primary" />
          </CenterState>
        ) : isError || !instance ? (
          <CenterState>
            <p className="text-sm text-destructive">Failed to load this approval.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </CenterState>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            {/* Left: document panel */}
            <div data-guide="approval-detail.document" className="space-y-5 min-w-0">
              <DocumentPanel instance={instance} name={name} initials={initials} role={role} />
              <Section title="Activity">
                <AuditTimeline logs={instance.audit_logs} name={name} />
              </Section>
            </div>

            {/* Right: workflow + decision */}
            <aside data-guide="approval-detail.workflow" className="space-y-5">
              <div className="rounded-lg border border-white-02 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Workflow</h3>
                  <span className="text-xs text-gray-01">{instance.template_code}</span>
                </div>
                {progressText && <p className="mb-4 mt-0.5 text-xs text-gray-01">{progressText}</p>}
                <StageTracker stages={instance.stage_instances} name={name} initials={initials} />
              </div>

              <div data-guide="approval-detail.decision" className="rounded-lg border border-white-02 bg-white p-5">
                <h3 className="text-sm font-semibold">Your decision</h3>
                {canVote ? (
                  <>
                    {!mode && voteOutcome?.helper && (
                      <p className="mt-1 text-xs text-gray-01">{voteOutcome.helper}</p>
                    )}
                    {!mode ? (
                      <div className="mt-3 space-y-2">
                        <Button
                          className="w-full bg-green-01 hover:bg-green-01/90 text-white"
                          size="lg"
                          onClick={() => setConfirm({ action: "APPROVED", comment: "" })}
                        >
                          <Check /> Approve
                        </Button>
                        <Button
                          variant="destructive"
                          className="w-full"
                          size="lg"
                          onClick={() => setMode("REJECTED")}
                        >
                          <X /> Reject
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full text-orange-500 border-orange-200 hover:bg-orange-50"
                          size="lg"
                          onClick={() => setMode("RETURNED")}
                        >
                          <CornerUpLeft /> Return to requester
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <label className="text-xs font-medium">
                          Reason <span className="text-destructive">*</span>{" "}
                          <span className="text-gray-01">
                            (
                            {mode === "REJECTED"
                              ? onRejection === "RETURN_TO_REQUESTER"
                                ? "returns to requester"
                                : "ends the workflow"
                              : "sent to the requester"}
                            )
                          </span>
                        </label>
                        <Textarea
                          rows={4}
                          value={reason}
                          maxLength={500}
                          placeholder={
                            mode === "REJECTED"
                              ? "Why is this being rejected?"
                              : "What corrections does the requester need to make?"
                          }
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <div className="text-right text-[11px] text-gray-05">{reason.length} / 500</div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMode(null);
                              setReason("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant={mode === "REJECTED" ? "destructive" : "default"}
                            disabled={reason.trim().length < 5}
                            onClick={() => setConfirm({ action: mode, comment: reason.trim() })}
                          >
                            Continue
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-2 flex items-start gap-2 text-xs text-gray-01">
                    <ShieldAlert className="size-4 shrink-0 text-gray-05" />
                    {blockedReason}
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </PageShell>

      {/* Confirmation */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle
              className={cn(
                confirm?.action === "APPROVED" && "text-green-01",
                confirm?.action === "REJECTED" && "text-destructive",
                confirm?.action === "RETURNED" && "text-orange-500",
              )}
            >
              {confirm ? VOTE_COPY[confirm.action].title : ""}
            </DialogTitle>
            <DialogDescription>
              {confirm
                ? confirm.action === "REJECTED"
                  ? rejectNote
                  : confirm.action === "APPROVED"
                    ? voteOutcome?.approveNote ?? VOTE_COPY.APPROVED.note
                    : VOTE_COPY.RETURNED.note
                : ""}
            </DialogDescription>
          </DialogHeader>
          {confirm?.comment && (
            <div className="rounded-md bg-gray-50 border border-white-02 px-3 py-2 text-sm text-gray-01">
              “{confirm.comment}”
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-gray-01">
            <ShieldAlert className="size-4 shrink-0 text-gray-05" />
            This action is recorded in the audit log with your name and timestamp. Admins can reverse it.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={isVoting}>
              Cancel
            </Button>
            <Button
              variant={confirm?.action === "REJECTED" ? "destructive" : "default"}
              className={cn(confirm?.action === "APPROVED" && "bg-green-01 hover:bg-green-01/90 text-white")}
              onClick={submit}
              disabled={isVoting}
            >
              {isVoting ? "Submitting…" : confirm ? VOTE_COPY[confirm.action].confirm : ""}
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

/** Success toast that reflects the real outcome of a vote (from the response). */
function outcomeMessage(
  action: VoteAction,
  inst: WorkflowInstanceDetail,
  votedStageId?: string,
): string {
  if (action === "APPROVED") {
    if (inst.status === "APPROVED") return "Approved - request fully approved.";
    const voted = inst.stage_instances.find((s) => s.id === votedStageId);
    if (voted && voted.status === "APPROVED") {
      return inst.current_stage_label
        ? `Approved - moved to ${inst.current_stage_label}.`
        : "Approved - workflow advanced.";
    }
    return "Approval recorded.";
  }
  if (action === "REJECTED") {
    return inst.status === "RETURNED"
      ? "Rejected - returned to the requester."
      : "Rejected - workflow ended.";
  }
  return "Returned to the requester for corrections.";
}

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">{children}</div>
  );
}
