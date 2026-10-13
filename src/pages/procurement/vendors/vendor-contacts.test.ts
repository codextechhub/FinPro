/**
 * Bright Star School keeps three people at Ade Stationers: Ngozi, who orders,
 * and two others. A clerk who may read and correct names and emails but not
 * phone numbers or routing must be able to fix a typo without wiping a phone
 * number she cannot see or re-routing the orders she cannot read the routing
 * of.
 *
 * Contact people are the Field Access resource `procurement.vendor_contact`;
 * their rows carry no `_read_only_fields`, so the signed-in user's map decides.
 */

import { describe, expect, it } from "vitest";

import type { VendorContact } from "@/redux/services/procurement/procurement-types";
import { resolveFieldAccess, type FieldAccessMap } from "../../../components/finance-ui/field-access";
import {
  VENDOR_CONTACT, blankContact, canChangeContactList, canReadContacts, canReadRfqRecipients,
  canWriteContacts, contactTitle, contactsBody, contactsChange,
} from "./vendor-contacts";

const access = (map: FieldAccessMap = {}) => resolveFieldAccess(map, VENDOR_CONTACT);

const FULL: VendorContact[] = [
  { id: 1, name: "Ngozi Eze", email: "ngozi@ade.test", phone: "0803", is_primary: true, receives_rfqs: true, receives_purchase_orders: true, is_active: true },
  { id: 2, name: "Tunde Bello", email: "tunde@ade.test", phone: "0805", is_primary: false, receives_rfqs: true, receives_purchase_orders: false, is_active: true },
];

/** The clerk: reads and changes name and email, reads phone and every flag but changes none. */
const CLERK: FieldAccessMap = { [VENDOR_CONTACT]: { read_only: ["phone", "is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"] } };

describe("what a role may do with a vendor's contact people", () => {
  it("reads the list when it may read any of name, email and phone", () => {
    expect(canReadContacts(access())).toBe(true);
    expect(canReadContacts(access({ [VENDOR_CONTACT]: { hidden: ["name", "phone"] } }))).toBe(true);
    expect(canReadContacts(access({ [VENDOR_CONTACT]: { hidden: ["name", "email", "phone"] } }))).toBe(false);
  });

  it("submits the list when it may change any of the seven fields", () => {
    expect(canWriteContacts(access())).toBe(true);
    expect(canWriteContacts(access(CLERK))).toBe(true);
    const everything = ["name", "email", "phone", "is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"];
    expect(canWriteContacts(access({ [VENDOR_CONTACT]: { read_only: everything } }))).toBe(false);
    expect(canWriteContacts(access({ [VENDOR_CONTACT]: { hidden: everything } }))).toBe(false);
  });

  it("adds and removes people only with Write on the email", () => {
    expect(canChangeContactList(access())).toBe(true);
    expect(canChangeContactList(access({ [VENDOR_CONTACT]: { read_only: ["email"] } }))).toBe(false);
    expect(canChangeContactList(access({ [VENDOR_CONTACT]: { hidden: ["email"] } }))).toBe(false);
  });

  it("shows an RFQ's recipients only when the flags that choose them and a detail are readable", () => {
    expect(canReadRfqRecipients(access())).toBe(true);
    expect(canReadRfqRecipients(access({ [VENDOR_CONTACT]: { hidden: ["receives_rfqs"] } }))).toBe(false);
    expect(canReadRfqRecipients(access({ [VENDOR_CONTACT]: { hidden: ["is_active"] } }))).toBe(false);
    expect(canReadRfqRecipients(access({ [VENDOR_CONTACT]: { hidden: ["name", "email"] } }))).toBe(false);
    expect(canReadRfqRecipients(access({ [VENDOR_CONTACT]: { hidden: ["name", "phone"] } }))).toBe(true);
  });
});

describe("the rows a save carries", () => {
  it("sends id and every field to a role that may change them all", () => {
    expect(contactsBody(FULL, access())).toEqual(FULL);
  });

  it("sends only id, name and email for the clerk, never the phone or the routing", () => {
    expect(contactsBody(FULL, access(CLERK))).toEqual([
      { id: 1, name: "Ngozi Eze", email: "ngozi@ade.test" },
      { id: 2, name: "Tunde Bello", email: "tunde@ade.test" },
    ]);
  });

  it("sends a hidden detail's absence as absence, keeping the id that identifies the person", () => {
    const rows: VendorContact[] = [{ id: 1, name: "Ngozi Eze", is_primary: true, receives_rfqs: true, receives_purchase_orders: true, is_active: true }];
    const map: FieldAccessMap = { [VENDOR_CONTACT]: { hidden: ["email", "phone"], read_only: ["email"] } };
    expect(contactsBody(rows, access(map))).toEqual([
      { id: 1, name: "Ngozi Eze", is_primary: true, receives_rfqs: true, receives_purchase_orders: true, is_active: true },
    ]);
  });

  it("sends a new person without an id", () => {
    expect(contactsBody([{ name: "Kemi", email: "kemi@ade.test", phone: "" }], access())).toEqual([{ name: "Kemi", email: "kemi@ade.test", phone: "" }]);
  });
});

describe("whether a save carries the contact list at all", () => {
  it("sends nothing when the writable part of the list is unchanged", () => {
    expect(contactsChange(FULL, FULL.map((row) => ({ ...row })), access())).toBeUndefined();
  });

  it("does not count a change the role cannot make", () => {
    const edited = FULL.map((row) => ({ ...row, phone: "0000" }));
    expect(contactsChange(FULL, edited, access(CLERK))).toBeUndefined();
    expect(contactsChange(FULL, edited, access())).toEqual(edited);
  });

  it("sends the corrected email beside the id and leaves the phone alone for the clerk", () => {
    const edited = [{ ...FULL[0], email: "ngozi.eze@ade.test", phone: "0000" }, FULL[1]];
    expect(contactsChange(FULL, edited, access(CLERK))).toEqual([
      { id: 1, name: "Ngozi Eze", email: "ngozi.eze@ade.test" },
      { id: 2, name: "Tunde Bello", email: "tunde@ade.test" },
    ]);
  });

  it("sends nothing at all to a role that may change no contact field", () => {
    const everything = ["name", "email", "phone", "is_primary", "receives_rfqs", "receives_purchase_orders", "is_active"];
    expect(contactsChange(FULL, [], access({ [VENDOR_CONTACT]: { read_only: everything } }))).toBeUndefined();
  });

  it("sends an emptied list as a removal, and a list added to an empty vendor", () => {
    expect(contactsChange(FULL, [], access())).toEqual([]);
    expect(contactsChange([], [FULL[0]], access())).toEqual([FULL[0]]);
    expect(contactsChange(undefined, [], access())).toBeUndefined();
  });
});

describe("a new person", () => {
  it("starts with the routing a new contact gets, the first one primary", () => {
    expect(blankContact(access(), true)).toEqual({
      name: "", email: "", phone: "", is_primary: true, receives_rfqs: true, receives_purchase_orders: false, is_active: true,
    });
    expect(blankContact(access(), false).is_primary).toBe(false);
  });

  it("holds only the fields the role may see", () => {
    expect(blankContact(access({ [VENDOR_CONTACT]: { hidden: ["phone", "is_primary", "is_active"] } }), false)).toEqual({
      name: "", email: "", receives_rfqs: true, receives_purchase_orders: false,
    });
  });

  it("is titled by the first detail that is there", () => {
    expect(contactTitle({ id: 1, name: "Ngozi", email: "n@x.test" })).toBe("Ngozi");
    expect(contactTitle({ id: 1, email: "n@x.test" })).toBe("n@x.test");
    expect(contactTitle({ id: 1, phone: "0803" })).toBe("0803");
    expect(contactTitle({ id: 1, is_primary: true })).toBe("Contact");
  });
});
