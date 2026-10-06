/**
 * The shared state words: a filter and a pill that read them name each state
 * once, and a state no map names falls back to the pill's own label.
 */
import { describe, expect, it } from "vitest";
import { APPROVAL_STATE_WORDS, DOCUMENT_STATUS_WORDS, PAYMENT_PROGRESS_WORDS, statusWord } from "./status-words";

describe("statusWord", () => {
  it("names a document waiting on an approver and a voided one as every list does", () => {
    expect(statusWord("PENDING_APPROVAL")).toBe("Awaiting approval");
    expect(statusWord("reversed")).toBe("Voided");
  });

  it("reads the approval overlay and payment progress from their own maps", () => {
    expect(statusWord("PENDING", APPROVAL_STATE_WORDS)).toBe("Awaiting approval");
    expect(statusWord("PARTIAL", PAYMENT_PROGRESS_WORDS)).toBe("Partly paid");
  });

  it("leaves a state the map does not name to the pill", () => {
    expect(statusWord("OVERDUE")).toBeUndefined();
    expect(statusWord(null)).toBeUndefined();
  });

  it("says awaiting approval the same way for a document and for its approval overlay", () => {
    expect(DOCUMENT_STATUS_WORDS.PENDING_APPROVAL).toBe(APPROVAL_STATE_WORDS.PENDING);
  });
});
