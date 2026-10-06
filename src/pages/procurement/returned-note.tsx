/**
 * The pieces a procurement drawer shows for a document an approver sent back:
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
import { useResubmitWorkflowInstanceMutation } from "@/redux/services/dashboard/workflow-api";
import { useAppSelector } from "@/redux/store";
import { useUserDirectory } from "../../components/workflow/use-user-directory";
import { useDates } from "../../lib/display-prefs";
import {
  latestReturn, returnedHint, returnedStanding, sentBackLine,
  type ReturnedFacts, type ReturnedRequest, type ReturnedStanding,
} from "./returned-correction";

/** The document's standing for the signed-in reader. */
export function useReturnedStanding(doc: ReturnedFacts | null | undefined, request: ReturnedRequest | null | undefined): ReturnedStanding {
  const user = useAppSelector((state) => state.auth.user);
  const uid = user?.id == null ? "" : String(user.id);
  return returnedStanding(doc, request, uid);
}

/**
 * The sent-back note, shown only while the document is back with whoever sent
 * it. `requestNamed` is false for a read shape that does not name its request.
 */
export function ReturnedNote({ standing, request, requestNamed = true }: { standing: ReturnedStanding; request: ReturnedRequest | null | undefined; requestNamed?: boolean }) {
  const dates = useDates();
  const { name } = useUserDirectory();
  if (standing !== "sender" && standing !== "returned") return null;
  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <p className="font-mont text-sm font-semibold text-amber-900">{standing === "sender" ? "Sent back to you" : "Sent back"}</p>
      <p className="mt-1 break-words font-mont text-xs leading-5 text-amber-900">{sentBackLine(latestReturn(request), name, dates.day)}</p>
      <p className="mt-1 font-mont text-xs leading-5 text-amber-800">{returnedHint(standing, requestNamed)}</p>
    </section>
  );
}

/** Resume the returned request, sending the corrected document back to the approver. */
export function ResumeButton({ workflowId, onResumed }: { workflowId: string; onResumed?: () => void }) {
  const [resume, { isLoading }] = useResubmitWorkflowInstanceMutation();
  const run = async () => {
    try {
      await resume(workflowId).unwrap();
      toast.success("Sent back to the approver.");
      onResumed?.();
    } catch { /* Central API handling shows the server message. */ }
  };
  return <Button loading={isLoading} disabled={!workflowId} onClick={run}><Send className="size-4" /> Resume</Button>;
}
