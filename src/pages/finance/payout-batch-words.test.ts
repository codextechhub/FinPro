/**
 * Mrs Bello builds the October salaries batch at Bright Star and sends it for
 * approval. While Mr Eze has it, it reads Awaiting approval, not Draft; once
 * he sends it back, it reads Sent back. The batch filter offers each word and
 * Sent back, and no word lists a batch sent back.
 */
import { describe, expect, it } from "vitest";
import type { PayoutBatchSummary } from "@/redux/services/payments/payments-types";
import { statusFilterArgs } from "@/components/finance-ui/returned-correction";
import { PAYOUT_BATCH_FILTERS, payoutBatchStatus, payoutBatchWord } from "./payout-batch-words";

type Facts = Pick<PayoutBatchSummary, "status" | "display_status" | "approval_state" | "approval_returned">;
const batch = (over: Partial<Facts>): Facts => ({ status: "DRAFT", approval_state: "NOT_SUBMITTED", approval_returned: false, ...over });

describe("a payout batch's word", () => {
  it("reads the server's display_status, so a batch with its approver reads Awaiting approval", () => {
    expect(payoutBatchWord(batch({ display_status: "PENDING_APPROVAL", approval_state: "PENDING" }))).toBe("Awaiting approval");
    expect(payoutBatchWord(batch({ display_status: "DRAFT" }))).toBe("Draft");
    expect(payoutBatchWord(batch({ status: "PARTIALLY_COMPLETED", display_status: "PARTIALLY_COMPLETED" }))).toBe("Partly completed");
  });

  it("reads Sent back on a batch sent back, which keeps display_status DRAFT", () => {
    const back = batch({ display_status: "DRAFT", approval_state: "PENDING", approval_returned: true });
    expect(payoutBatchStatus(back)).toBe("SENT_BACK");
    expect(payoutBatchWord(back)).toBe("Sent back");
  });

  it("reads a batch from an older server by its stored status, a DRAFT with its approver as Awaiting approval", () => {
    expect(payoutBatchWord(batch({ approval_state: "PENDING", approval_returned: false }))).toBe("Awaiting approval");
    expect(payoutBatchWord(batch({ status: "COMPLETED", approval_state: "APPROVED" }))).toBe("Completed");
  });
});

describe("the batch filter", () => {
  it("offers each word the list takes, then Sent back as approval=returned", () => {
    expect(PAYOUT_BATCH_FILTERS.map(([value]) => value)).toEqual([
      "DRAFT", "PENDING_APPROVAL", "PROCESSING", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "SENT_BACK",
    ]);
    expect(PAYOUT_BATCH_FILTERS.at(-1)).toEqual(["SENT_BACK", "Sent back"]);
    expect(statusFilterArgs("SENT_BACK")).toEqual({ approval: "returned" });
    expect(statusFilterArgs("PENDING_APPROVAL")).toEqual({ status: "PENDING_APPROVAL" });
  });
});
