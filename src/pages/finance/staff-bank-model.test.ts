/**
 * Tunde Adeyemi's bank account. Bola, the bursar, saves her cousin's number for
 * him; Paystack names Bola Okafor, so the account needs a second person. Mr Eze
 * confirms it after asking Tunde. The server says who may: not Bola, and not Tunde.
 */
import { describe, expect, it } from "vitest";
import {
  bankChanges, bankFormOf, bankFormProblem, cleanAccountNumber, confirmOffer, offersCheckAgain, staffBankWord,
} from "./staff-bank-model";

const account = (over: Record<string, unknown> = {}) => ({
  id: 1, employee_id: 40, employee_name: "Tunde Adeyemi", bank_code: "058", bank_name: "GTBank", account_number: "0123456789",
  resolved_account_name: "BOLA OKAFOR", verification_state: "NEEDS_CONFIRMATION", changed_by_name: "Bola Okafor", ...over,
}) as never;

describe("an account in plain words", () => {
  it("reads Checked for a matching name, and for one a second person confirmed", () => {
    expect(staffBankWord("VERIFIED")?.label).toBe("Checked");
    expect(staffBankWord("CONFIRMED")?.label).toBe("Checked");
  });

  it("reads Needs a second person and Could not check", () => {
    expect(staffBankWord("NEEDS_CONFIRMATION")?.label).toBe("Needs a second person");
    expect(staffBankWord("FAILED")?.label).toBe("Could not check");
    expect(staffBankWord("UNVERIFIED")?.label).toBe("Not checked yet");
  });

  it("has no word for a status the reader may not read", () => {
    expect(staffBankWord(undefined)).toBeNull();
  });

  it("offers Check again only where Paystack was not reached or could not find the account", () => {
    expect(offersCheckAgain(account({ verification_state: "UNVERIFIED" }))).toBe(true);
    expect(offersCheckAgain(account({ verification_state: "FAILED" }))).toBe(true);
    expect(offersCheckAgain(account({ verification_state: "VERIFIED" }))).toBe(false);
    expect(offersCheckAgain(account({ verification_state: "NEEDS_CONFIRMATION" }))).toBe(false);
  });
});

describe("who may confirm", () => {
  it("offers Confirm when the server says the reader may confirm", () => {
    expect(confirmOffer(account({ can_confirm: true }), true)).toEqual({ offered: true, hint: null });
  });

  it("explains, to a holder of the key the server refuses, who may confirm", () => {
    const offer = confirmOffer(account({ can_confirm: false }), true);
    expect(offer.offered).toBe(false);
    expect(offer.hint).toContain("cannot be the person who made the last change");
  });

  it("tells a reader without the key nothing", () => {
    expect(confirmOffer(account({ can_confirm: false }), false)).toEqual({ offered: false, hint: null });
  });

  it("never offers it where the check status is hidden, so there is no answer", () => {
    expect(confirmOffer(account({ can_confirm: undefined, verification_state: undefined }), true)).toEqual({ offered: false, hint: null });
  });

  it("says nothing on an account that is not waiting for a second person", () => {
    expect(confirmOffer(account({ verification_state: "VERIFIED", can_confirm: false }), true)).toEqual({ offered: false, hint: null });
  });
});

describe("the account form", () => {
  it("takes ten digits, ignoring spaces", () => {
    expect(cleanAccountNumber("0123 456 789")).toBe("0123456789");
    expect(cleanAccountNumber("12345")).toBeNull();
    expect(cleanAccountNumber("01234567890")).toBeNull();
  });

  it("asks for the bank and a ten-digit number", () => {
    expect(bankFormProblem({ bankCode: "", bankName: "", accountNumber: "0123456789" })).toBe("Choose the staff member's bank.");
    expect(bankFormProblem({ bankCode: "058", bankName: "GTBank", accountNumber: "123" })).toBe("Enter the 10-digit account number.");
    expect(bankFormProblem({ bankCode: "058", bankName: "GTBank", accountNumber: "0123456789" })).toBeNull();
  });

  it("sends only what changed", () => {
    const saved = account();
    expect(bankChanges(saved, bankFormOf(saved))).toEqual({});
    expect(bankChanges(saved, { bankCode: "058", bankName: "GTBank", accountNumber: "0123 456 780" })).toEqual({ account_number: "0123456780" });
    expect(bankChanges(saved, { bankCode: "044", bankName: "Access Bank", accountNumber: "0123456789" })).toEqual({ bank_code: "044", bank_name: "Access Bank" });
  });

  it("sends a whole new account for a staff member with none", () => {
    expect(bankChanges(null, { bankCode: "058", bankName: "GTBank", accountNumber: "0123456789" })).toEqual({
      bank_code: "058", bank_name: "GTBank", account_number: "0123456789",
    });
  });
});
