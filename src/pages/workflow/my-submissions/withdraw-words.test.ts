/**
 * Mrs Bello withdraws three requests: Ikeja's float return, which is cancelled;
 * money Ikeja sent Lekki unasked, which is cancelled too; and a journal, which
 * goes back to a draft she can send again.
 */
import { describe, expect, it } from "vitest";

import { withdrawDescription } from "./withdraw-words";

describe("withdrawDescription", () => {
  it("says a petty cash return is cancelled", () => {
    expect(withdrawDescription("finance.petty_cash_return")).toContain("cancels the return");
  });

  it("says unasked money between branches is cancelled and asked-for money waits again", () => {
    expect(withdrawDescription("finance.inter_branch_transfer")).toContain("Money sent without being asked for is cancelled");
  });

  it("says anything else is submitted again from its own screen", () => {
    expect(withdrawDescription("finance.journal_entry")).toBe("Withdrawing ends this approval request. You'll need to submit again from the module to restart.");
  });
});
