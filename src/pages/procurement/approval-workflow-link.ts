import { sameId } from "../../components/workflow/workflow-format";
import { routesPath } from "../workflow/paths";

/**
 * Where "Open approval workflow" leads, or null when this app has nowhere to
 * send the reader.
 *
 * The console mounts the full instance view for everyone. The school app does
 * not; it has the requester's own view of what they submitted, which is the
 * same instance with the withdraw and resubmit actions beside it. Anyone else
 * reading the requisition there gets the drawer's own Approval tab instead.
 */
export function approvalWorkflowLink(
  workflowId: string,
  requestedBy: string | number | null | undefined,
  uid: string,
  serves: (to: string) => boolean,
): string | null {
  if (!workflowId) return null;
  const instance = routesPath.PROTECTED.WORKFLOW.INSTANCE_DETAIL(workflowId);
  if (serves(instance)) return instance;
  const submission = routesPath.PROTECTED.WORKFLOW.SUBMISSION_DETAIL(workflowId);
  return uid && sameId(requestedBy, uid) && serves(submission) ? submission : null;
}
