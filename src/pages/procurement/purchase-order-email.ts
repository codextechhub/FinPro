/**
 * Who a purchase order email goes to, as the preview tells a role that may not
 * read every part of the answer.
 *
 * The addresses are a vendor contact's email, or the vendor's own when it has no
 * contact, and each is shown only to a role that may read the field it came
 * from. Which contacts receive orders is also the outcome of the routing flags
 * (active, receives purchase orders, primary), so the addresses and their count
 * are both withheld from a role that may not read all three: the list would say
 * which contacts hold the flags. The preview then has no addresses and no
 * `recipient_count`, and the screen cannot tell "nobody" from "somebody it may
 * not know".
 */

import type { PurchaseOrderEmailPreview } from "@/redux/services/procurement/procurement-types";

export type EmailRecipients =
  | { kind: "listed"; addresses: string[] }
  | { kind: "counted"; count: number }
  | { kind: "none" }
  | { kind: "unknown" };

/** What the preview says about the recipients: the addresses, a count, nobody, or nothing the role may know. */
export function emailRecipients(preview: Pick<PurchaseOrderEmailPreview, "recipients" | "recipient_count">): EmailRecipients {
  if (preview.recipients.length > 0) return { kind: "listed", addresses: preview.recipients };
  if (preview.recipient_count == null) return { kind: "unknown" };
  return preview.recipient_count > 0 ? { kind: "counted", count: preview.recipient_count } : { kind: "none" };
}

/** True only when the preview shows that nobody would receive the email; unknown recipients do not block a send. */
export function hasNoEmailRecipient(preview: Pick<PurchaseOrderEmailPreview, "recipients" | "recipient_count"> | undefined): boolean {
  return !preview || emailRecipients(preview).kind === "none";
}

/** The "To" line of the preview, or null when the role may not know who receives the email. */
export function emailRecipientsText(preview: Pick<PurchaseOrderEmailPreview, "recipients" | "recipient_count">): string | null {
  const recipients = emailRecipients(preview);
  switch (recipients.kind) {
    case "listed": return recipients.addresses.join(", ");
    case "counted": return `${recipients.count} ${recipients.count === 1 ? "recipient" : "recipients"}`;
    case "none": return "No recipient";
    default: return null;
  }
}
