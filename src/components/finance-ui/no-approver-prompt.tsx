/**
 * <useNoApproverPrompt> - warn at submission when nobody can approve what was
 * just submitted, and offer to continue anyway.
 *
 * A workflow stage that resolves to nobody activates with an empty approver
 * snapshot, and the document *parks*: submitted, waiting, and with no human
 * able to move it. Without this the submit looks like it worked and the
 * document quietly sits there. Every submit-for-approval endpoint now returns
 * an `approval` block saying whether that happened; pass it here.
 *
 * Nothing in this file assumes *how* a stage picks its approvers. The backend
 * sends a ready-made `requirement` sentence describing what would staff it, and
 * that design has now been through one real migration: permission keys were
 * replaced by roles, groups, document-driven rules and organogram seats, and
 * the only thing here that needed touching was the optional key chip. The
 * sentence carried every other case unchanged.
 *
 * The dialog is deliberately blunt about the trade. Continuing takes the
 * document to its terminal state with no second pair of eyes, which on a payout
 * or a purchase order is the entire maker-checker control, so the copy says so
 * rather than reading like a routine confirmation. The backend records who
 * continued and refuses the release outright if anybody can still decide the
 * stage, so a dialog left open while an approver is appointed cannot bypass
 * them.
 *
 *   const { promptIfParked, noApproverDialog } = useNoApproverPrompt();
 *   const res = await submitForApproval(...).unwrap();
 *   promptIfParked(res.data?.approval);
 *   ...
 *   {noApproverDialog}
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionModal } from "@/components/finance-ui/confirm-action-modal";
import { useContinueWithoutApprovalMutation } from "@/redux/services/dashboard/workflow-api";
import type { ApprovalParkState } from "@/redux/services/dashboard/workflow-types";

// DialogContent has a 200ms close animation. Keep the result toast behind that
// transition so a completed outcome is never announced over the confirmation
// that produced it.
const DIALOG_CLOSE_DELAY_MS = 250;

interface Options {
  /** What the user submitted, lowercase, for the dialog copy ("payout batch"). */
  documentLabel?: string;
  /** Ran after a successful release, e.g. to close a drawer or refetch. */
  onContinued?: () => void;
}

export function useNoApproverPrompt({ documentLabel = "document", onContinued }: Options = {}) {
  const [park, setPark] = useState<ApprovalParkState | null>(null);
  const [continueWithoutApproval, { isLoading }] = useContinueWithoutApprovalMutation();

  const closeThenNotify = useCallback((message: string) => {
    setPark(null);
    window.setTimeout(() => toast.success(message), DIALOG_CLOSE_DELAY_MS);
    onContinued?.();
  }, [onContinued]);

  /**
   * Open the warning if the submission parked. Safe to call unconditionally
   * with whatever the submit response returned: an approved or ordinarily
   * routed document passes `parked: false` and nothing happens.
   */
  const promptIfParked = useCallback((approval?: ApprovalParkState | null) => {
    if (approval?.parked) setPark(approval);
  }, []);

  const confirm = useCallback(async () => {
    if (!park) return;
    try {
      await continueWithoutApproval({ id: park.instance_id }).unwrap();
      closeThenNotify(`Continued without approval. This ${documentLabel} has been recorded as approved.`);
    } catch (err) {
      // The commonest failure is not a failure: somebody became able to approve
      // between the warning and the click, so the backend refused the bypass.
      // That is the right outcome and reads as good news.
      const code = (err as { data?: { error?: { code?: string } } })?.data?.error?.code;
      if (code === "NOT_PARKED") {
        closeThenNotify("Someone can approve this now, so it has gone for review instead.");
        return;
      }
      const message = (err as { data?: { message?: string } })?.data?.message;
      toast.error(message || "Could not continue without approval.");
    }
  }, [park, continueWithoutApproval, documentLabel, closeThenNotify]);

  const noApproverDialog = (
    <ConfirmActionModal
      open={!!park}
      onOpenChange={(open) => { if (!open) setPark(null); }}
      title="Nobody can approve this"
      // Deliberately says "able to approve" rather than naming a mechanism: this
      // sentence has to stay true for a role, an approver group, a rule that
      // picks the role off the document, and an organogram seat alike. The
      // specific fix belongs in `requirement` below, which the backend words.
      description={`This ${documentLabel} was submitted, but no one is currently able to approve it, so it will wait indefinitely.`}
      confirmText="Continue anyway"
      cancelText="Leave it waiting"
      onConfirm={confirm}
      loading={isLoading}
      destructive
    >
      <div className="space-y-3 text-sm text-gray-01">
        <p>
          Continuing approves it <span className="font-semibold">without review</span>.
          Your name and the time are recorded against it.
        </p>
        {park?.stage_label && (
          <p className="text-xs text-gray-500">
            Waiting on: <span className="font-medium text-black-01">{park.stage_label}</span>
          </p>
        )}
        {(park?.role_key || park?.requirement) && (
          <p className="text-xs text-gray-500">
            To fix this properly,{" "}
            {park.role_key ? (
              // Only a role-sourced stage sends a key, and the chip is worth the
              // extra markup there because the key is a literal an admin looks up.
              <>
                assign someone to the{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-black-01">
                  {park.role_key}
                </code>{" "}
                role
              </>
            ) : (
              // Every other source, including ones added after this was written,
              // arrives as a plain sentence. Rendering it verbatim is what keeps
              // this dialog correct when the approver model changes.
              park.requirement
            )}{" "}
            and leave this waiting. It will reach them as soon as they have it.
          </p>
        )}
      </div>
    </ConfirmActionModal>
  );

  return { promptIfParked, noApproverDialog };
}
