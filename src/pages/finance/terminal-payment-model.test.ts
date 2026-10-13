/**
 * Terminal payments: reasons, suggestions and which customers a payment may go to.
 *
 * A parent pays N45,000 at Lekki's terminal from adaokeye@gmail.com, an email
 * two Lekki families share. It cannot be matched by itself, so it waits with
 * that reason; Mrs Adeyemi, who keeps Lekki's books, can choose only a Lekki
 * family or one every branch shares, never an Ikeja one.
 */
import { describe, expect, it } from "vitest";

import type { Customer } from "@/redux/services/finance/ar-types";
import type { ListBranchView } from "./receivables/list-branch";
import {
  customersForBranch,
  isUnmatched,
  matchedLine,
  senderLine,
  suggestionWords,
  terminalBranchArg,
  terminalBranchView,
  unmatchedReason,
} from "./terminal-payment-model";

const customer = (id: number, branch_id: number | null | undefined) => ({ id, code: `C-${id}`, name: `Family ${id}`, branch_id }) as Customer;

describe("whether a payment is waiting", () => {
  it("follows its status", () => {
    expect(isUnmatched({ status: "UNMATCHED", matched_customer: null })).toBe(true);
    expect(isUnmatched({ status: "MATCHED", matched_customer: 4 })).toBe(false);
  });

  it("falls back to whether a customer is named when the status is hidden", () => {
    expect(isUnmatched({ matched_customer: null })).toBe(true);
    expect(isUnmatched({ matched_customer: 4 })).toBe(false);
  });
});

describe("the reason it did not match", () => {
  it("is the server's note, or a plain fallback", () => {
    expect(unmatchedReason({ match_note: "More than one customer has the payer's email." })).toBe("More than one customer has the payer's email.");
    expect(unmatchedReason({ match_note: "  " })).toBe("Not matched to a customer yet.");
    expect(unmatchedReason({})).toBe("Not matched to a customer yet.");
  });
});

describe("suggestions and matches in words", () => {
  it("says why a customer was suggested", () => {
    expect(suggestionWords(["email", "amount"])).toBe("Same email as the payer · Owes exactly this amount");
    expect(suggestionWords(["name"])).toBe("Name looks like the sender's");
  });

  it("joins the sender's name and bank", () => {
    expect(senderLine({ sender_name: "A. OKAFOR", sender_bank: "GTBank" })).toBe("A. OKAFOR · GTBank");
    expect(senderLine({ sender_name: "", sender_bank: "GTBank" })).toBe("GTBank");
    expect(senderLine({})).toBe("");
  });

  it("says who matched a payment", () => {
    expect(matchedLine({ match_method: "AUTO", matched_customer_name: "Adeyemi" })).toBe("Matched to Adeyemi automatically, by the payer's email");
    expect(matchedLine({ match_method: "MANUAL", matched_customer_name: "Adeyemi", matched_by_name: "Mrs Eze" })).toBe("Matched to Adeyemi by Mrs Eze");
    expect(matchedLine({ match_method: "MANUAL" })).toBe("Matched to a customer");
  });
});

describe("the customers a payment may go to", () => {
  const all = [customer(1, 1), customer(2, 2), customer(3, null), customer(4, undefined)];

  it("are its branch's and the shared ones", () => {
    expect(customersForBranch(all, 2).map((c) => c.id)).toEqual([2, 3, 4]);
  });

  it("are everyone's when the payment's branch is unknown", () => {
    expect(customersForBranch(all, undefined)).toHaveLength(4);
  });
});

describe("the branch view of the list", () => {
  const view = (over: Partial<ListBranchView>): ListBranchView => ({
    applies: true, canChoose: true, selected: "all", showBranch: true, offerUnassigned: true, choices: [{ id: 1, name: "Ikeja" }, { id: 2, name: "Lekki" }], ...over,
  });

  it("never offers 'No branch yet' and reads an address naming it as every branch", () => {
    const shaped = terminalBranchView(view({ selected: "unassigned", showBranch: false }));
    expect(shaped.offerUnassigned).toBe(false);
    expect(shaped.selected).toBe("all");
    expect(shaped.showBranch).toBe(true);
    expect(terminalBranchArg(shaped)).toEqual({});
  });

  it("asks the server for the branch picked", () => {
    const shaped = terminalBranchView(view({ selected: 2, showBranch: false }));
    expect(terminalBranchArg(shaped)).toEqual({ branch: 2 });
    expect(shaped.showBranch).toBe(false);
  });

  it("asks for nothing at a school with one branch, and shows no branch", () => {
    const one = terminalBranchView(view({ applies: false, canChoose: false, showBranch: false, offerUnassigned: false }));
    expect(terminalBranchArg(one)).toEqual({});
    expect(one.showBranch).toBe(false);
  });
});
