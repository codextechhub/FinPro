/**
 * The people at a vendor, and what a role may do with them.
 *
 * Contact people are the Field Access resource `procurement.vendor_contact`:
 * three sensitive details (name, email, phone) and four routing flags (primary,
 * receives quotation requests, receives purchase orders, active), each with its
 * own Read and Write switch. The resource has no endpoint of its own. A vendor's
 * `contacts` list is read and replaced with the vendor, so a contact row carries
 * no `_read_only_fields` and the signed-in user's `/me` map is what decides.
 *
 * Reading: a row holds `id` and the fields the role may read, and the whole
 * `contacts` key is absent unless at least one of name, email and phone is
 * readable. Writing: submitting the list needs Write on at least one of the
 * seven fields, adding or removing a person needs Write on the email (the
 * email is what identifies the person), and a value the role cannot write keeps
 * what the contact already holds. A submitted row is therefore its `id` plus
 * only the fields the role may write.
 */

import type { VendorContact } from "@/redux/services/procurement/procurement-types";
import type { FieldAccess } from "../../../components/finance-ui/field-access";

/** Field Access resource for a vendor's contact people. */
export const VENDOR_CONTACT = "procurement.vendor_contact";

/** The three details of a person, in the order a form shows them. */
export const CONTACT_DETAILS = ["name", "email", "phone"] as const;

/** The four routing flags, which choose where quotation requests and orders go. */
export const CONTACT_FLAGS = ["is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"] as const;

const CONTACT_FIELDS = [...CONTACT_DETAILS, ...CONTACT_FLAGS] as const;

type ContactField = (typeof CONTACT_FIELDS)[number];

/** True when the role may read at least one detail of a person, so the list exists for it. */
export function canReadContacts(access: FieldAccess): boolean {
  return access.anyVisible(...CONTACT_DETAILS);
}

/** True when the role may change at least one of the seven fields, so it may submit the list. */
export function canWriteContacts(access: FieldAccess): boolean {
  return CONTACT_FIELDS.some((name) => !access.isReadOnly(name, { creating: false }));
}

/** True when the role may add or remove a person, which needs Write on the email. */
export function canChangeContactList(access: FieldAccess): boolean {
  return !access.isReadOnly("email", { creating: false });
}

/**
 * True when an RFQ's list of recipients can mean anything to the role.
 *
 * The server sends an invitation's recipients only when the role may read both
 * the receives-quotation-requests and the active flags that choose them, and
 * each row only with the name and email the role may read. An empty list
 * otherwise would read as "nobody was invited", so the column is not shown.
 */
export function canReadRfqRecipients(access: FieldAccess): boolean {
  return !access.isHidden("receives_rfqs") && !access.isHidden("is_active") && access.anyVisible("name", "email");
}

/** A new person holding only the fields the role may see, with the starting routing. */
export function blankContact(access: FieldAccess, first: boolean): VendorContact {
  const start: Required<Omit<VendorContact, "id">> = {
    name: "", email: "", phone: "",
    is_primary: first, receives_rfqs: true, receives_purchase_orders: false, is_active: true,
  };
  return Object.fromEntries(
    CONTACT_FIELDS.filter((name) => !access.isHidden(name)).map((name) => [name, start[name]]),
  ) as VendorContact;
}

/** The first non-empty name, email or phone of a person, for a heading. */
export function contactTitle(contact: VendorContact): string {
  return contact.name || contact.email || contact.phone || "Contact";
}

/** The rows as they are submitted: `id` where the person exists, plus only the fields the role may write. */
export function contactsBody(rows: readonly VendorContact[], access: FieldAccess): VendorContact[] {
  return rows.map((row) => {
    const present = Object.fromEntries(
      CONTACT_FIELDS.filter((name: ContactField) => name in row).map((name) => [name, row[name]]),
    ) as VendorContact;
    const writable = access.writableOnly(present, { creating: false });
    return row.id == null ? writable : { id: row.id, ...writable };
  });
}

/**
 * The `contacts` value to send with a save, or undefined when nothing is to be sent.
 *
 * `initial` is the list as it loaded, or empty on an Add form. Nothing is sent
 * when the role may write no contact field, or when the writable part of the
 * list equals what loaded, so a save of other fields never carries contacts.
 */
export function contactsChange(
  initial: readonly VendorContact[] | undefined,
  current: readonly VendorContact[],
  access: FieldAccess,
): VendorContact[] | undefined {
  if (!canWriteContacts(access)) return undefined;
  const next = contactsBody(current, access);
  if (initial === undefined && next.length === 0) return undefined;
  return JSON.stringify(next) === JSON.stringify(contactsBody(initial ?? [], access)) ? undefined : next;
}
