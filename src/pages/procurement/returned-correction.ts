/**
 * Where a procurement document stands while its approval request is open, and
 * who may correct it.
 *
 * A requisition, purchase order, vendor bill, vendor payment or vendor credit
 * note keeps `approval_state` PENDING for as long as its request is open, and
 * that includes the time an approver has handed it back to be corrected. The
 * read shapes say which with `approval_returned`: true while the document is
 * back with whoever sent it, false while it is with its approvers.
 *
 * Only the person who sent it for approval may correct a returned document and
 * resume its request; the server refuses anybody else (403), even holding the
 * edit key, because the correction goes back to the approver under that
 * person's name. Who sent it is the workflow request's `requested_by`, read
 * from the request the detail read names (`workflow_instance_id`). A
 * requisition's own `requested_by_id` is who raised it, which need not be who
 * sent it.
 *
 * Mr Eze returns Mrs Bello's requisition for stationery asking for a cheaper
 * supplier. Mrs Bello sees Edit and Resume and the note "Sent back by Mr Eze on
 * 3 Oct 2026: Use the framework supplier". Her colleague Mr Ade, who may edit
 * requisitions, sees the note but neither button. While it was still with Mr
 * Eze, neither of them could change it.
 */

import { sameId } from "../../components/workflow/workflow-format";

/** The facts the rule reads off a procurement document. */
export interface ReturnedFacts {
  approval_state?: string | null;
  approval_returned?: boolean | null;
}

/** The facts the rule reads off the document's approval request. */
export interface ReturnedRequest {
  status?: string | null;
  requested_by?: string | number | null;
  stage_instances?: readonly {
    actions?: readonly {
      action: string;
      actor?: string | number | null;
      comment?: string | null;
      acted_at?: string | null;
      reversed_at?: string | null;
      is_reversal_of?: string | number | null;
      acted_label?: string | null;
    }[];
  }[];
}

/**
 * Where the document stands while its request is open:
 * - `sender`: back with the reader, who sent it; they may correct and resume it;
 * - `returned`: back with whoever sent it, and the reader is not known to be them;
 * - `with-approvers`: its approvers have it, and nobody may change it;
 * - `null`: no request is open, and the document's own actions apply.
 */
export type ReturnedStanding = "sender" | "returned" | "with-approvers" | null;

export function returnedStanding(
  doc: ReturnedFacts | null | undefined,
  request: ReturnedRequest | null | undefined,
  uid: string,
): ReturnedStanding {
  if (!doc || doc.approval_state !== "PENDING") return null;
  if (!doc.approval_returned) return "with-approvers";
  return request && request.status === "RETURNED" && sameId(request.requested_by, uid) ? "sender" : "returned";
}

/** The approver's hand-back: who returned it, when, and what they asked for. */
export interface ReturnFacts {
  actor: string | number | null;
  label: string;
  comment: string;
  actedAt: string | null;
}

/**
 * The latest standing RETURNED vote on the request, or null when it has none
 * (an administrator's reversal, or a request not loaded yet). A vote that was
 * later reversed, or that is itself a reversal, does not count.
 */
export function latestReturn(request: ReturnedRequest | null | undefined): ReturnFacts | null {
  let latest: ReturnFacts | null = null;
  for (const stage of request?.stage_instances ?? []) {
    for (const action of stage.actions ?? []) {
      if (action.action !== "RETURNED" || action.reversed_at || action.is_reversal_of) continue;
      if (latest && (action.acted_at ?? "") <= (latest.actedAt ?? "")) continue;
      latest = {
        actor: action.actor ?? null,
        label: action.acted_label ?? "",
        comment: (action.comment ?? "").trim(),
        actedAt: action.acted_at ?? null,
      };
    }
  }
  return latest;
}

/**
 * "Sent back by Mr Eze on 3 Oct 2026: Use the framework supplier", naming the
 * approver by the label the server gave the vote, else by `name`. Without a
 * vote to read, says only that an approver sent it back.
 */
export function sentBackLine(
  ret: ReturnFacts | null,
  name: (id: string | number | null | undefined) => string,
  day: (value: string) => string,
): string {
  if (!ret) return "An approver sent this back.";
  const who = ret.label || name(ret.actor);
  const when = ret.actedAt ? ` on ${day(ret.actedAt)}` : "";
  return `Sent back by ${who}${when}${ret.comment ? `: ${ret.comment}` : "."}`;
}

/** What the reader is told under the sent-back line, by standing. */
export const RETURNED_HINT: Readonly<Record<"sender" | "returned" | "unread", string>> = {
  sender: "Correct it with Edit, then Resume to send it back to the approver.",
  returned: "Only the person who sent it can correct it and resume it.",
  unread: "Whoever sent it can resume it from their approvals.",
};

/**
 * The hint under the sent-back line. When the document's read shape does not
 * name its request (`requestNamed` false), nobody can be told they sent it, so
 * the hint says where the sender resumes it instead.
 */
export function returnedHint(standing: "sender" | "returned", requestNamed: boolean): string {
  return standing === "returned" && !requestNamed ? RETURNED_HINT.unread : RETURNED_HINT[standing];
}

/** What the reader is told while the document is with its approvers. */
export const WITH_APPROVERS_NOTE = "With the approver. Nobody can change it until they decide or send it back.";

/** The approval pill's word: "Sent back" for a returned document, else `word`. */
export function approvalPillWord(doc: ReturnedFacts, word: string | undefined): string | undefined {
  return doc.approval_state === "PENDING" && doc.approval_returned ? "Sent back" : word;
}
