/**
 * Mr Okafor paid N300,000 at Ikeja's desk for Emeka's Lekki bill. Ikeja, which
 * received it, forwards it or voids it; nobody may void it once a transfer is
 * forwarding it.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/redux/services/finance/interbranch-api", () => ({}));

import type { HeldReceipt } from "@/redux/services/finance/interbranch-types";
import { heldActions } from "./held-receipts-tab";

const HELD: HeldReceipt = {
  id: 4, document_number: "HR-0004", status: "POSTED", branch_id: 1, branch_name: "Ikeja",
  for_branch_id: 2, for_branch_name: "Lekki", bank_account_id: 3, bank_account_name: "Ikeja GTBank",
  customer_id: 8, customer_name: "Mr Okafor", amount: 30_000_000, receipt_date: "2026-01-12",
  method: "BANK_TRANSFER", reference: "", narration: "", journal_id: 90, forwarded_by: null,
};
const ikeja = (ids: number[]) => ids.length > 0 && ids.every((id) => id === 1);
const lekki = (ids: number[]) => ids.length > 0 && ids.every((id) => id === 2);
const keys = { canForward: true, canVoid: true };

describe("a held receipt's actions", () => {
  it("are Ikeja's, the branch that received the money", () => {
    expect(heldActions(HELD, { ...keys, covers: ikeja })).toEqual({ forward: true, void: true });
    expect(heldActions(HELD, { ...keys, covers: lekki })).toEqual({ forward: false, void: false });
  });

  it("stop once a transfer forwards it, and once it is voided", () => {
    const forwarding = { ...HELD, forwarded_by: { id: 70, document_number: "IBT-0070", status: "PENDING_APPROVAL" } };
    expect(heldActions(forwarding, { ...keys, covers: ikeja })).toEqual({ forward: false, void: false });
    expect(heldActions({ ...HELD, status: "REVERSED" }, { ...keys, covers: ikeja })).toEqual({ forward: false, void: false });
  });

  it("follow the keys", () => {
    expect(heldActions(HELD, { canForward: false, canVoid: true, covers: ikeja })).toEqual({ forward: false, void: true });
  });
});
