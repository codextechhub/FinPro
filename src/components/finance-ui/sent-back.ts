/**
 * Whether a finance document is a draft only because an approver sent it back
 * for changes.
 *
 * A request returned to its requester is not over: the document is a DRAFT
 * again, but its request waits at the step that returned it, to be resumed from
 * the approvals screen. The document's own submit/ or send/ route refuses it
 * (INVALID_INSTANCE_STATE), because a second request would put the same credit
 * note in front of the approvers twice, and a correction is refused while the
 * request waits. So a screen offers Submit, Send or Edit
 * on a draft only when it was not sent back, and says where to go instead.
 *
 * Mrs Bello's credit note for Tunde is returned by the bursar asking for a
 * reason. Its drawer offers no Submit and no Edit; it tells her to resume the
 * request from her approvals, or withdraw it there. Once withdrawn, the note is
 * an ordinary draft again, and Submit and Edit are offered.
 *
 * The answer is read from the document's `approval_state`, the latest approval
 * request's state in the vocabulary the bank documents already report
 * (`vs_finance.approvals.approval_states`): PENDING on a draft means sent back.
 * A document whose read shape does not carry it reads as not sent back, and
 * the server's refusal on submit remains the last word.
 */

/** The facts the rule reads off any finance document. */
export interface SentBackFacts {
  status?: string | null;
  approval_state?: string | null;
}

/** The document is a draft waiting on a request an approver sent back. */
export function sentBackForChanges(doc: SentBackFacts): boolean {
  return doc.status === "DRAFT" && doc.approval_state === "PENDING";
}

/** Where a reader goes with a document that was sent back. */
export const SENT_BACK_NOTE =
  "An approver sent this back to you. Resume the request from your approvals, or withdraw it there to correct this and send it again.";
