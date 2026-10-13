/**
 * Who a purchase order email goes to, as far as the role may be told.
 *
 * Ade Stationers has Ngozi and Tunde set to receive orders. The preview names
 * them for a role that may read their addresses and the routing flags, counts
 * them for a role that may read the routing but not the addresses, and says
 * nothing for one that may read neither. A send is blocked only when the
 * preview shows nobody would receive it, never because the role cannot know.
 */

import { describe, expect, it } from "vitest";

import { emailRecipients, emailRecipientsText, hasNoEmailRecipient } from "./purchase-order-email";

describe("emailRecipients", () => {
  it("lists the addresses when there are some", () => {
    expect(emailRecipients({ recipients: ["a@x.test"], recipient_count: 1 })).toEqual({ kind: "listed", addresses: ["a@x.test"] });
    expect(emailRecipients({ recipients: ["a@x.test"] })).toEqual({ kind: "listed", addresses: ["a@x.test"] });
  });

  it("counts them when the addresses are withheld but the routing is readable", () => {
    expect(emailRecipients({ recipients: [], recipient_count: 2 })).toEqual({ kind: "counted", count: 2 });
  });

  it("reports nobody only on a count of zero", () => {
    expect(emailRecipients({ recipients: [], recipient_count: 0 })).toEqual({ kind: "none" });
  });

  it("reports unknown when neither addresses nor a count came back", () => {
    expect(emailRecipients({ recipients: [] })).toEqual({ kind: "unknown" });
  });
});

describe("emailRecipientsText", () => {
  it("reads as the preview should", () => {
    expect(emailRecipientsText({ recipients: ["a@x.test", "b@x.test"] })).toBe("a@x.test, b@x.test");
    expect(emailRecipientsText({ recipients: [], recipient_count: 1 })).toBe("1 recipient");
    expect(emailRecipientsText({ recipients: [], recipient_count: 3 })).toBe("3 recipients");
    expect(emailRecipientsText({ recipients: [], recipient_count: 0 })).toBe("No recipient");
    expect(emailRecipientsText({ recipients: [] })).toBeNull();
  });
});

describe("hasNoEmailRecipient", () => {
  it("blocks a send when there is no preview or the preview shows nobody", () => {
    expect(hasNoEmailRecipient(undefined)).toBe(true);
    expect(hasNoEmailRecipient({ recipients: [], recipient_count: 0 })).toBe(true);
  });

  it("does not block a send the role cannot see the recipients of", () => {
    expect(hasNoEmailRecipient({ recipients: [] })).toBe(false);
    expect(hasNoEmailRecipient({ recipients: [], recipient_count: 2 })).toBe(false);
    expect(hasNoEmailRecipient({ recipients: ["a@x.test"] })).toBe(false);
  });
});
