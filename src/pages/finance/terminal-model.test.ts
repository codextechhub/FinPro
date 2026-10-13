/**
 * Branch terminals: the words for their state and the rules for their numbers.
 *
 * Bright Star School has Ikeja and Lekki. Ikeja's terminal is open; Lekki's
 * branch has no phone on file, so its terminal waits for a number until the
 * bursar adds Mrs Adeyemi's WhatsApp.
 */
import { describe, expect, it } from "vitest";

import type { VirtualTerminal } from "@/redux/services/payments/payments-types";
import {
  codeImage,
  describeMethod,
  hasPaymentDetails,
  mayAddNumber,
  mayRemoveNumber,
  methodLines,
  numberError,
  paymentPageLink,
  posterLink,
  retryLabel,
  routeWords,
  terminalWord,
  terminalsInOrder,
} from "./terminal-model";

describe("how a terminal's state reads", () => {
  it("uses plain words for each state", () => {
    expect(terminalWord("ACTIVE").label).toBe("Open");
    expect(terminalWord("NEEDS_NUMBER").label).toBe("Waiting for a phone number");
    expect(terminalWord("FAILED").label).toBe("Failed");
    expect(terminalWord("DEACTIVATED").label).toBe("Switched off");
    expect(terminalWord("PENDING").label).toBe("Being set up");
    expect(terminalWord(undefined).label).toBe("Unknown");
  });

  it("offers Try again on a failed or pending terminal, a refresh on an open one, and nothing otherwise", () => {
    expect(retryLabel("FAILED")).toBe("Try again");
    expect(retryLabel("PENDING")).toBe("Try again");
    expect(retryLabel("ACTIVE")).toBe("Refresh details");
    expect(retryLabel("NEEDS_NUMBER")).toBeNull();
    expect(retryLabel("DEACTIVATED")).toBeNull();
  });

  it("says where the money goes, and nothing where the field is hidden", () => {
    expect(routeWords(true)).toContain("straight into the branch's bank");
    expect(routeWords(false)).toContain("Held for the branch");
    expect(routeWords(undefined)).toBeNull();
  });
});

describe("what the provider said about paying", () => {
  it("finds the payment page under any of its names", () => {
    expect(paymentPageLink({ payment_url: "https://pay.example/ikeja" })).toBe("https://pay.example/ikeja");
    expect(paymentPageLink({ link: "https://pay.example/l" })).toBe("https://pay.example/l");
    expect(paymentPageLink({ payment_link: "not a link" })).toBeNull();
    expect(paymentPageLink(undefined)).toBeNull();
  });

  it("finds a code image given as an address or inline", () => {
    expect(codeImage({ qr_code_url: "https://pay.example/qr.png" })).toBe("https://pay.example/qr.png");
    expect(codeImage({ qr_code: "data:image/png;base64,AAA" })).toBe("data:image/png;base64,AAA");
    expect(codeImage({ qr_code: "<script>alert(1)</script>" })).toBeNull();
  });

  it("finds the poster", () => {
    expect(posterLink({ poster_url: "https://pay.example/poster.pdf" })).toBe("https://pay.example/poster.pdf");
    expect(posterLink({ poster_url: "javascript:alert(1)" })).toBeNull();
  });

  it("reads payment methods whether they come as text or as objects", () => {
    expect(describeMethod("Bank transfer")).toBe("Bank transfer");
    expect(describeMethod({ type: "dedicated_account", bank: "Wema Bank", account_number: "0123456789" }))
      .toBe("dedicated_account · Wema Bank · account number: 0123456789");
    expect(describeMethod({ nested: { a: 1 } })).toBeNull();
    expect(methodLines({ paymentMethods: ["Card", { type: "ussd" }, 7] })).toEqual(["Card", "ussd"]);
    expect(methodLines({ payment_methods: ["Transfer"] })).toEqual(["Transfer"]);
    expect(methodLines({})).toEqual([]);
  });

  it("knows when the provider sent nothing to show", () => {
    expect(hasPaymentDetails({ currency: "NGN" })).toBe(false);
    expect(hasPaymentDetails({ paymentMethods: ["Card"] })).toBe(true);
    expect(hasPaymentDetails(undefined)).toBe(false);
  });
});

describe("the numbers a terminal notifies", () => {
  it("keeps up to five", () => {
    expect(mayAddNumber(4)).toBe(true);
    expect(mayAddNumber(5)).toBe(false);
  });

  it("never lets the last one go", () => {
    expect(mayRemoveNumber(2)).toBe(true);
    expect(mayRemoveNumber(1)).toBe(false);
  });

  it("wants a name and a number that looks like one", () => {
    expect(numberError("", "08012345678")).toContain("name");
    expect(numberError("Mrs Adeyemi", "abc")).toContain("country code");
    expect(numberError("Mrs Adeyemi", "08012345678")).toBeNull();
    expect(numberError("Mrs Adeyemi", "+234 801 234 5678")).toBeNull();
  });
});

describe("the order terminals are shown in", () => {
  it("is by branch name", () => {
    const row = (id: number, branch_name: string) => ({ id, branch_name }) as VirtualTerminal;
    expect(terminalsInOrder([row(2, "Lekki"), row(1, "Ikeja")]).map((t) => t.branch_name)).toEqual(["Ikeja", "Lekki"]);
  });
});
