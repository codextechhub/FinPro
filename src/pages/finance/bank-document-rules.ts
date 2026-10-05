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
 * Whether a bank document is a draft back from approval, which its requester may
 * correct, send again or cancel.
 *
 * The server allows all three for a DRAFT no approver holds: one rejected
 * (`REJECTED`), or one whose request was withdrawn or cancelled
 * (`NOT_SUBMITTED`). A document waiting on its approvers, posted, voided or
 * cancelled is refused (422), so nothing is offered for it.
 */
export function bankDocumentReworkable(doc: ApprovalFacts): boolean {
  return doc.status === "DRAFT" && (doc.approval_state === "REJECTED" || doc.approval_state === "NOT_SUBMITTED");
}

/**
 * What a bank document not yet in the books says about its approval, or null.
 *
 * Ikeja's N5,000,000 capital receipt waits while its approval is pending. Once
 * the approver rejects it, it reads as rejected and not in the books, not as
 * still waiting, though its status is back at DRAFT either way; it can then be
 * corrected and sent again, or cancelled. A draft whose request was withdrawn
 * or cancelled says the same.
 */
export function bankDocumentApprovalNote(doc: ApprovalFacts): { tone: "waiting" | "rejected" | "returned"; text: string } | null {
  if (doc.status !== "DRAFT" && doc.status !== "PENDING_APPROVAL") return null;
  if (doc.approval_state === "REJECTED") {
    return { tone: "rejected", text: "Rejected under Workflow, Approvals, so it has not reached the books. Correct it and send it again, or cancel it." };
  }
  if (doc.approval_state === "PENDING" || doc.status === "PENDING_APPROVAL" || doc.approval_state === undefined) {
    return { tone: "waiting", text: "Waiting for approval under Workflow, Approvals. It reaches the books once approved." };
  }
  if (doc.approval_state === "NOT_SUBMITTED") {
    return { tone: "returned", text: "Not sent for approval, or its request was withdrawn. Correct it and send it again, or cancel it." };
  }
  return null;
}

/**
 * The fields a correction changes, and only those: a PATCH sends nothing the
 * reader left as it was, so the server's audit of the edit names what moved.
 * Both sides use the same shape the create form sends (an account by its code,
 * a bank account by its id, an empty reference as "").
 */
export function changedFields<T extends Record<string, string | number>>(before: T, after: T): Partial<T> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => value !== before[key])) as Partial<T>;
}
