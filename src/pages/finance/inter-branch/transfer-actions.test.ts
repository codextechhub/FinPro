/**
 * Who is offered what on an inter-branch transfer, at Bright Star with Ikeja
 * (branch 1) and Lekki (branch 2).
 *
 * Mrs Bello covers the whole school; Mrs Adeyemi works at Lekki alone. The
 * offers follow the server: the asked branch sends or declines a request, the
 * receiving branch confirms money arrived, and only somebody in both branches
 * voids. Goods, a shared bank split, a recharge share and income given back
 * are never voided here, and each says why.
 */

import { describe, expect, it } from "vitest";

import type { InterBranchTransfer } from "@/redux/services/finance/interbranch-types";
import {
  stageLabel, transferActions, transferMeaning, voidBlockedByKind, voidConditions, voidReachNote,
  type TransferKeys,
} from "./transfer-actions";

const IKEJA = 1;
const LEKKI = 2;

const base: InterBranchTransfer = {
  id: 9, document_number: "IBT-0009", kind: "CASH", kind_label: "Cash", status: "POSTED", stage: "SENT",
  branch_id: IKEJA, branch_name: "Ikeja", to_branch_id: LEKKI, to_branch_name: "Lekki",
  amount: 100_000_000, transfer_date: "2026-01-10", purpose: "Salaries", reference: "", repay_by: null,
  from_bank_account_id: 3, from_bank_account_name: "Ikeja GTBank", to_bank_account_id: 4,
  to_bank_account_name: "Lekki Access", customer_id: null, customer_name: null, held_receipt_id: null,
  receipt_id: null, recharge_id: null, requested_at: null, sent_at: "2026-01-10T09:00:00Z", received_at: null,
  arrival_date: null, declined_at: null, decline_reason: "", journals: [],
};
const t = (over: Partial<InterBranchTransfer>): InterBranchTransfer => ({ ...base, ...over });

const ALL: TransferKeys = { transfer: true, confirm: true, reverse: true };
const bello = { covers: () => true };
const adeyemi = { covers: (ids: number[]) => ids.length > 0 && ids.every((id) => id === LEKKI) };
const ikejaBursar = { covers: (ids: number[]) => ids.length > 0 && ids.every((id) => id === IKEJA) };

describe("money sent from Ikeja to Lekki", () => {
  const sent = t({});

  it("offers Lekki confirm arrival, and nothing else", () => {
    expect(transferActions(sent, ALL, adeyemi)).toEqual(["confirm"]);
  });

  it("offers Ikeja's own bursar nothing: arrival is Lekki's word, and a void needs both", () => {
    expect(transferActions(sent, ALL, ikejaBursar)).toEqual([]);
    expect(voidReachNote(sent, ALL, ikejaBursar)).toBe("Voiding changes both Ikeja's and Lekki's books, so it needs somebody who works in both.");
  });

  it("offers the whole-school bursar confirm and void", () => {
    expect(transferActions(sent, ALL, bello)).toEqual(["confirm", "void"]);
    expect(voidReachNote(sent, ALL, bello)).toBeNull();
  });

  it("stops offering confirm once it arrived", () => {
    expect(transferActions(t({ received_at: "2026-01-11T09:00:00Z", stage: "RECEIVED" }), ALL, bello)).toEqual(["void"]);
  });

  it("offers nothing without the keys", () => {
    expect(transferActions(sent, { transfer: false, confirm: false, reverse: false }, bello)).toEqual([]);
  });
});

describe("Lekki's request to Ikeja", () => {
  const request = t({
    status: "DRAFT", stage: "REQUESTED", requested_at: "2026-01-09T09:00:00Z",
    from_bank_account_id: null, from_bank_account_name: null, sent_at: null,
  });

  it("offers Ikeja send and decline", () => {
    expect(transferActions(request, ALL, ikejaBursar)).toEqual(["send", "decline"]);
  });

  it("offers Lekki, who asked, nothing to do but wait", () => {
    expect(transferActions(request, ALL, adeyemi)).toEqual([]);
  });

  it("is never voided, because nothing was booked", () => {
    expect(transferActions(request, ALL, bello)).toEqual(["send", "decline"]);
  });
});

describe("kinds that are not voided here", () => {
  it("says why a shared bank split's difference is never voided", () => {
    const split = t({ kind: "BANK_SPLIT" });
    expect(transferActions(split, ALL, bello)).toEqual([]);
    expect(voidBlockedByKind(split)).toMatch(/never voided: settle it with a cash transfer the other way/);
  });

  it("sends a recharge share to its recharge, goods back by stock transfer", () => {
    expect(voidBlockedByKind(t({ kind: "RECHARGE" }))).toMatch(/Void the recharge instead/);
    expect(voidBlockedByKind(t({ kind: "GOODS" }))).toMatch(/stock transfer the other way/);
  });

  it("names the document that gave income back", () => {
    expect(voidBlockedByKind(t({ kind: "INCOME_GIVEN_BACK", reference: "credit note CN-0042" })))
      .toBe("This is voided only with the document that gave the income back (credit note CN-0042). Void that document instead.");
  });

  it("lets a receivable move be voided, and says when it is refused", () => {
    const move = t({ kind: "RECEIVABLE", customer_name: "Tunde Bello" });
    expect(transferActions(move, ALL, bello)).toEqual(["void"]);
    expect(voidConditions(move)).toMatch(/Refused once anything moved has been paid, credited or released at Lekki/);
  });
});

describe("words", () => {
  const money = (kobo: number) => `N${kobo / 100}`;

  it("says who owes whom", () => {
    expect(transferMeaning(t({}), money)).toBe("Ikeja sends N1000000 to Lekki, and Lekki owes Ikeja until it is repaid.");
    expect(transferMeaning(t({ kind: "BANK_SPLIT", amount: 400_000 }), money))
      .toBe("When a shared bank account was split, Lekki kept N4000 of Ikeja's cash, and owes it.");
  });

  it("reads a booked balance transfer as booked, and money sent as not yet confirmed", () => {
    expect(stageLabel(t({ kind: "RECHARGE" }))).toBe("Booked");
    expect(stageLabel(t({}))).toBe("Sent, not yet confirmed");
  });
});
