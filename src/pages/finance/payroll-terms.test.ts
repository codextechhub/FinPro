/**
 * Aisha is on N300,000 at Ikeja with a raise to N320,000 from 1 January 2027.
 * The roster says so beside today's pay, and only as far as the reader may
 * read her pay.
 */

import { describe, expect, it } from "vitest";

import { nextTermsLine, termsSinceLine } from "./payroll-terms";

const words = { money: (kobo: number) => `N${(kobo / 100).toLocaleString("en-NG")}`, day: (iso: string) => iso, multiBranch: true };
const RAISE = { effective_from: "2027-01-01", branch_id: 1, branch_name: "Ikeja Branch", gross_amount: 32_000_000, paye_amount: 3_000_000, pension_amount: 2_560_000 };

describe("the next change to a person's pay", () => {
  it("names the date and the new gross", () => {
    expect(nextTermsLine({ branch_id: 1, next_terms: RAISE }, words)).toBe("From 2027-01-01: N320,000 gross");
  });

  it("names every visible figure where asked, and a move to another branch", () => {
    expect(nextTermsLine({ branch_id: 1, next_terms: { ...RAISE, branch_id: 2, branch_name: "Lekki Branch" } }, words, ["gross_amount", "paye_amount", "pension_amount"]))
      .toBe("From 2027-01-01: N320,000 gross, N30,000 PAYE, N25,600 pension, at Lekki Branch");
  });

  it("leaves the move out at a school with one branch", () => {
    expect(nextTermsLine({ branch_id: 1, next_terms: { ...RAISE, branch_id: 2, branch_name: "Lekki Branch" } }, { ...words, multiBranch: false }))
      .toBe("From 2027-01-01: N320,000 gross");
  });

  it("says only the date to a reader who may not read the pay", () => {
    const hidden = { effective_from: "2027-01-01", branch_id: 1, branch_name: "Ikeja Branch" };
    expect(nextTermsLine({ branch_id: 1, next_terms: hidden }, words)).toBe("New pay terms from 2027-01-01");
  });

  it("says nothing when no change is dated ahead", () => {
    expect(nextTermsLine({ branch_id: 1, next_terms: null }, words)).toBeNull();
    expect(nextTermsLine({ branch_id: 1 }, words)).toBeNull();
  });
});

describe("when today's terms began", () => {
  it("reads as since, or as a start still to come", () => {
    expect(termsSinceLine({ terms_effective_from: "2026-09-01" }, { day: (d) => d, today: "2026-10-05" })).toBe("Since 2026-09-01");
    expect(termsSinceLine({ terms_effective_from: "2026-11-03" }, { day: (d) => d, today: "2026-10-05" })).toBe("Starts on 2026-11-03");
    expect(termsSinceLine({ terms_effective_from: null }, { day: (d) => d, today: "2026-10-05" })).toBeNull();
  });
});
