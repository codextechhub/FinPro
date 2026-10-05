import type { BankDocumentApprovalState } from "@/redux/services/finance/bank-documents-types";

/**
 * Whether a bank account can move money on a bank document, as plain data.
 *
 * At a school with several branches an account not yet given a branch moves
 * nothing: no branch's books could carry what passed through it, and no
 * branch's bursar could see it. The server refuses it by name; the form says
 * the same before anything is sent. At a one-branch school every account is
 * that branch's, so the question does not arise.
 */

export function bankDocumentAccountProblem(
  account: { name: string; branch_id?: number | null } | undefined,
  multiBranch: boolean,
): string | null {
  if (!account || !multiBranch || account.branch_id != null) return null;
  return `${account.name} has not been given a branch, so no money can move through it. Give it its branch first.`;
}

interface ApprovalFacts {
  status: string;
  approval_state?: BankDocumentApprovalState;
}

/**
 * The status a bank document's pill shows. A DRAFT whose approval was rejected
 * reads Rejected, and one whose request is in flight reads Pending approval;
 * every other document shows its own status.
 */
export function bankDocumentStatus(doc: ApprovalFacts): string {
  if (doc.status !== "DRAFT" && doc.status !== "PENDING_APPROVAL") return doc.status;
  if (doc.approval_state === "REJECTED") return "REJECTED";
  if (doc.approval_state === "PENDING") return "PENDING_APPROVAL";
  return doc.status;
}

/**
 * What a bank document not yet in the books says about its approval, or null.
 *
 * Ikeja's N5,000,000 capital receipt waits while its approval is pending. Once
 * the approver rejects it, it reads as rejected and never reaching the books,
 * not as still waiting, though its status is back at DRAFT either way.
 */
export function bankDocumentApprovalNote(doc: ApprovalFacts): { tone: "waiting" | "rejected"; text: string } | null {
  if (doc.status !== "DRAFT" && doc.status !== "PENDING_APPROVAL") return null;
  if (doc.approval_state === "REJECTED") {
    return { tone: "rejected", text: "Rejected under Workflow, Approvals, so it never reached the books. Record it again if the money still needs recording." };
  }
  if (doc.approval_state === "PENDING" || doc.status === "PENDING_APPROVAL" || doc.approval_state === undefined) {
    return { tone: "waiting", text: "Waiting for approval under Workflow, Approvals. It reaches the books once approved." };
  }
  return null;
}
