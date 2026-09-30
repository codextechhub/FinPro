import { sameId } from "../../components/workflow/workflow-format";
import { routesPath } from "../workflow/paths";

/**
 * Where "Open approval workflow" leads, or null when this app has nowhere to
 * send the reader.
 *
 * The full instance view, on Manage Approvals, is for a reader who may view
 * every request (`canViewInstances`) in an app that mounts it. Anyone else who
 * raised the requisition goes to their own view of what they submitted, which
 * is the same instance with the withdraw and resubmit actions beside it; anyone
 * else again gets the drawer's own Approval tab and no link, rather than a link
 * to a page that would refuse them.
 */
export function approvalWorkflowLink(
  workflowId: string,
  requestedBy: string | number | null | undefined,
  uid: string,
  serves: (to: string) => boolean,
  canViewInstances: boolean,
): string | null {
  if (!workflowId) return null;
  const instance = routesPath.PROTECTED.WORKFLOW.INSTANCE_DETAIL(workflowId);
  if (canViewInstances && serves(instance)) return instance;
  const submission = routesPath.PROTECTED.WORKFLOW.SUBMISSION_DETAIL(workflowId);
  return uid && sameId(requestedBy, uid) && serves(submission) ? submission : null;
}
