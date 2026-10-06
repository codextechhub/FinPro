/**
 * Mrs Bello (user 4) sends a requisition for approval and Mr Eze (user 7)
 * returns it asking for the framework supplier. Mrs Bello may correct and
 * resume it; Mr Ade (user 9) may not, even holding the edit key. While it was
 * still with Mr Eze, nobody could change it.
 */
import { describe, expect, it } from "vitest";

import {
  approvalPillWord, financeReturnedFacts, isSentBack, latestReturn, sentBackPill, statusFilterArgs, returnedHint, returnedStanding, sentBackLine, type ReturnedRequest,
} from "./returned-correction";

const REQUEST: ReturnedRequest = {
  status: "RETURNED",
  requested_by: 4,
  stage_instances: [{
    actions: [
      { action: "RETURNED", actor: 7, comment: "Wrong vendor", acted_at: "2026-10-01T09:00:00Z", reversed_at: "2026-10-01T10:00:00Z" },
      { action: "APPROVED", actor: 8, comment: "", acted_at: "2026-10-02T09:00:00Z" },
      { action: "RETURNED", actor: 7, comment: " Use the framework supplier ", acted_at: "2026-10-03T09:00:00Z", acted_label: "Mr Eze" },
    ],
  }],
};
const RETURNED_DOC = { approval_state: "PENDING", approval_returned: true };

describe("returnedStanding", () => {
  it("lets the person who sent it correct a returned document", () => {
    expect(returnedStanding(RETURNED_DOC, REQUEST, "4")).toBe("sender");
  });

  it("tells anybody else it is back with whoever sent it", () => {
    expect(returnedStanding(RETURNED_DOC, REQUEST, "9")).toBe("returned");
    expect(returnedStanding(RETURNED_DOC, undefined, "4")).toBe("returned");
    expect(returnedStanding(RETURNED_DOC, { ...REQUEST, status: "IN_PROGRESS" }, "4")).toBe("returned");
  });

  it("says a pending document not returned is with its approvers, for the sender too", () => {
    expect(returnedStanding({ approval_state: "PENDING", approval_returned: false }, REQUEST, "4")).toBe("with-approvers");
    expect(returnedStanding({ approval_state: "PENDING" }, REQUEST, "4")).toBe("with-approvers");
  });

  it("leaves a document with no open request to its own actions", () => {
    expect(returnedStanding({ approval_state: "NOT_SUBMITTED", approval_returned: false }, REQUEST, "4")).toBeNull();
    expect(returnedStanding({ approval_state: "APPROVED", approval_returned: true }, REQUEST, "4")).toBeNull();
    expect(returnedStanding(undefined, REQUEST, "4")).toBeNull();
  });
});

describe("latestReturn and sentBackLine", () => {
  const name = (id: string | number | null | undefined) => (id === 7 ? "Chidi Eze" : "-");
  const day = (value: string) => value.slice(0, 10);

  it("reads the latest standing return, not a reversed one", () => {
    expect(latestReturn(REQUEST)).toEqual({ actor: 7, label: "Mr Eze", comment: "Use the framework supplier", actedAt: "2026-10-03T09:00:00Z" });
    expect(sentBackLine(latestReturn(REQUEST), name, day)).toBe("Sent back by Mr Eze on 2026-10-03: Use the framework supplier");
  });

  it("names the approver from the directory when the vote carries no label, and ends without a comment", () => {
    const plain: ReturnedRequest = { stage_instances: [{ actions: [{ action: "RETURNED", actor: 7, comment: "", acted_at: "2026-10-03T09:00:00Z" }] }] };
    expect(sentBackLine(latestReturn(plain), name, day)).toBe("Sent back by Chidi Eze on 2026-10-03.");
  });

  it("says only that an approver sent it back when there is no vote to read", () => {
    expect(latestReturn(undefined)).toBeNull();
    expect(sentBackLine(null, name, day)).toBe("An approver sent this back.");
  });
});

describe("returnedHint and approvalPillWord", () => {
  it("points to the approvals screen when the read shape does not name the request", () => {
    expect(returnedHint("sender", true)).toContain("Resume");
    expect(returnedHint("returned", true)).toBe("Only the person who sent it can correct it and resume it.");
    expect(returnedHint("returned", false)).toBe("Whoever sent it can resume it from their approvals.");
  });

  it("reads Sent back on a returned document's approval pill", () => {
    expect(approvalPillWord(RETURNED_DOC, "Awaiting approval")).toBe("Sent back");
    expect(approvalPillWord({ approval_state: "PENDING", approval_returned: false }, "Awaiting approval")).toBe("Awaiting approval");
  });
});

describe("financeReturnedFacts", () => {
  it("reads a finance DRAFT still PENDING as sent back when the server does not say", () => {
    expect(financeReturnedFacts({ status: "DRAFT", approval_state: "PENDING" })?.approval_returned).toBe(true);
    expect(financeReturnedFacts({ status: "PENDING_APPROVAL", approval_state: "PENDING" })?.approval_returned).toBe(false);
  });

  it("keeps what the server says", () => {
    expect(financeReturnedFacts({ status: "DRAFT", approval_state: "PENDING", approval_returned: false })?.approval_returned).toBe(false);
  });
});

describe("sentBackPill", () => {
  it("wears Sent back on a document back with its sender, and its own pill otherwise", () => {
    expect(sentBackPill(RETURNED_DOC, "PENDING_APPROVAL")).toEqual({ status: "SENT_BACK", label: "Sent back" });
    expect(sentBackPill({ approval_state: "PENDING", approval_returned: false }, "PENDING_APPROVAL", "Awaiting approval"))
      .toEqual({ status: "PENDING_APPROVAL", label: "Awaiting approval" });
  });

  it("reads a finance DRAFT left PENDING as sent back only where asked to", () => {
    const old = { status: "DRAFT", approval_state: "PENDING" };
    expect(isSentBack(old)).toBe(false);
    expect(isSentBack(old, true)).toBe(true);
    expect(sentBackPill(old, "DRAFT", "Draft", true).label).toBe("Sent back");
  });
});

describe("the Sent back filter", () => {
  it("asks a list for ?approval=returned rather than a status", () => {
    expect(statusFilterArgs("SENT_BACK")).toEqual({ approval: "returned" });
    expect(statusFilterArgs("DRAFT")).toEqual({ status: "DRAFT" });
    expect(statusFilterArgs("OVERDUE", "display_status")).toEqual({ display_status: "OVERDUE" });
    expect(statusFilterArgs("")).toEqual({});
  });

  it("never sends Sent back as a status word, which a list refuses", () => {
    expect(statusFilterArgs("SENT_BACK", "display_status")).toEqual({ approval: "returned" });
    expect(Object.values(statusFilterArgs("SENT_BACK"))).not.toContain("SENT_BACK");
  });
});
