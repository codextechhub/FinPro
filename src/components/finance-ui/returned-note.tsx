/**
 * The pieces a finance or procurement drawer shows for a document an approver sent back:
 * the note saying who sent it back and why, and the Resume action that puts
 * the corrected document back in front of the approver.
 *
 * Resume posts to the request's own resubmit route, which only the person who
 * sent it may use, and which re-checks the document as its submit route did. A
 * refusal (a requisition left with no lines, a bill that no longer matches)
 * leaves the request returned and reaches the reader through the central
 * handler, so nothing here words it.
 *
 * The rule for who sees what is `returned-correction.ts`.
 */
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useGetWorkflowInstanceQuery, useResubmitWorkflowInstanceMutation } from "@/redux/services/dashboard/workflow-api";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { approvalRequestApi, useGetDocumentApprovalRequestQuery } from "@/redux/services/finance/approval-request-api";
import type { FinanceTagType } from "../../redux/tag-types";
import { useUserDirectory } from "../workflow/use-user-directory";
import { useDates } from "../../lib/display-prefs";
import {
  financeReturnedFacts, latestReturn, returnedHint, returnedStanding, sentBackLine,
  type ReturnedFacts, type ReturnedRequest, type ReturnedStanding,
} from "./returned-correction";

/** The document's standing for the signed-in reader. */
export function useReturnedStanding(doc: ReturnedFacts | null | undefined, request: ReturnedRequest | null | undefined): ReturnedStanding {
  const user = useAppSelector((state) => state.auth.user);
  const uid = user?.id == null ? "" : String(user.id);
  return returnedStanding(doc, request, uid);
}

/**
 * A finance document's standing, with the request it reads it from.
 *
 * The request is the one the document's read names (`workflow_instance_id`),
 * and is read only while the document's request is open. A drawer opened from
 * a list row whose shape does not carry the field names the document's detail
 * route (`detail`, with the document's own id where the row's `id` is not it),
 * which is read for it once the document is back with whoever
 * sent it. Without the field anywhere (a server from before it, or a document
 * never sent) the reader cannot be told they sent it, so nothing is offered and
 * the note points to the approvals screen instead.
 */
export function useFinanceReturned(
  doc: (ReturnedFacts & { id?: number; workflow_instance_id?: string | number | null }) | null | undefined,
  detail?: { path: string; entity: string; id?: number | null },
) {
  const facts = financeReturnedFacts(doc);
  const detailId = detail?.id ?? doc?.id ?? 0;
  const needsDetail = !!detail && !!detailId && !!facts?.approval_returned && facts.approval_state === "PENDING" && !!doc && !("workflow_instance_id" in doc);
  const { data: detailData } = useGetDocumentApprovalRequestQuery(
    { path: detail?.path ?? "", id: detailId, entity: detail?.entity ?? "" }, { skip: !needsDetail },
  );
  const named = doc && "workflow_instance_id" in doc ? doc.workflow_instance_id : detailData?.data?.workflow_instance_id;
  const workflowId = named == null ? "" : String(named);
  const { data: request } = useGetWorkflowInstanceQuery(workflowId, { skip: !workflowId || facts?.approval_state !== "PENDING" });
  const standing = useReturnedStanding(facts, request);
  return { standing, request, workflowId, requestNamed: !!workflowId };
}

/**
 * The sent-back note, shown only while the document is back with whoever sent
 * it. `requestNamed` is false for a read shape that does not name its request;
 * `senderHint` replaces what the sender is told to do, for a document whose
 * correction is not an Edit.
 */
export function ReturnedNote({ standing, ...rest }: { standing: ReturnedStanding; request: ReturnedRequest | null | undefined; requestNamed?: boolean; senderHint?: string }) {
  if (standing !== "sender" && standing !== "returned") return null;
  return <ReturnedNoteBody standing={standing} {...rest} />;
}

/** The note itself; it reads the staff directory, so it mounts only when shown. */
function ReturnedNoteBody({ standing, request, requestNamed = true, senderHint }: { standing: "sender" | "returned"; request: ReturnedRequest | null | undefined; requestNamed?: boolean; senderHint?: string }) {
  const dates = useDates();
  const { name } = useUserDirectory();
  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <p className="font-mont text-sm font-semibold text-amber-900">{standing === "sender" ? "Sent back to you" : "Sent back"}</p>
      <p className="mt-1 break-words font-mont text-xs leading-5 text-amber-900">{sentBackLine(latestReturn(request), name, dates.day)}</p>
      <p className="mt-1 font-mont text-xs leading-5 text-amber-800">{standing === "sender" && senderHint ? senderHint : returnedHint(standing, requestNamed)}</p>
    </section>
  );
}

/**
 * Resume the returned request, sending the corrected document back to the
 * approver. The request route refreshes procurement documents; a finance
 * document's own lists are named in `tags`, so they refresh too.
 */
export function ResumeButton({ workflowId, onResumed, tags }: { workflowId: string; onResumed?: () => void; tags?: FinanceTagType[] }) {
  const [resume, { isLoading }] = useResubmitWorkflowInstanceMutation();
  const dispatch = useAppDispatch();
  const run = async () => {
    try {
      await resume(workflowId).unwrap();
      if (tags?.length) dispatch(approvalRequestApi.util.invalidateTags(tags));
      toast.success("Sent back to the approver.");
      onResumed?.();
    } catch { /* Central API handling shows the server message. */ }
  };
  return <Button loading={isLoading} disabled={!workflowId} onClick={run}><Send className="size-4" /> Resume</Button>;
}
