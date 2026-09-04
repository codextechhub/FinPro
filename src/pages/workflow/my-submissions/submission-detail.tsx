import { useState } from "react";
import { useParams } from "react-router";
import { Loader2, RefreshCw, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAppSelector } from "@/redux/store";
import {
  useGetWorkflowInstanceQuery,
  useWithdrawWorkflowInstanceMutation,
  useResubmitWorkflowInstanceMutation,
} from "@/redux/services/dashboard/workflow-api";
import { useUserDirectory } from "@/pages/protected/workflow/components/use-user-directory";
import { routesPath } from "../paths";
import { useLogRecentOpen } from "@xvs/finance/host";
import { sameId, humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import { DocumentPanel } from "@/pages/protected/workflow/components/document-panel";
import { StageTracker } from "@/pages/protected/workflow/components/stage-tracker";
import { AuditTimeline } from "@/pages/protected/workflow/components/audit-timeline";
import { PageShell } from "@/components/layout/page-shell";

export default function SubmissionDetail() {
  const { id = "" } = useParams();
  const user = useAppSelector((s) => s.auth.user);
  const uid = user?.id != null ? String(user.id) : "";
  const { name, initials, role } = useUserDirectory();

  const { data: instance, isLoading, isError, refetch } = useGetWorkflowInstanceQuery(id, {
    refetchOnMountOrArgChange: true,
  });
  const [withdraw, { isLoading: isWithdrawing }] = useWithdrawWorkflowInstanceMutation();
  const [resubmit, { isLoading: isResubmitting }] = useResubmitWorkflowInstanceMutation();

  const [confirmKind, setConfirmKind] = useState<"withdraw" | "resubmit" | null>(null);
  useLogRecentOpen(
    instance
      ? {
          kind: "submission",
          id,
          label: `${humanizeDocumentType(instance.document_type)} #${String(instance.document_object_id).slice(0, 8)}`,
          to: routesPath.PROTECTED.WORKFLOW.SUBMISSION_DETAIL(id),
        }
      : null,
  );

  const isOwner = !!instance && sameId(instance.requested_by, uid);
  const canWithdraw =
    isOwner && ["SUBMITTED", "IN_PROGRESS", "RETURNED"].includes(instance?.status ?? "");
  const canResubmit = isOwner && instance?.status === "RETURNED";

  const runAction = () => {
    if (!confirmKind) return;
    const fn = confirmKind === "withdraw" ? withdraw : resubmit;
    fn(id)
      .unwrap()
      .then(() => {
        toast.success(confirmKind === "withdraw" ? "Submission withdrawn." : "Resubmitted for approval.");
        setConfirmKind(null);
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
            <p className="text-sm text-destructive">Failed to load this submission.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <DocumentPanel instance={instance} name={name} initials={initials} role={role} />

            {(canWithdraw || canResubmit) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white-02 bg-white p-4">
                {instance.status === "RETURNED" && (
                  <p className="flex-1 text-xs text-orange-600">
                    This submission was returned to you for corrections. Amend the document in its
                    module, then resubmit.
                  </p>
                )}
                {canResubmit && (
                  <Button onClick={() => setConfirmKind("resubmit")} disabled={isResubmitting}>
                    <RotateCcw className="size-4" /> Resubmit
                  </Button>
                )}
                {canWithdraw && (
                  <Button variant="outline" onClick={() => setConfirmKind("withdraw")} disabled={isWithdrawing}>
                    <Undo2 className="size-4" /> Withdraw
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Workflow progress">
                <StageTracker stages={instance.stage_instances} name={name} initials={initials} />
              </Section>
              <Section title="Activity">
                <AuditTimeline logs={instance.audit_logs} name={name} />
              </Section>
            </div>
          </div>
        )}
      </PageShell>

      <Dialog open={!!confirmKind} onOpenChange={(v) => !v && setConfirmKind(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmKind === "withdraw" ? "Withdraw this submission?" : "Resubmit for approval?"}
            </DialogTitle>
            <DialogDescription>
              {confirmKind === "withdraw"
                ? "Withdrawing ends this approval request. You'll need to submit again from the module to restart."
                : "This re-enters the workflow at the stage it was returned from, with a fresh approver list."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmKind(null)} disabled={isWithdrawing || isResubmitting}>
              Cancel
            </Button>
            <Button
              variant={confirmKind === "withdraw" ? "destructive" : "default"}
              onClick={runAction}
              disabled={isWithdrawing || isResubmitting}
            >
              {isWithdrawing || isResubmitting ? "Working…" : confirmKind === "withdraw" ? "Withdraw" : "Resubmit"}
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
